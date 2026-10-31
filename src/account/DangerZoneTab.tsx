import { useRef, useState, type SubmitEvent } from 'react'
import { dangerButton, input, outlineButton } from '@/lib/ui'
import type { AccountCopy } from './copy'

export function DangerZoneTab({ copy, email, onDelete }: { copy: AccountCopy; email: string; onDelete: () => void }) {
  const confirmRef = useRef<HTMLDialogElement>(null)
  const [typed, setTyped] = useState('')
  // لا توجد كلمة مرور محفوظة للتحقق منها، فالتأكيد بكتابة البريد كاملاً
  const matches = typed.trim().toLowerCase() === email.toLowerCase()

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!matches) return
    confirmRef.current?.close()
    onDelete()
  }

  return (
    <div className="rounded-xl border border-red-900/60 p-4">
      <h3 className="font-medium">{copy.dangerTitle}</h3>
      <p className="mt-1 text-sm text-ink-2">{copy.dangerBody}</p>
      <button
        type="button"
        onClick={() => {
          setTyped('')
          confirmRef.current?.showModal()
        }}
        className={`${dangerButton} mt-4`}
      >
        {copy.deleteButton}
      </button>

      <dialog
        ref={confirmRef}
        aria-labelledby="delete-title"
        className="m-auto w-[min(24rem,calc(100%-2rem))] rounded-2xl border border-line bg-surface p-6 text-ink shadow-2xl backdrop:bg-black/70"
      >
        <form onSubmit={submit} className="space-y-4">
          <h2 id="delete-title" className="text-lg font-semibold">
            {copy.confirmTitle}
          </h2>
          <p className="text-sm text-ink-2">{copy.dangerBody}</p>
          <div>
            <label htmlFor="delete-confirm" className="text-sm">
              {copy.confirmBody(email)}
            </label>
            <input
              id="delete-confirm"
              dir="ltr"
              type="email"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className={input}
            />
          </div>
          <div className="flex justify-end gap-2">
            {/* إلغاء أول في الترتيب ويأخذ التركيز تلقائياً حتى لا يحذف Enter عن طريق الخطأ */}
            <button type="button" autoFocus onClick={() => confirmRef.current?.close()} className={outlineButton}>
              {copy.cancel}
            </button>
            <button type="submit" disabled={!matches} className={dangerButton}>
              {copy.confirmDelete}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  )
}
