import { useEffect, useRef } from 'react'
import { iconButton, outlineButton } from '@/lib/ui'
import { LANGUAGES } from '@/lib/languages'
import type { WorkspaceCopy } from './copy'
import { timeAgo, type HistoryEntry } from './history'

interface Props {
  open: boolean
  onClose: () => void
  entries: HistoryEntry[]
  lang: 'ar' | 'en'
  copy: WorkspaceCopy
  onOpen: (entry: HistoryEntry) => void
  onRemove: (id: string) => void
  onClear: () => void
}

export function RecentDialog({ open, onClose, entries, lang, copy, onOpen, onRemove, onClear }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog?.open) dialog?.showModal()
    if (!open && dialog?.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="recent-title"
      data-lenis-prevent
      className="m-auto max-h-[calc(100svh-2rem)] w-[min(32rem,calc(100%-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-4 px-6 pt-5">
        <h2 id="recent-title" className="text-xl font-semibold">
          {copy.recentTitle}
        </h2>
        <button type="button" onClick={onClose} aria-label={copy.close} className={iconButton}>
          ✕
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="px-6 pb-6 pt-4 text-sm text-ink-2">{copy.recentEmpty}</p>
      ) : (
        <>
          <ul className="mt-3 max-h-[60svh] overflow-y-auto px-3">
            {entries.map((e) => (
              <li key={e.id} className="group flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-surface-2">
                <div className="min-w-0 flex-1">
                  <p dir="ltr" className="truncate font-mono text-sm text-ink">
                    {e.name}
                  </p>
                  <p className="text-xs text-ink-2">
                    {LANGUAGES.find((l) => l.id === e.language)?.label ?? e.language} · {timeAgo(e.updatedAt, lang)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpen(e)}
                  aria-label={copy.openLabel(e.name)}
                  className="h-8 shrink-0 rounded-lg px-2.5 text-xs text-ink-2 hover:bg-line hover:text-ink"
                >
                  {copy.open}
                </button>
                <button type="button" onClick={() => onRemove(e.id)} aria-label={copy.removeLabel(e.name)} title={copy.remove} className={iconButton}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <div className="flex justify-end px-6 pb-5 pt-3">
            <button type="button" onClick={() => window.confirm(copy.clearConfirm) && onClear()} className={outlineButton}>
              {copy.clear}
            </button>
          </div>
        </>
      )}
    </dialog>
  )
}
