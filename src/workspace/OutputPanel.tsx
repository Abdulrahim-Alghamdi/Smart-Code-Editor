import { useEffect, useRef, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { iconButton, input, labelButton, outlineButton } from '@/lib/ui'
import { LANGUAGES } from '@/lib/languages'
import { supabase } from '@/lib/supabase'
import type { WorkspaceCopy } from './copy'
import { environmentTip } from './environmentTips'
import { inputMode, MISSING_INPUT, prepareInput, RUN_LIMIT_MS, SERVER_RUN } from './run'
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

// يُحقن قبل كود المستخدم: يرسل console و alert والأخطاء للصفحة الأم لتعرضها.
// prompt لا يستطيع إيقاف الصفحة هنا: عند نفاد الإجابات يطلب إجابة ويوقف السكربت، ثم تُعاد الصفحة من أولها بكل الإجابات
const capture = (answers: (string | null)[]) => `<script>(() => {
  const show = (v) => { if (typeof v === 'string') return v; try { return JSON.stringify(v) ?? String(v) } catch { return String(v) } }
  const send = (level, args) => parent.postMessage({ sceConsole: true, level, text: args.map(show).join(' ') }, '*')
  for (const level of ['log', 'info', 'warn', 'error']) { const original = console[level]; console[level] = (...a) => { send(level, a); original.apply(console, a) } }
  window.alert = (m) => send('log', [m])
  const answers = ${JSON.stringify(answers).replace(/</g, '\\u003c')}
  const stop = 'sce-input-needed'
  window.prompt = (message = '') => {
    if (message) send('log', [message])
    if (!answers.length) {
      parent.postMessage({ sceConsole: true, ask: true }, '*')
      throw stop
    }
    const answer = answers.shift()
    if (answer !== null) send('input', [answer])
    return answer
  }
  addEventListener('error', (e) => { if (!String(e.message).includes(stop)) send('error', [e.message]) })
  addEventListener('unhandledrejection', (e) => { if (e.reason !== stop) send('error', [String(e.reason)]) })
})()</script>`

// HTML يُعرض كما هو (السكربت بعد doctype حتى لا تدخل الصفحة وضع quirks)، و JavaScript يعمل داخل صفحة فارغة
const page = (language: string, code: string, answers: (string | null)[]) =>
  language === 'html'
    ? code.replace(/^(\s*<!doctype[^>]*>)?/i, (doctype) => doctype + capture(answers))
    : `<!doctype html><meta charset="utf-8">${capture(answers)}<script>${code.replace(/<\/script/gi, '<\\/script')}</script>`

const MAX_LINES = 500

interface Props {
  name: string
  language: string
  code: string
  // مدخلات وضع collect كما كتبها المستخدم؛ بقية الأوضاع تطلبها أثناء التشغيل
  stdin: string
  onStdin: (value: string) => void
  // true: البرنامج يقرأ مدخلات ولم تُكتب بعد، فتعرض اللوحة الإرشاد بدل تشغيل سيفشل
  waiting: boolean
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
export function OutputPanel({ name, language, code, stdin, onStdin, waiting, fresh, onRerun, onRunFresh, onClose, copy }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [lines, setLines] = useState<Line[]>([])
  const html = language === 'html'
  // بايثون و SQL في Worker داخل المتصفح؛ جافا و C++ وغيرهما على الخادم (دالة run ← Wandbox)؛ HTML و JavaScript في iframe
  const engine: Engine | null = language === 'python' || language === 'sql' ? language : null
  const server = SERVER_RUN.includes(language)
  // loading: أول تشغيل ينتظر تحميل المحرك؛ running: الكود يعمل
  const [phase, setPhase] = useState<'loading' | 'running' | 'done'>((engine || server) && !waiting ? 'running' : 'done')
  const running = phase !== 'done'
  const [time, setTime] = useState<string | null>(null)
  const [cached, setCached] = useState(false)
  // ثوانٍ منذ الإرسال للخادم، تُعرض حية حتى لا يبدو الانتظار متجمداً
  const [elapsed, setElapsed] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const mode = inputMode(language, code)
  // replay: الإجابات المرسلة حتى الآن، وكل إضافة تعيد التشغيل من أوله. null في JavaScript: إلغاء prompt
  const [inputs, setInputs] = useState<(string | null)[]>([])
  const [asking, setAsking] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  // live: إرسال سطر للبرنامج المنتظر، وقيم كُتبت دفعة واحدة تنتظر قراءاته التالية
  const answer = useRef<(line: string | null) => void>(() => {})
  const queue = useRef<string[]>([])
  const asked = useRef(false)
  // replay: ما عُرض من مخرجات البرنامج، وخطأ نفاد المدخلات يُعرض إن أنهى المستخدم الإدخال
  const seen = useRef('')
  const failure = useRef<Line[]>([])
  // Lenis يلتقط العجلة قبل القائمة فيحرّك الصفحة، فيُستثنى منها ما يتمرر فعلاً. مخرجات قصيرة تترك العجلة للصفحة
  const listRef = useRef<HTMLOListElement>(null)
  const [scrollable, setScrollable] = useState(false)

  const echo =(values: string[]) => setLines((all) => [...all, ...values.map((text) => ({ level: 'input', text }))].slice(-MAX_LINES))
  // live: يعطي البرنامج القيمة التالية، أو يعرض حقل الإدخال إن لم تبق قيم
  const feed = () => {
    const line = queue.current.shift()
    setAsking(line === undefined)
    if (line === undefined) return
    echo([line])
    answer.current(line)
  }
  const send = () => {
    const values = prepareInput(language, code, field.current?.value ?? '').split('\n')
    if (mode === 'live') {
      queue.current = values
      return feed()
    }
    setAsking(false)
    setCached(false)
    setTime(null)
    if (server) {
      echo(values)
      setPhase('running')
    } else {
      // الصفحة تعيد عرض الأسطر كلها مع إجاباتها
      setLines([])
    }
    setInputs((all) => [...all, ...values])
  }
  const endInput = () => {
    setAsking(false)
    if (mode === 'live') answer.current(null)
    else if (server) setLines((all) => [...all, ...failure.current])
    else {
      setLines([])
      setInputs((all) => [...all, null])
    }
  }

  useEffect(() => {
    const list = listRef.current
    setScrollable(Boolean(list && list.scrollHeight > list.clientHeight))
  }, [lines, asking])

  useEffect(() => {
    if (!server || !running) return
    const started = performance.now()
    const timer = setInterval(() => setElapsed((performance.now() - started) / 1000), 100)
    return () => clearInterval(timer)
  }, [server, running])

  useEffect(() => {
    if ((!engine && !server) || waiting) return
    const sent = mode === 'replay' ? inputs.join('\n') : mode === 'collect' ? prepareInput(language, code, stdin) : ''
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
    // replay: يعرض الجديد فقط من مخرجات هذه الجولة، ونفاد المدخلات يعني أن البرنامج يسأل لا أنه فشل
    const showRound = (result: Line[]) => {
      const stdout = result.find((line) => line.level === 'log')?.text ?? ''
      const chunk = (stdout.startsWith(seen.current) ? stdout.slice(seen.current.length) : stdout).replace(/\n$/, '')
      seen.current = stdout
      const rest = result.filter((line) => line.level !== 'log')
      const fresh = chunk ? [{ level: 'log', text: chunk }] : []
      if (rest.some((line) => MISSING_INPUT.test(line.text))) {
        failure.current = rest
        setAsking(true)
        setLines((all) => [...all, ...fresh])
      } else {
        setLines((all) => [...all, ...fresh, ...rest])
      }
    }
    const finish = (result: { lines?: Line[]; time: string | null; cache?: string }) => {
      if (result.lines) {
        collected.push(...result.lines)
        if (mode === 'replay') showRound(result.lines)
        else setLines(result.lines)
      }
      setTime(result.time)
      setPhase('done')
      if (result.cache) putCachedRun(result.cache, { lines: collected.slice(-MAX_LINES), time: result.time })
    }

    void (async () => {
      // الكود نفسه شُغّل من قبل: النتيجة المحفوظة فوراً، بلا تحميل محرك ولا طلب للخادم
      // المدخلات جزء من المفتاح: البرنامج نفسه بمدخلات أخرى نتيجته مختلفة
      // live بمفتاح خاص: نتيجة قديمة حُفظت بلا مدخلات ستُظهر خطأً بدل سؤال المستخدم
      const key = await runKey(language, name, `${code}\0${mode === 'live' ? 'live' : sent}`)
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
        const run = runInWorker(engine, code, name, sent, {
          onReady: () => {
            started = performance.now()
            setPhase('running')
          },
          // print يرسل السطر بلا \n الأخير؛ السطر الفارغ يبقى سطراً
          onLine: (level, text) => addLine({ level, text: text || ' ' }),
          onAsk: () => {
            asked.current = true
            feed()
          },
        })
        answer.current = run.answer
        stop = run.stop
        const end = await run.done
        // stopped = هذه اللوحة أوقفته عند إغلاقها أو إعادة تركيبها، فلا تُحدَّث حالتها
        if (end === 'stopped' || !alive) return
        if (end === 'loadFailed') addLine({ level: 'error', text: copy.engineLoadFailed })
        const seconds = end === 'loadFailed' ? null : ((performance.now() - started) / 1000).toFixed(2)
        setAsking(false)
        // فشل التحميل ليس نتيجة الكود، وجلسة تفاعلية لا تتكرر بالمفتاح نفسه، فلا يُحفظان
        return finish({ time: seconds, cache: end === 'done' && !asked.current ? key : undefined })
      }

      // مهلة صارمة للتشغيل كله (إعادة المحاولة ضمنها)، وإغلاق اللوحة يلغي الطلب
      const deadline = performance.now() + RUN_LIMIT_MS
      const controller = new AbortController()
      stop = () => controller.abort()
      const call = () =>
        supabase.functions.invoke<RunResult>('run', {
          body: { language, code, name, fresh, stdin: sent },
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
    // تشغيل واحد لكل لوحة، وجولة أخرى لكل إجابة في replay: App يعيد تركيبها بمفتاح جديد عند "تشغيل من جديد"
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs])

  const tip = environmentTip(language, lines)

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
      if (e.data.ask) return setAsking(true)
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
      {mode === 'collect' && (
        <div className="flex items-end gap-2 border-b border-line p-2">
          <label className="min-w-0 flex-1 text-xs text-ink-2">
            {copy.programInput}
            <textarea
              dir="auto"
              rows={4}
              autoFocus={waiting}
              data-lenis-prevent
              defaultValue={stdin}
              maxLength={100_000}
              placeholder={copy.programInputHint}
              onChange={(e) => onStdin(e.target.value)}
              className={`${input} block min-h-20 max-h-40 resize-none field-sizing-content font-mono text-xs`}
            />
          </label>
          <button type="button" onClick={onRerun} disabled={!code.trim()} className={`${outlineButton} shrink-0`}>
            {copy.runProgram}
          </button>
        </div>
      )}
      {(waiting || lines.some((line) => MISSING_INPUT.test(line.text))) && (
        <p role="status" dir="auto" className="border-b border-line px-3 py-2 text-xs text-amber-300">
          {copy.inputMissing}
        </p>
      )}
      {!server && !engine && (
        <iframe
          ref={frameRef}
          title={copy.outputFrame(name)}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={page(language, code, inputs)}
          hidden={!html}
          className="h-[40vh] w-full bg-white"
        />
      )}
      {!waiting && (!html || lines.length > 0) && (
        <ol ref={listRef} dir="ltr" aria-live="polite" aria-busy={running && !asking} data-lenis-prevent={scrollable || undefined} className={`max-h-60 overflow-auto ${scrollable ? 'overscroll-contain' : ''} p-3 font-mono text-xs leading-5 ${html ? 'border-t border-line' : ''}`}>
          {/* مخرجات بايثون و SQL تظهر أثناء التشغيل، والمؤشر تحتها حتى ينتهي */}
          {lines.map((line, i) => (
            <li key={i} className={`whitespace-pre-wrap break-words ${line.level === 'error' ? 'text-red-400' : line.level === 'warn' ? 'text-amber-300' : line.level === 'input' ? 'text-accent' : 'text-ink'}`}>
              {line.level === 'input' && '› '}
              {line.text}
            </li>
          ))}
          {running && !asking ? (
            <li className="flex items-center gap-2 text-ink-2">
              <span className="size-3 animate-spin rounded-full border-2 border-line-strong border-t-accent" aria-hidden="true" />
              <span className="tabular-nums">{status}</span>
            </li>
          ) : (
            lines.length === 0 && !asking && !running && <li className="text-ink-2">{server || engine ? copy.outputNothing : copy.outputEmpty}</li>
          )}
        </ol>
      )}
      {tip && (
        <div role="status" dir="auto" className="border-t border-line px-3 py-2 text-xs">
          <p className="flex items-center gap-1.5 font-medium text-ink">
            <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-amber-300" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
            </svg>
            {copy.environment.title}
          </p>
          <p className="mt-1 text-ink-2">{copy.environment.reasons[tip.reason]}</p>
          <p className="mt-1 text-ink-2">
            {copy.environment.recommended}: {/* bdi: فاصلة بين اسمين إنجليزيين لا تقلب ترتيبهما في الواجهة العربية */}
            <bdi dir="ltr" className="font-medium text-ink">
              {tip.tools.join(', ')}
            </bdi>
          </p>
        </div>
      )}
      {asking && (
        <div className="border-t border-line p-2">
          <p role="status" dir="auto" className="flex items-center gap-2 px-1 text-xs font-medium text-accent">
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden="true" />
            {copy.waitingForInput}
            {mode === 'replay' && server && <span className="font-normal text-ink-2">{copy.replayHint}</span>}
          </p>
          <div className="mt-1 flex flex-wrap items-end gap-2">
            <textarea
              ref={field}
              dir="auto"
              rows={1}
              autoFocus
              data-lenis-prevent
              aria-label={copy.programInput}
              placeholder={copy.inputHint}
              maxLength={100_000}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send()
                } else if (e.key.toLowerCase() === 'd' && e.ctrlKey) {
                  e.preventDefault()
                  endInput()
                }
              }}
              className={`${input} mt-0! block max-h-32 min-w-40 flex-1 resize-none field-sizing-content font-mono text-xs`}
            />
            <button type="button" onClick={send} className={outlineButton}>
              {copy.sendInput}
            </button>
            <button type="button" onClick={endInput} title="Ctrl+D" className={labelButton}>
              {copy.endInput}
            </button>
          </div>
        </div>
      )}
      {(time || cached) && !asking && (
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
