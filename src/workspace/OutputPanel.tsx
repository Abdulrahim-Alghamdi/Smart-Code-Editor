import { useEffect, useRef, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { iconButton } from '@/lib/ui'
import { LANGUAGES } from '@/lib/languages'
import { supabase } from '@/lib/supabase'
import type { WorkspaceCopy } from './copy'
import { RUN_LIMIT_MS, SERVER_RUN } from './run'
import { getCachedRun, putCachedRun, runKey, type Line } from './runCache'
import { engineLoaded, runInWorker, type Engine } from './workerRunner'

interface RunResult {
  // true: الدالة أعادت نتيجة محفوظة لديها لهذا الكود
  cached?: boolean
  stdout: string
  stderr: string
  compileOutput: string
  message: string
  // null عند انتهاء البرنامج طبيعياً، وإلا السبب مثل "Time Limit Exceeded"
  status: string | null
  time: string | null
  memory: number | null
}

// ناتج خادم التشغيل بالترتيب الذي يحتاجه القارئ: خطأ الترجمة أولاً، ثم المخرجات، ثم الأخطاء وسبب التوقف
const toLines = (r: RunResult): Line[] =>
  [
    { level: 'error', text: r.compileOutput },
    { level: 'log', text: r.stdout },
    { level: 'error', text: r.stderr },
    { level: 'warn', text: r.message },
    { level: 'warn', text: r.status ?? '' },
  ].filter((line) => line.text.trim())

// يُحقن قبل كود المستخدم: يرسل console و alert والأخطاء للصفحة الأم لتعرضها
const CAPTURE = `<script>(() => {
  const show = (v) => { if (typeof v === 'string') return v; try { return JSON.stringify(v) ?? String(v) } catch { return String(v) } }
  const send = (level, args) => parent.postMessage({ sceConsole: true, level, text: args.map(show).join(' ') }, '*')
  for (const level of ['log', 'info', 'warn', 'error']) { const original = console[level]; console[level] = (...a) => { send(level, a); original.apply(console, a) } }
  window.alert = (m) => send('log', [m])
  addEventListener('error', (e) => send('error', [e.message]))
  addEventListener('unhandledrejection', (e) => send('error', [String(e.reason)]))
})()</script>`

// HTML يُعرض كما هو (السكربت بعد doctype حتى لا تدخل الصفحة وضع quirks)، و JavaScript يعمل داخل صفحة فارغة
const page = (language: string, code: string) =>
  language === 'html'
    ? code.replace(/^(\s*<!doctype[^>]*>)?/i, (doctype) => doctype + CAPTURE)
    : `<!doctype html><meta charset="utf-8">${CAPTURE}<script>${code.replace(/<\/script/gi, '<\\/script')}</script>`

const MAX_LINES = 500

interface Props {
  name: string
  language: string
  code: string
  // true: يتجاهل النتيجة المحفوظة ويشغّل الكود فعلاً ("تشغيل جديد")
  fresh: boolean
  onRerun: () => void
  onRunFresh: () => void
  onClose: () => void
  copy: WorkspaceCopy
}

// لغات تُترجم قبل التشغيل على الخادم، فتظهر لها "ترجمة وتشغيل" بدل "تشغيل"
const COMPILED = ['java', 'c', 'cpp', 'csharp', 'go', 'rust', 'typescript']
// انتظار قبل إعادة المحاولة مرة عند انقطاع الاتصال بالدالة
const RETRY_DELAY_MS = 1_200

// كود المستخدم يعمل في iframe معزول (allow-scripts بلا allow-same-origin): لا يصل لجلسة الحساب ولا لتخزين الموقع.
// shortcut: حلقة لا تنتهي في JavaScript قد تجمّد التبويب في متصفح لا يعزل iframe في عملية مستقلة؛ انقله لـ Worker إن ظهرت شكاوى
export function OutputPanel({ name, language, code, fresh, onRerun, onRunFresh, onClose, copy }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [lines, setLines] = useState<Line[]>([])
  const html = language === 'html'
  // بايثون و SQL في Worker داخل المتصفح؛ جافا و C++ وغيرهما على الخادم (دالة run ← Wandbox)؛ HTML و JavaScript في iframe
  const engine: Engine | null = language === 'python' || language === 'sql' ? language : null
  const server = SERVER_RUN.includes(language)
  // loading: أول تشغيل ينتظر تحميل المحرك؛ running: الكود يعمل
  const [phase, setPhase] = useState<'loading' | 'running' | 'done'>(engine || server ? 'running' : 'done')
  const running = phase !== 'done'
  const [time, setTime] = useState<string | null>(null)
  const [cached, setCached] = useState(false)
  // ثوانٍ منذ الإرسال للخادم، تُعرض حية حتى لا يبدو الانتظار متجمداً
  const [elapsed, setElapsed] = useState(0)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    if (!server || !running) return
    const started = performance.now()
    const timer = setInterval(() => setElapsed((performance.now() - started) / 1000), 100)
    return () => clearInterval(timer)
  }, [server, running])

  useEffect(() => {
    if (!engine && !server) return
    let alive = true
    let stop = () => {}
    // نسخة محلية من الأسطر لحفظها في الكاش بعد الانتهاء
    const collected: Line[] = []
    const addLine = (line: Line) => {
      collected.push(line)
      // بلا مهلة، قد لا ينتهي البرنامج أبداً، فلا تكبر النسخة المحلية بلا حد
      if (collected.length > MAX_LINES) collected.shift()
      setLines((all) => [...all, line].slice(-MAX_LINES))
    }
    const finish = (result: { lines?: Line[]; time: string | null; cache?: string }) => {
      if (result.lines) {
        collected.push(...result.lines)
        setLines(result.lines)
      }
      setTime(result.time)
      setPhase('done')
      if (result.cache) putCachedRun(result.cache, { lines: collected.slice(-MAX_LINES), time: result.time })
    }

    void (async () => {
      // الكود نفسه شُغّل من قبل: النتيجة المحفوظة فوراً، بلا تحميل محرك ولا طلب للخادم
      const key = await runKey(language, name, code)
      if (!fresh) {
        const hit = await getCachedRun(key)
        if (!alive) return
        if (hit) {
          setCached(true)
          return finish({ lines: hit.lines, time: hit.time })
        }
      }
      if (!alive) return

      if (engine) {
        if (!engineLoaded(engine)) setPhase('loading')
        let started = 0
        const run = runInWorker(engine, code, name, {
          onReady: () => {
            started = performance.now()
            setPhase('running')
          },
          // print يرسل السطر بلا \n الأخير؛ السطر الفارغ يبقى سطراً
          onLine: (level, text) => addLine({ level, text: text || ' ' }),
        })
        stop = run.stop
        const end = await run.done
        // stopped = هذه اللوحة أوقفته عند إغلاقها أو إعادة تركيبها، فلا تُحدَّث حالتها
        if (end === 'stopped' || !alive) return
        if (end === 'loadFailed') addLine({ level: 'error', text: copy.engineLoadFailed })
        const seconds = end === 'loadFailed' ? null : ((performance.now() - started) / 1000).toFixed(2)
        // فشل التحميل ليس نتيجة الكود، فلا يُحفظ
        return finish({ time: seconds, cache: end === 'done' ? key : undefined })
      }

      // مهلة صارمة للتشغيل كله (إعادة المحاولة ضمنها)، وإغلاق اللوحة يلغي الطلب
      const deadline = performance.now() + RUN_LIMIT_MS
      const controller = new AbortController()
      stop = () => controller.abort()
      const call = () =>
        supabase.functions.invoke<RunResult>('run', {
          body: { language, code, name, fresh },
          timeout: Math.max(1, Math.floor(deadline - performance.now())),
          signal: controller.signal,
        })
      let { data, error } = await call()
      // بلا رد HTTP إطلاقاً (انقطاع بين المتصفح والدالة): محاولة واحدة أخرى بعد 1.2 ثانية إن بقي وقت يكفيها.
      // الدالة نفسها تعيد المحاولة مع Wandbox عند الانشغال أو أخطاء 5xx، فلا تُكرر هنا
      if (!data && !(error instanceof FunctionsHttpError) && alive && deadline - performance.now() > RETRY_DELAY_MS + 3_000) {
        setRetrying(true)
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
        if (!alive) return
        ;({ data, error } = await call())
      }
      if (!alive) return
      if (data) {
        if (data.cached) setCached(true)
        return finish({ lines: toLines(data), time: data.time, cache: key })
      }
      // أخطاء الخادم تُعرض برسالة واضحة بدل نصها الخام، ولا تُحفظ لأنها ليست نتيجة الكود
      const label = LANGUAGES.find((l) => l.id === language)?.label ?? language
      const reply = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null
      const timedOut = reply?.error === 'timeout' || (!reply && performance.now() >= deadline - 100)
      const text = timedOut
        ? copy.runTookTooLong(label, RUN_LIMIT_MS / 1000)
        : !(error instanceof FunctionsHttpError)
          ? copy.runNetwork
          : reply?.error === 'busy'
            ? copy.runBusy(label)
            : reply?.error === 'unavailable'
              ? copy.runUnavailable(label)
              : copy.runFailed(reply?.detail ?? error.context.status)
      if (alive) finish({ lines: [{ level: timedOut ? 'warn' : 'error', text }], time: null })
    })()

    return () => {
      alive = false
      stop()
    }
    // تشغيل واحد لكل لوحة: App يعيد تركيبها بمفتاح جديد عند "تشغيل من جديد"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const status =
    phase === 'loading'
      ? copy.engineLoading[engine ?? 'python']
      : retrying
        ? copy.runRetrying(LANGUAGES.find((l) => l.id === language)?.label ?? language)
        : server
          ? (COMPILED.includes(language) ? copy.serverCompiling : copy.serverRunning)(elapsed.toFixed(1))
        : copy.runningLocal

  useEffect(() => {
    const receive = (e: MessageEvent) => {
      // الرسالة من إطارنا فقط، ونصها يُعرض كنص لا كـ HTML
      if (e.source !== frameRef.current?.contentWindow || !e.data?.sceConsole) return
      setLines((all) => [...all, { level: String(e.data.level), text: String(e.data.text) }].slice(-MAX_LINES))
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [])

  return (
    <section aria-label={copy.output} className="mx-2 mt-2 overflow-hidden rounded-xl border border-line bg-page">
      <div className="flex items-center gap-2 border-b border-line py-1 ps-3 pe-1 text-xs text-ink-2">
        <span className="font-medium text-ink">{copy.output}</span>
        <span dir="ltr" className="min-w-0 truncate font-mono">
          {name}
        </span>
        <div className="ms-auto flex items-center">
          <button type="button" onClick={onRerun} aria-label={copy.rerun} title={copy.rerun} className={iconButton}>
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
            </svg>
          </button>
          <button type="button" onClick={onClose} aria-label={copy.closeOutput} title={copy.closeOutput} className={iconButton}>
            ✕
          </button>
        </div>
      </div>
      {!server && !engine && (
        <iframe
          ref={frameRef}
          title={copy.outputFrame(name)}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={page(language, code)}
          hidden={!html}
          className="h-[40vh] w-full bg-white"
        />
      )}
      {(!html || lines.length > 0) && (
        <ol dir="ltr" aria-live="polite" aria-busy={running} className={`max-h-60 overflow-auto p-3 font-mono text-xs leading-5 ${html ? 'border-t border-line' : ''}`}>
          {/* مخرجات بايثون و SQL تظهر أثناء التشغيل، والمؤشر تحتها حتى ينتهي */}
          {lines.map((line, i) => (
            <li key={i} className={`whitespace-pre-wrap break-words ${line.level === 'error' ? 'text-red-400' : line.level === 'warn' ? 'text-amber-300' : 'text-ink'}`}>
              {line.text}
            </li>
          ))}
          {running ? (
            <li className="flex items-center gap-2 text-ink-2">
              <span className="size-3 animate-spin rounded-full border-2 border-line-strong border-t-accent" aria-hidden="true" />
              <span className="tabular-nums">{status}</span>
            </li>
          ) : (
            lines.length === 0 && <li className="text-ink-2">{server || engine ? copy.outputNothing : copy.outputEmpty}</li>
          )}
        </ol>
      )}
      {(time || cached) && (
        <p className="flex items-center gap-2 border-t border-line px-3 py-1 text-[11px] tabular-nums text-ink-2">
          {cached ? copy.cachedStats(time) : time && copy.runStats(time, null)}
          {/* النتيجة المحفوظة قد لا تناسب برنامجاً عشوائياً أو يعتمد على الوقت، فيمكن تشغيله فعلاً */}
          {cached && (
            <button type="button" onClick={onRunFresh} className="ms-auto rounded px-1.5 py-0.5 text-accent hover:bg-surface">
              {copy.runFresh}
            </button>
          )}
        </p>
      )}
    </section>
  )
}
