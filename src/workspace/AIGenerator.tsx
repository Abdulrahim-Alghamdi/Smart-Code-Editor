import { useRef, useState, type RefObject } from 'react'
import type { OnMount } from '@monaco-editor/react'
import { supabase } from '@/lib/supabase'
import { accentButton, iconButton, outlineButton } from '@/lib/ui'
import type { WorkspaceCopy } from './copy'
import { readGenerated } from './fences'

type CodeEditor = Parameters<OnMount>[0]
type Mode = 'insert' | 'replace'

interface Props {
  editorRef: RefObject<CodeEditor | null>
  // اسم لغة الملف النشط كما يُعرض، مثل JavaScript
  language: string
  // يفتح للزائر نافذة إنشاء حساب ويعيد true؛ الدالة على الخادم ترفض غير المسجّلين
  needsAccount: () => boolean
  renewSession: () => Promise<boolean>
  keepVersion: (content: string) => unknown
  // يصل بعد كتابة الكود: Monaco لا يطلق حدث اللصق لأوامر executeEdits
  onInserted: (code: string) => void
  copy: WorkspaceCopy
}

// حالة النافذة كلها هنا، فالكتابة في الوصف لا تعيد رسم App والمحرر. الكود يدخل بأوامر Monaco نفسها،
// فيصل App عبر onChange مثل أي تعديل: تعمل المزامنة والسجل وCtrl+Z بلا مسار ثانٍ
export function AIGenerator({ editorRef, language, needsAccount, renewSession, keepVersion, onInserted, copy }: Props) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState<Mode | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Lines received so far, so a long file shows it is still being written
  const [lines, setLines] = useState(0)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const abort = useRef<AbortController | null>(null)
  const g = copy.generator

  const close = () => {
    abort.current?.abort()
    setOpen(false)
    setError(null)
    // preventScroll: عودة التركيز لا تحرّك الصفحة تحت Lenis
    toggleRef.current?.focus({ preventScroll: true })
  }

  const apply = (editor: CodeEditor, code: string, mode: Mode) => {
    const model = editor.getModel()!
    const before = model.getValue()
    // الاستبدال يُثبّت المحتوى في السجل أولاً، مثل كل فعل يستبدل الملف
    if (mode === 'replace' && before.trim()) keepVersion(before)
    const range = mode === 'replace' ? model.getFullModelRange() : editor.getSelection()!
    // نقطتا التوقف تجعلان Ctrl+Z يلغي الكود المولّد وحده
    editor.pushUndoStop()
    editor.executeEdits('ai-generator', [{ range, text: code, forceMoveMarkers: true }])
    editor.pushUndoStop()
    if (mode === 'replace') editor.setPosition({ lineNumber: 1, column: 1 })
    editor.revealPosition(editor.getPosition()!)
    onInserted(code)
  }

  const generate = async (mode: Mode) => {
    const editor = editorRef.current
    const model = editor?.getModel()
    const text = prompt.trim()
    if (!editor || !model || !text || busy) return
    const languageId = model.getLanguageId()
    const controller = new AbortController()
    abort.current = controller
    setBusy(mode)
    setError(null)
    setLines(0)
    // الزر المضغوط يُعطَّل الآن فيضيع منه التركيز، ومعه Escape والتعديل بعد خطأ
    promptRef.current?.focus({ preventScroll: true })
    const send = async () => {
      // getSession يجدد الرمز المنتهي قبل إعادته
      const { data } = await supabase.auth.getSession()
      return fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
        body: JSON.stringify({ prompt: text, language }),
        signal: controller.signal,
      })
    }
    try {
      let res = await send()
      if (res.status === 401) {
        if (!(await renewSession())) return close()
        res = await send()
      }
      if (!res.ok || !res.body) {
        const reply = await res.json().catch(() => null)
        if (controller.signal.aborted) return
        const message = g.errors[reply?.error as keyof typeof g.errors] ?? g.errors.request
        return setError(`${message} ${reply?.detail ?? `(${res.status})`}`)
      }
      // The code arrives as it is written; no deadline here, the server ends the stream itself
      let body = ''
      const decoder = new TextDecoder()
      const reader = res.body.getReader()
      for (let part = await reader.read(); !part.done; part = await reader.read()) {
        body += decoder.decode(part.value, { stream: true })
        setLines(body.split('\n').length)
      }
      if (controller.signal.aborted) return
      const reply = readGenerated(body + decoder.decode())
      if ('error' in reply) return setError(g.errors[reply.error as keyof typeof g.errors] ?? g.errors.request)
      // بدّل المستخدم الملف أو لغته أثناء الانتظار: الكود لم يُكتب لهذا الملف، فلا يُكتب فيه
      if (editor.getModel() !== model || model.getLanguageId() !== languageId) return setError(g.errors.fileChanged)
      apply(editor, reply.code, mode)
      setPrompt('')
      setOpen(false)
      editor.focus()
    } catch {
      if (!controller.signal.aborted) setError(g.errors.network)
    } finally {
      // طلب أُلغي وحل محله أحدث لا يغيّر حالة الانتظار
      if (abort.current === controller) {
        abort.current = null
        setBusy(null)
      }
    }
  }

  const sparkle = (
    <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16v4M17 18h4" />
    </svg>
  )

  return (
    <>
      {/* Tinted orange with its name always shown, so a first-time visitor spots it among the grey toolbar icons */}
      <button
        ref={toggleRef}
        type="button"
        onClick={() => (open ? close() : !needsAccount() && setOpen(true))}
        aria-expanded={open}
        title={g.open}
        className="ms-auto flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/15 px-2.5 text-xs font-medium whitespace-nowrap text-accent transition-colors hover:bg-accent/25 aria-expanded:bg-accent aria-expanded:text-white"
      >
        {sparkle}
        {g.open}
      </button>
      {/* فوق المحرر لا بجانبه: ارتفاع الصفحة لا يتغير، فلا تتأثر Lenis ولا مواضع ScrollTrigger.
          dialog غير نمطية ليبقى المحرر قابلاً للنقر لاختيار موضع المؤشر، واختصارات App تتوقف أثناء فتحها */}
      {open && (
        <dialog
          open
          aria-labelledby="ai-title"
          data-lenis-prevent
          onKeyDown={(e) => e.key === 'Escape' && close()}
          className="absolute inset-x-2 top-11 z-50 max-h-[calc(100%-3rem)] w-auto max-w-none origin-top scale-100 overflow-y-auto rounded-xl border border-line-strong bg-surface p-4 text-ink opacity-100 shadow-2xl transition-[opacity,scale] duration-200 starting:scale-95 starting:opacity-0"
        >
          <div className="mb-3 flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">{sparkle}</span>
            <div className="min-w-0 flex-1">
              <h2 id="ai-title" className="text-sm font-semibold text-ink">
                {g.open}
              </h2>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-2">{g.intro(language)}</p>
            </div>
            <button type="button" onClick={close} aria-label={copy.cancel} className={iconButton}>
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void generate('insert')
            }}
          >
            <textarea
              ref={promptRef}
              autoFocus
              dir="auto"
              rows={3}
              value={prompt}
              maxLength={4000}
              aria-label={g.prompt(language)}
              placeholder={g.prompt(language)}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
                e.preventDefault()
                void generate('insert')
              }}
              className="w-full resize-none rounded-lg border border-line-strong bg-page px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-2 focus:border-accent"
            />
            {/* Ready-made requests: one tap fills the box, so nobody faces an empty field not knowing what to write */}
            {!prompt.trim() && !busy && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-ink-2">{g.examplesLabel}</span>
                {g.examples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => {
                      setPrompt(example)
                      promptRef.current?.focus({ preventScroll: true })
                    }}
                    className="rounded-full border border-line-strong px-2.5 py-1 text-xs text-ink-2 transition-colors hover:border-accent hover:text-ink"
                  >
                    {example}
                  </button>
                ))}
              </div>
            )}
            {error && (
              <p role="alert" className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-300">
                {error}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              {busy ? (
                <span role="status" className="me-auto flex items-center gap-2 text-sm text-ink-2">
                  <span className="size-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
                  {lines > 1 ? g.writing(lines) : g.generating}
                </span>
              ) : (
                <span className="me-auto text-xs text-ink-2">{g.hint}</span>
              )}
              <button type="button" onClick={() => generate('replace')} disabled={!prompt.trim() || Boolean(busy)} className={outlineButton}>
                {g.replace}
              </button>
              <button type="submit" disabled={!prompt.trim() || Boolean(busy)} className={accentButton}>
                {g.insert}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </>
  )
}
