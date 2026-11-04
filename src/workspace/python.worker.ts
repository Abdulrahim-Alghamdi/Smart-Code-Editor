// Python في المتصفح عبر Pyodide (WebAssembly). يعمل في Worker حتى لا تجمّد حلقة لا تنتهي الصفحة، فيُوقف بإنهاء الـ Worker.
// Pyodide يُحمَّل من CDN عند أول تشغيل فقط، ويبقى جاهزاً للتشغيلات التالية ما دام الـ Worker حياً
import { LIVE_INPUT } from './run'
import type { Line, WorkerMessage } from './workerRunner'

const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/'

interface PyProxy {
  destroy(): void
}
interface Pyodide {
  setStdout(handler: { batched: (text: string) => void }): void
  setStderr(handler: { batched: (text: string) => void }): void
  setStdin(handler: { stdin: () => string | undefined }): void
  runPython(code: string): unknown
  registerJsModule(name: string, module: object): void
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

// قراءة stdin تنتظر الصفحة دون تجميد الـ Worker. يغطي input و readline والقراءة سطراً سطراً
const LIVE_STDIN = `
import io, os, sys
from pyodide.ffi import can_run_sync, run_sync
from sce_input import ask

class LiveStdin(io.TextIOBase):
    def readable(self):
        return True

    def readline(self, size=-1):
        if not can_run_sync():
            return ''
        sys.stdout.flush()
        os.fsync(1)
        line = run_sync(ask())
        return '' if line is None else line + '\\n'

    def read(self, size=-1):
        return ''.join(iter(self.readline, ''))

sys.stdin = LiveStdin()
`

let answer: ((line: string | undefined) => void) | null = null
const ask = () =>
  new Promise<string | undefined>((resolve) => {
    answer = resolve
    flush()
    post({ type: 'ask' })
  })

const load = async (): Promise<Pyodide> => {
  const { loadPyodide } = await import(/* @vite-ignore */ `${PYODIDE_URL}pyodide.mjs`)
  const pyodide: Pyodide = await loadPyodide({ indexURL: PYODIDE_URL })
  pyodide.setStdout({ batched: (text) => write('log', text) })
  pyodide.setStderr({ batched: (text) => write('error', text) })
  // كود المستخدم يرى هذا الـ Worker عبر `import js`؛ نخفي تخزين الموقع عنه (سجل النسخ والمسودات في IndexedDB).
  // shortcut: إخفاء لا عزل تام (يمكن تجاوزه عبر prototype)؛ جلسة الحساب في localStorage لا تصلها الـ Workers أصلاً. للعزل الكامل شغّل الـ Worker داخل iframe معزول
  for (const name of ['indexedDB', 'caches']) Object.defineProperty(self, name, { value: undefined })
  if (LIVE_INPUT) {
    pyodide.registerJsModule('sce_input', { ask })
    pyodide.runPython(LIVE_STDIN)
  }
  return pyodide
}

let ready: Promise<Pyodide> | null = null
let current: Pyodide | null = null

// خطأ قاتل داخل WebAssembly (pygame.init يطلب screen غير الموجود في Worker) يتجاوز catch أدناه ولا يصل done أبداً، فيبقى
// التشغيل معلقاً. runPython يميّزه عن خطأ عابر في كود المستخدم: المحرك الميت وحده يرفض كل تشغيل
const crash = (reason: unknown) => {
  if (!current) return
  try {
    current.runPython('0')
  } catch {
    current = null
    flush()
    post({ type: 'done', error: String(reason), fatal: true })
  }
}
self.addEventListener('error', (event) => crash(event.message))
self.addEventListener('unhandledrejection', (event) => crash(event.reason))

self.onmessage = async (event: MessageEvent<{ answer: string | null } | { code: string; filename: string; stdin: string }>) => {
  if ('answer' in event.data) return answer?.(event.data.answer ?? undefined)
  const { code, filename, stdin } = event.data
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

  // كل input() يأخذ سطراً، وبعد آخرها undefined تعني نهاية المدخلات (EOFError في بايثون)
  const inputLines = stdin ? stdin.replace(/\n$/, '').split('\n') : []
  if (!LIVE_INPUT) pyodide.setStdin({ stdin: () => inputLines.shift() })

  // متغيرات كل تشغيل في قاموس جديد، فلا يبقى شيء من التشغيل السابق
  const globals = pyodide.globals.get('dict')()
  // نص بلا سطر جديد (سؤال input مثلاً) يبقى معلقاً في Pyodide، ودون دفعه يظهر في أول التشغيل التالي
  const finish = () => {
    try {
      pyodide.runPython('import os, sys; sys.stdout.flush(); sys.stderr.flush(); os.fsync(1); os.fsync(2)')
    } catch {
      // كود المستخدم قد يغلق sys.stdout؛ لا يمنع ذلك إنهاء التشغيل
    }
    flush()
  }
  try {
    // يحمّل حزم Pyodide التي يستوردها الكود (numpy مثلاً) قبل التشغيل
    await pyodide.loadPackagesFromImports(code)
    current = pyodide
    await pyodide.runPythonAsync(code, { globals, filename })
    finish()
    post({ type: 'done' })
  } catch (err) {
    finish()
    const message = err instanceof Error ? err.message : String(err)
    // يحذف من التتبع أسطر Pyodide الداخلية ويبقي أسطر ملف المستخدم والخطأ نفسه
    const own = message.indexOf(`  File "${filename}"`)
    post({ type: 'done', error: own > 0 ? `Traceback (most recent call last):\n${message.slice(own)}` : message })
  } finally {
    current = null
    globals.destroy()
  }
}
