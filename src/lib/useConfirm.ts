import { useCallback, useState } from 'react'

export interface ConfirmRequest {
  title: string
  body: string
  // نص زر التنفيذ، يصف الفعل ("حذف" لا "موافق")
  action: string
  cancel: string
  // زر أحمر للأفعال التي تُفقد بيانات
  danger?: boolean
}

export type PendingConfirm = ConfirmRequest & { resolve: (ok: boolean) => void }

// بديل window.confirm بنافذة الموقع: await confirm({...}) يعيد true عند الضغط على زر التنفيذ فقط
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null)
  const confirm = useCallback((request: ConfirmRequest) => new Promise<boolean>((resolve) => setPending({ ...request, resolve })), [])
  const settle = (ok: boolean) => {
    pending?.resolve(ok)
    setPending(null)
  }
  return { confirm, pending, settle }
}
