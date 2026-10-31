import { useEffect, useRef, useState } from 'react'
import { loader } from '@monaco-editor/react'
import { accentButton, iconButton, outlineButton } from '@/lib/ui'
import { SNAPSHOT_LIMIT, type Snapshot } from '@/services/localDb'
import type { WorkspaceCopy } from './copy'

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

// "منذ 5 دقائق" / "5 minutes ago"، وأقل من دقيقة "الآن"
const timeAgo = (at: number, lang: 'ar' | 'en', now = Date.now()) => {
  const seconds = Math.round((at - now) / 1000)
  const format = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' })
  for (const [unit, size] of UNITS) if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
  return format.format(0, 'second')
}

// تلوين Monaco نفسه المحمّل للمحرر، بلا محرر ثانٍ؛ يظهر النص خاماً حتى يجهز التلوين
function CodePreview({ code, language }: { code: string; language: string }) {
  const [colored, setColored] = useState<{ code: string; language: string; html: string } | null>(null)

  useEffect(() => {
    let alive = true
    loader
      .init()
      .then((monaco) => monaco.editor.colorize(code, language, { tabSize: 2 }))
      .then((html) => alive && setColored({ code, language, html }), console.error)
    return () => {
      alive = false
    }
  }, [code, language])

  const ready = colored?.code === code && colored.language === language
  return (
    // السطور الطويلة تُمرَّر أفقياً داخل الصندوق، فلا تتجاوز عرض النافذة على الهاتف
    <pre dir="ltr" tabIndex={0} className="max-h-60 overflow-auto rounded-lg bg-[#1e1e1e] p-3 font-mono text-xs leading-5 whitespace-pre text-[#d4d4d4]">
      {/* colorize يهرّب النص قبل التلوين، فلا يُعرض كود المستخدم كـ HTML */}
      {ready ? <code dangerouslySetInnerHTML={{ __html: colored.html }} /> : <code>{code}</code>}
    </pre>
  )
}

interface Props {
  // null والنافذة مغلقة
  versions: Snapshot[] | null
  fileName: string
  current: string
  onClose: () => void
  onRestore: (snapshot: Snapshot) => void
  onDelete: (snapshot: Snapshot) => void
  onClear: () => void
  lang: 'ar' | 'en'
  copy: WorkspaceCopy
}

export function VersionsDialog({ versions, fileName, current, onClose, onRestore, onDelete, onClear, lang, copy }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const open = versions !== null
  // النسخة المفتوحة مربوطة بالقائمة التي فُتحت فيها، فكل فتح جديد للنافذة يبدأ مطوياً
  const [expanded, setExpanded] = useState<{ list: Snapshot[]; id: number } | null>(null)
  const expandedId = expanded?.list === versions ? expanded.id : null
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const currentId = versions?.find((v) => v.content === current)?.id

  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog?.open) dialog?.showModal()
    if (!open && dialog?.open) dialog.close()
  }, [open])

  const copyCode = async (v: Snapshot) => {
    try {
      await navigator.clipboard.writeText(v.content)
      setCopiedId(v.id)
      setTimeout(() => setCopiedId((id) => (id === v.id ? null : id)), 2000)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="versions-title"
      data-lenis-prevent
      className="m-auto max-h-[calc(100svh-2rem)] w-[min(42rem,calc(100%-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-4 px-4 pt-5 sm:px-6">
        <h2 id="versions-title" className="min-w-0 truncate text-xl font-semibold">
          {copy.versionsTitle(fileName)}
        </h2>
        <button type="button" onClick={onClose} aria-label={copy.close} className={iconButton}>
          ✕
        </button>
      </div>

      {!versions?.length ? (
        <p className="px-4 pb-6 pt-4 text-sm text-ink-2 sm:px-6">{copy.versionsEmpty}</p>
      ) : (
        <>
          <ul className="mt-3 max-h-[65svh] overflow-y-auto px-2 sm:px-3">
            {versions.map((v) => {
              const isOpen = v.id === expandedId
              // الشارة لأحدث نسخة تطابق المحرر فقط
              const isCurrent = v.id === currentId
              const lines = copy.lines(v.content.split('\n').length)
              const time = timeAgo(v.savedAt, lang)
              return (
                <li key={v.id} className={`rounded-lg ${isOpen ? 'bg-surface-2' : ''}`}>
                  <div className="flex items-center gap-1 pe-1">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : { list: versions, id: v.id })}
                      aria-expanded={isOpen}
                      aria-controls={`version-${v.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-start hover:bg-surface-2"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className={`size-4 shrink-0 text-ink-2 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="M9 6l6 6-6 6" />
                      </svg>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-ink">{time}</span>
                        <span dir="ltr" className="block truncate text-start font-mono text-xs text-ink-2">
                          {v.content.split('\n').find((line) => line.trim())?.trim()}
                        </span>
                      </span>
                      {isCurrent ? (
                        <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">{copy.current}</span>
                      ) : (
                        <span className="shrink-0 text-xs tabular-nums text-ink-2">{lines}</span>
                      )}
                    </button>
                    <button type="button" onClick={() => onDelete(v)} aria-label={copy.deleteVersion(time)} title={copy.deleteVersion(time)} className={`${iconButton} shrink-0 hover:text-red-400`}>
                      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                      </svg>
                    </button>
                  </div>

                  {isOpen && (
                    <div id={`version-${v.id}`} className="grid gap-3 px-3 pb-3">
                      <p className="flex flex-wrap gap-2 text-xs text-ink-2">
                        <span className="rounded-full border border-line px-2 py-0.5 tabular-nums">{lines}</span>
                        <span className="rounded-full border border-line px-2 py-0.5 tabular-nums">
                          {new Date(v.savedAt).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </p>
                      <CodePreview code={v.content} language={v.language} />
                      <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={() => copyCode(v)} className={outlineButton}>
                          <span aria-live="polite">{copiedId === v.id ? copy.copied : copy.copyCode}</span>
                        </button>
                        <button type="button" onClick={() => onRestore(v)} disabled={isCurrent} className={accentButton}>
                          {copy.restoreVersion}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pb-5 pt-3 sm:px-6">
            <p className="text-xs text-ink-2">{copy.versionsNote(SNAPSHOT_LIMIT)}</p>
            <button
              type="button"
              onClick={() => window.confirm(copy.clearVersionsConfirm(fileName)) && onClear()}
              className={`${outlineButton} hover:border-red-400/60 hover:text-red-400`}
            >
              {copy.clearVersions}
            </button>
          </div>
        </>
      )}
    </dialog>
  )
}
