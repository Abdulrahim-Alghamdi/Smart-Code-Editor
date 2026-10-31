// تشغيل الكود داخل Worker: بايثون (Pyodide) و SQL (sql.js). الـ Worker يبقي الصفحة تستجيب أثناء التشغيل،
// وإنهاؤه هو الطريقة الوحيدة لإيقاف حلقة لا تنتهي
export type Engine = 'python' | 'sql'

export type WorkerMessage =
  | { type: 'ready' }
  | { type: 'line'; level: 'log' | 'error'; text: string }
  | { type: 'done'; error?: string; loadFailed?: boolean }

// مهلة التشغيل بعد جاهزية المحرك (لا يُحسب وقت تحميله الأول)
const TIME_LIMIT_MS = 15_000

// Worker واحد لكل محرك: يُحمَّل فيه مرة ويبقى للتشغيلات التالية، ويُعاد إنشاؤه فقط بعد إيقاف قسري
const workers = new Map<Engine, Worker>()
const loaded = new Set<Engine>()

export const engineLoaded = (engine: Engine) => loaded.has(engine)

// new URL حرفي في كل فرع حتى يجد Vite ملف الـ Worker ويبنيه
const create = (engine: Engine) =>
  engine === 'python'
    ? new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' })
    : new Worker(new URL('./sql.worker.ts', import.meta.url), { type: 'module' })

export type RunEnd = 'done' | 'timeout' | 'loadFailed' | 'stopped'

interface Handlers {
  onReady: () => void
  onLine: (level: 'log' | 'error', text: string) => void
}

export function runInWorker(engine: Engine, code: string, filename: string, { onReady, onLine }: Handlers) {
  const current = workers.get(engine) ?? create(engine)
  workers.set(engine, current)
  let timer: ReturnType<typeof setTimeout> | undefined
  let finished = false
  let resolveDone: (end: RunEnd) => void = () => {}
  const done = new Promise<RunEnd>((resolve) => (resolveDone = resolve))
  const finish = (end: RunEnd) => {
    if (finished) return
    finished = true
    clearTimeout(timer)
    current.removeEventListener('message', receive)
    resolveDone(end)
  }

  // التشغيل التالي ينشئ Worker جديداً ويحمّل المحرك من جديد
  const kill = (end: RunEnd) => {
    current.terminate()
    if (workers.get(engine) === current) {
      workers.delete(engine)
      loaded.delete(engine)
    }
    finish(end)
  }

  function receive(event: MessageEvent<WorkerMessage>) {
    const message = event.data
    if (message.type === 'ready') {
      loaded.add(engine)
      onReady()
      timer = setTimeout(() => kill('timeout'), TIME_LIMIT_MS)
    } else if (message.type === 'line') {
      onLine(message.level, message.text)
    } else {
      if (message.error) onLine('error', message.error)
      finish(message.loadFailed ? 'loadFailed' : 'done')
    }
  }

  current.addEventListener('message', receive)
  current.postMessage({ code, filename })
  // stop عند إغلاق اللوحة أو "تشغيل من جديد" أثناء العمل؛ لا يفعل شيئاً بعد انتهاء التشغيل
  return {
    done,
    stop: () => {
      if (!finished) kill('stopped')
    },
  }
}
