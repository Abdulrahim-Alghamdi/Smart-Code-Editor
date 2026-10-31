import { useEffect, useRef } from 'react'
import { accentButton, dangerButton, outlineButton } from '@/lib/ui'
import type { PendingConfirm } from '@/lib/useConfirm'

// نافذة التأكيد الموحدة؛ تُفتح فوق أي نافذة أخرى (مثل السجل) لأن showModal يضعها في أعلى الطبقات
export function ConfirmDialog({ pending, onSettle }: { pending: PendingConfirm | null; onSettle: (ok: boolean) => void }) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (pending && !dialog?.open) dialog?.showModal()
    if (!pending && dialog?.open) dialog.close()
  }, [pending])

  return (
    <dialog
      ref={ref}
      // Escape أو الإغلاق بأي طريقة يعني الإلغاء
      onClose={() => onSettle(false)}
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      data-lenis-prevent
      className="m-auto w-[min(26rem,calc(100%-2rem))] scale-100 rounded-2xl border border-line bg-surface p-6 text-ink opacity-100 shadow-2xl transition-[opacity,scale] duration-200 backdrop:bg-black/60 backdrop:backdrop-blur-sm starting:scale-95 starting:opacity-0"
    >
      {pending && (
        <div className="flex gap-4">
          {pending.danger && (
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-red-950 text-red-400" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
              </svg>
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="text-lg font-semibold">
              {pending.title}
            </h2>
            <p id="confirm-body" className="mt-2 text-sm text-ink-2">
              {pending.body}
            </p>
            {/* الإلغاء أول زر فيأخذ التركيز عند الفتح، حتى لا ينفّذ Enter الحذف عن طريق الخطأ */}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => onSettle(false)} className={outlineButton}>
                {pending.cancel}
              </button>
              <button type="button" onClick={() => onSettle(true)} className={pending.danger ? dangerButton : accentButton}>
                {pending.action}
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  )
}
