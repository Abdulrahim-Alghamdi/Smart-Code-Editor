// Python في المتصفح عبر Pyodide (WebAssembly). يعمل في Worker حتى لا تجمّد حلقة لا تنتهي الصفحة، فيُوقف بإنهاء الـ Worker.
// Pyodide يُحمَّل من CDN عند أول تشغيل فقط، ويبقى جاهزاً للتشغيلات التالية ما دام الـ Worker حياً
import type { Line, WorkerMessage } from './workerRunner'

const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/'

interface PyProxy {
  destroy(): void
}
interface Pyodide {
  setStdout(handler: { batched: (text: string) => void }): void
  setStderr(handler: { batched: (text: string) => void }): void
  loadPackagesFromImports(code: string): Promise<unknown>
  runPythonAsync(code: string, options: { globals: PyProxy; filename: string }): Promise<unknown>
  globals: { get(name: string): () => PyProxy }
}

const post = (message: WorkerMessage) => (self as unknown as Worker).postMessage(message)

// حلقة طباعة ترسل أسرع مما ترسم الصفحة، فتتراكم الرسائل وتتجمد الصفحة حتى عن زر الإغلاق. الأسطر القليلة تُرسل فوراً،
// وما زاد عنها في النافذة الزمنية يُجمع في رسالة واحدة ويبقى منه ما تعرضه لوحة المخرجات (MAX_LINES)
const WINDOW_MS = 100
const LINES_PER_WINDOW = 5
const MAX_HELD = 500
let held: Line[] = []
let sent = 0
let windowStart = 0

const flush = () => {
  if (held.length) post({ type: 'lines', lines: held })
  held = []
}

const write = (level: Line['level'], text: string) => {
  const now = performance.now()
  if (now - windowStart >= WINDOW_MS) {
    windowStart = now
    sent = 0
    flush()
  }
  if (sent++ < LINES_PER_WINDOW) return post({ type: 'line', level, text })
  held.push({ level, text })
  if (held.length > MAX_HELD) held.shift()
}

const load = async (): Promise<Pyodide> => {
  const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_URL}pyodide.mjs`)
  const pyodide: Pyodide = await loadPyodide({ indexURL: PYODIDE_URL })
  pyodide.setStdout({ batched: (text) => write('log', text) })
  pyodide.setStderr({ batched: (text) => write('error', text) })
  // كود المستخدم يرى هذا الـ Worker عبر `import js`؛ نخفي تخزين الموقع عنه (سجل النسخ والمسودات في IndexedDB).
  // shortcut: إخفاء لا عزل تام (يمكن تجاوزه عبر prototype)؛ جلسة الحساب في localStorage لا تصلها الـ Workers أصلاً. للعزل الكامل شغّل الـ Worker داخل iframe معزول
  for (const name of ['indexedDB', 'caches']) Object.defineProperty(self, name, { value: undefined })
  return pyodide
}

let ready: Promise<Pyodide> | null = null

self.onmessage = async (event: MessageEvent<{ code: string; filename: string }>) => {
  const { code, filename } = event.data
  let pyodide: Pyodide
  try {
    pyodide = await (ready ??= load())
  } catch (err) {
    // المحاولة التالية تعيد التحميل (مثلاً بعد عودة الاتصال)
    ready = null
    console.error(err)
    return post({ type: 'done', loadFailed: true })
  }
  post({ type: 'ready' })

  // متغيرات كل تشغيل في قاموس جديد، فلا يبقى شيء من التشغيل السابق
  const globals = pyodide.globals.get('dict')()
  try {
    // يحمّل حزم Pyodide التي يستوردها الكود (numpy مثلاً) قبل التشغيل
    await pyodide.loadPackagesFromImports(code)
    await pyodide.runPythonAsync(code, { globals, filename })
    flush()
    post({ type: 'done' })
  } catch (err) {
    flush()
    const message = err instanceof Error ? err.message : String(err)
    // يحذف من التتبع أسطر Pyodide الداخلية ويبقي أسطر ملف المستخدم والخطأ نفسه
    const own = message.indexOf(`  File "${filename}"`)
    post({ type: 'done', error: own > 0 ? `Traceback (most recent call last):\n${message.slice(own)}` : message })
  } finally {
    globals.destroy()
  }
}
