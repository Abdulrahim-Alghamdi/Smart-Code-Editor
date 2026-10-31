import { useEffect, useRef } from 'react'

export interface ToastMessage {
  text: string
  kind: 'success' | 'error'
  // معرّف فريد حتى تظهر الرسالة نفسها مرة ثانية إذا تكررت
  id: number
}

const VISIBLE_MS = 4000

// popover يضع الرسالة في الطبقة العليا، فتظهر فوق نافذة الحساب المفتوحة بدل أن تختفي خلف خلفيتها
export function Toast({ message, onDone }: { message: ToastMessage | null; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (el.matches(':popover-open')) el.hidePopover()
    if (!message) return
    // إعادة الفتح تضعها فوق أي نافذة فُتحت بعدها
    el.showPopover()
    const timer = setTimeout(onDone, VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [message, onDone])

  return (
    <div
      ref={ref}
      popover="manual"
      role={message?.kind === 'error' ? 'alert' : 'status'}
      className={`fixed inset-auto bottom-6 left-1/2 m-0 max-w-[min(26rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border-0 px-4 py-3 text-sm text-ink shadow-lg ${
        message?.kind === 'error' ? 'bg-accent-soft' : 'bg-surface-2'
      }`}
    >
      {message?.text}
    </div>
  )
}
