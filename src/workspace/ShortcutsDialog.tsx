import { useEffect, useRef } from 'react'
import { iconButton } from '@/lib/ui'
import type { WorkspaceCopy } from './copy'

// ⌘ على أجهزة Apple و Ctrl في غيرها؛ الاختصارات نفسها تعمل بالاثنين
const MOD = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'
const KEYS = { analyze: [MOD, 'Enter'], save: [MOD, 'S'], format: [MOD, 'Shift', 'F'] }

interface Props {
  open: boolean
  onClose: () => void
  copy: WorkspaceCopy
}

export function ShortcutsDialog({ open, onClose, copy }: Props) {
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
      aria-labelledby="shortcuts-title"
      data-lenis-prevent
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-4 px-6 pt-5">
        <h2 id="shortcuts-title" className="text-xl font-semibold">
          {copy.shortcutsTitle}
        </h2>
        <button type="button" onClick={onClose} aria-label={copy.close} className={iconButton}>
          ✕
        </button>
      </div>
      <dl className="mt-3 divide-y divide-line px-6">
        {(Object.keys(KEYS) as Array<keyof typeof KEYS>).map((id) => (
          <div key={id} className="flex items-center justify-between gap-4 py-3">
            <dt className="text-sm">{copy.shortcutNames[id]}</dt>
            <dd dir="ltr" className="flex shrink-0 gap-1">
              {KEYS[id].map((key) => (
                <kbd key={key} className="min-w-7 rounded-md border border-line-strong bg-surface-2 px-1.5 py-0.5 text-center font-mono text-xs">
                  {key}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <p className="px-6 pb-5 pt-2 text-xs text-ink-2">{copy.formatNote}</p>
    </dialog>
  )
}
