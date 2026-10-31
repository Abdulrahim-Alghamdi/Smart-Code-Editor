import { useEffect, useRef, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { iconButton } from '@/lib/ui'
import { supabase } from '@/lib/supabase'
import type { WorkspaceCopy } from './copy'
import { SERVER_RUN } from './run'

interface RunResult {
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

interface Line {
  level: string
  text: string
}

interface Props {
  name: string
  language: string
  code: string
  onRerun: () => void
  onClose: () => void
  copy: WorkspaceCopy
}

// كود المستخدم يعمل في iframe معزول (allow-scripts بلا allow-same-origin): لا يصل لجلسة الحساب ولا لتخزين الموقع.
// shortcut: حلقة لا تنتهي قد تجمّد التبويب في متصفح لا يعزل iframe في عملية مستقلة؛ أضف مهلة عبر Worker إن ظهرت شكاوى
export function OutputPanel({ name, language, code, onRerun, onClose, copy }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [lines, setLines] = useState<Line[]>([])
  const html = language === 'html'
  // بايثون وجافا وغيرهما تعمل على الخادم (دالة run ← Wandbox)، لا في المتصفح
  const server = SERVER_RUN.includes(language)
  const [running, setRunning] = useState(server)
  const [stats, setStats] = useState<string | null>(null)

  useEffect(() => {
    if (!server) return
    let alive = true
    supabase.functions.invoke<RunResult>('run', { body: { language, code } }).then(async ({ data, error }) => {
      if (!alive) return
      setRunning(false)
      if (data) {
        setLines(toLines(data))
        if (data.time) setStats(copy.runStats(data.time, data.memory))
        return
      }
      const reply = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null
      const text = !(error instanceof FunctionsHttpError) ? copy.runNetwork : reply?.error === 'limit' ? copy.runLimit : copy.runFailed(reply?.detail ?? error.context.status)
      if (alive) setLines([{ level: 'error', text }])
    })
    return () => {
      alive = false
    }
    // تشغيل واحد لكل لوحة: App يعيد تركيبها بمفتاح جديد عند "تشغيل من جديد"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      {!server && (
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
          {running ? (
            <li className="flex items-center gap-2 text-ink-2">
              <span className="size-3 animate-spin rounded-full border-2 border-line-strong border-t-accent" aria-hidden="true" />
              {copy.running}
            </li>
          ) : lines.length === 0 ? (
            <li className="text-ink-2">{server ? copy.outputNothing : copy.outputEmpty}</li>
          ) : (
            lines.map((line, i) => (
              <li key={i} className={`whitespace-pre-wrap break-words ${line.level === 'error' ? 'text-red-400' : line.level === 'warn' ? 'text-amber-300' : 'text-ink'}`}>
                {line.text}
              </li>
            ))
          )}
        </ol>
      )}
      {stats && <p className="border-t border-line px-3 py-1.5 text-[11px] tabular-nums text-ink-2">{stats}</p>}
    </section>
  )
}
