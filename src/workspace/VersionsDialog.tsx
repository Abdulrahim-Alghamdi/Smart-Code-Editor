import { useEffect, useRef } from 'react'
import { iconButton } from '@/lib/ui'
import { SNAPSHOT_LIMIT, type Snapshot } from '@/services/localDb'
import type { WorkspaceCopy } from './copy'
import { timeAgo } from './history'

interface Props {
  // null والنافذة مغلقة
  versions: Snapshot[] | null
  fileName: string
  current: string
  onClose: () => void
  onRestore: (snapshot: Snapshot) => void
  lang: 'ar' | 'en'
  copy: WorkspaceCopy
}

export function VersionsDialog({ versions, fileName, current, onClose, onRestore, lang, copy }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const open = versions !== null

  useEffect(() => {
    const dialog = ref.current
    if (open && !dialog?.open) dialog?.showModal()
    if (!open && dialog?.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="versions-title"
      data-lenis-prevent
      className="m-auto max-h-[calc(100svh-2rem)] w-[min(32rem,calc(100%-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-4 px-6 pt-5">
        <h2 id="versions-title" className="min-w-0 truncate text-xl font-semibold">
          {copy.versionsTitle(fileName)}
        </h2>
        <button type="button" onClick={onClose} aria-label={copy.close} className={iconButton}>
          ✕
        </button>
      </div>

      {!versions?.length ? (
        <p className="px-6 pb-6 pt-4 text-sm text-ink-2">{copy.versionsEmpty}</p>
      ) : (
        <>
          <ul className="mt-3 max-h-[60svh] overflow-y-auto px-3">
            {versions.map((v) => {
              const time = timeAgo(v.savedAt, lang)
              return (
                <li key={v.id} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink" title={new Date(v.savedAt).toLocaleString(lang)}>
                      {time}
                    </p>
                    <p dir="ltr" className="truncate text-start font-mono text-xs text-ink-2">
                      {v.content.split('\n').find((line) => line.trim())?.trim()}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-ink-2">{copy.lines(v.content.split('\n').length)}</span>
                  {v.content === current ? (
                    <span className="h-8 shrink-0 px-2.5 text-xs leading-8 text-accent">{copy.current}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRestore(v)}
                      aria-label={copy.restoreLabel(time)}
                      className="h-8 shrink-0 rounded-lg px-2.5 text-xs text-ink-2 hover:bg-line hover:text-ink"
                    >
                      {copy.restore}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="px-6 pb-5 pt-3 text-xs text-ink-2">{copy.versionsNote(SNAPSHOT_LIMIT)}</p>
        </>
      )}
    </dialog>
  )
}
