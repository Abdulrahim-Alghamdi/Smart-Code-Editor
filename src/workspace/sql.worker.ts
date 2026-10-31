// SQL في المتصفح عبر sql.js (SQLite مترجم لـ WebAssembly)، بلا طلب للخادم. كل تشغيل على قاعدة جديدة فارغة،
// فالكود ينشئ جداوله بنفسه كما في الأمثلة. ملف wasm يُحمَّل عند أول تشغيل فقط
import initSqlJs, { type SqlJsStatic, type SqlValue } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url'
import type { WorkerMessage } from './workerRunner'

const post = (message: WorkerMessage) => (self as unknown as Worker).postMessage(message)

// صفوف أكثر من هذا تُختصر برسالة، حتى لا يثقل جدول ضخم لوحة المخرجات
const MAX_ROWS = 200

const cell = (value: SqlValue) => (value === null ? 'NULL' : value instanceof Uint8Array ? `<blob ${value.length} bytes>` : String(value))

// جدول بأعمدة محاذاة مثل sqlite3 -column، ثم عدد الصفوف
const table =(columns: string[], rows: SqlValue[][]) => {
  const cells = [columns, ...rows.slice(0, MAX_ROWS).map((row) => row.map(cell))]
  const widths = columns.map((_, i) => Math.max(...cells.map((row) => row[i].length)))
  const line = (row: string[]) => row.map((text, i) => text.padEnd(widths[i])).join(' | ').trimEnd()
  const more = rows.length > MAX_ROWS ? [`… ${rows.length - MAX_ROWS} more rows`] : []
  const count = rows.length === 1 ? '(1 row)' : `(${rows.length} rows)`
  return [line(cells[0]), widths.map((w) => '-'.repeat(w)).join('-+-'), ...cells.slice(1).map(line), ...more, count].join('\n')
}

let ready: Promise<SqlJsStatic> | null = null

self.onmessage = async (event: MessageEvent<{ code: string }>) => {
  let SQL: SqlJsStatic
  try {
    SQL = await (ready ??= initSqlJs({ locateFile: () => wasmUrl }))
  } catch (err) {
    ready = null
    console.error(err)
    return post({ type: 'done', loadFailed: true })
  }
  post({ type: 'ready' })

  const db = new SQL.Database()
  try {
    // جملة جملة: نتائج الاستعلامات قبل الخطأ تظهر، ثم الخطأ نفسه
    for (const statement of db.iterateStatements(event.data.code)) {
      const columns = statement.getColumnNames()
      const rows: SqlValue[][] = []
      while (statement.step()) rows.push(statement.get())
      statement.free()
      // CREATE و INSERT بلا أعمدة ناتجة، فلا يُطبع لها شيء
      if (columns.length) post({ type: 'line', level: 'log', text: table(columns, rows) })
    }
    post({ type: 'done' })
  } catch (err) {
    post({ type: 'done', error: `Error: ${err instanceof Error ? err.message : String(err)}` })
  } finally {
    db.close()
  }
}
