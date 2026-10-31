import { useCallback, useEffect, useRef, useState } from 'react'
import { storage } from './storage'

// حالة React محفوظة في طبقة التخزين: تبدأ بالقيمة الافتراضية ثم تُحمَّل، و parse يرفض القيم التالفة أو القديمة الشكل
export function useStored<T>(key: string, fallback: T, parse: (raw: unknown) => T | null) {
  const [value, setValue] = useState<T>(fallback)
  const [loaded, setLoaded] = useState(false)
  // إذا غيّر المستخدم القيمة قبل انتهاء التحميل فاختياره هو الأحدث، فلا نستبدله بالقيمة المحفوظة
  const changed = useRef(false)
  const parseRef = useRef(parse)

  useEffect(() => {
    let alive = true
    storage.get(key).then((raw) => {
      if (!alive) return
      const parsed = raw === null ? null : parseRef.current(raw)
      if (parsed !== null && !changed.current) setValue(parsed)
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [key])

  // آخر قيمة معروضة، للرجوع إليها إذا فشل الحفظ
  const current = useRef(value)
  useEffect(() => {
    current.current = value
  }, [value])

  // تُحدَّث الواجهة فوراً؛ إذا فشل الحفظ ترجع للقيمة السابقة، والوعد يخبر المستدعي ليعرض رسالة خطأ
  const save = useCallback(
    async (next: T): Promise<boolean> => {
      const previous = current.current
      changed.current = true
      setValue(next)
      const ok = await storage.set(key, next)
      if (!ok) setValue(previous)
      return ok
    },
    [key]
  )

  return [value, save, loaded] as const
}
