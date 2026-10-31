import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { parseEditorSettings, type EditorSettings } from '@/workspace/editorSettings'
import { useAuth } from './useAuth'
import { parseProfile, type Profile } from './validation'

export interface Settings {
  lang: 'ar' | 'en' | null
  editor: EditorSettings | null
}

interface Row {
  id: string
  account: Profile | null
  settings: Settings
}

// الملف الشخصي والتفضيلات في جدول profiles على Supabase؛ البريد يأتي من حساب المصادقة نفسه
export function useAccount() {
  const { user, loading } = useAuth()
  const [row, setRow] = useState<Row | null>(null)
  const userId = user?.id
  const email = user?.email

  useEffect(() => {
    if (!userId || !email) return
    let alive = true
    supabase
      .from('profiles')
      .select('name, username, bio, avatar, lang, editor')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return
        // shortcut: إذا فشل التحميل يبقى المستخدم بلا ملف (يظهر كزائر) بدل عرض قيم افتراضية قد تُحفظ فوق ملفه الحقيقي؛ أضف إعادة محاولة إذا تكرر
        if (error) console.error(error)
        setRow({
          id: userId,
          account: error ? null : parseProfile({ ...data, email }),
          settings: {
            lang: data?.lang === 'ar' || data?.lang === 'en' ? data.lang : null,
            editor: parseEditorSettings(data?.editor),
          },
        })
      })
    return () => {
      alive = false
    }
  }, [userId, email])

  const current = user && row?.id === user.id ? row : null
  // البريد يُقرأ من الجلسة كل مرة حتى يظهر الجديد فور تأكيد تغييره
  const account = current?.account && user?.email ? { ...current.account, email: user.email } : null

  // يعيد null إذا رفض الخادم الحفظ حتى لا تظهر رسالة نجاح والتغيير لم يُحفظ
  const save = async (next: Profile): Promise<Profile | null> => {
    if (!user || !current) return null
    const clean = { ...next, name: next.name.trim(), email: next.email.trim(), bio: next.bio.trim() }
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, name: clean.name, username: clean.username, bio: clean.bio, avatar: clean.avatar })
    if (error) return null
    setRow({ ...current, account: clean })
    // تغيير البريد لا يُطبَّق حتى يؤكده المستخدم من الرسالة، فيبقى الحالي معروضاً حتى ذلك
    if (clean.email.toLowerCase() !== user.email?.toLowerCase()) {
      const { error } = await supabase.auth.updateUser({ email: clean.email }, { emailRedirectTo: window.location.origin })
      if (error) return null
    }
    return { ...clean, email: user.email ?? clean.email }
  }

  // يعيد true للزائر لأن تفضيلاته تبقى في المتصفح فقط
  const saveSettings = async (patch: Partial<Settings>): Promise<boolean> => {
    if (!user) return true
    const { error } = await supabase.from('profiles').upsert({ id: user.id, ...patch })
    return !error
  }

  // يحذف المستخدم من auth.users عبر دالة في القاعدة، والملف يُحذف معه (on delete cascade)
  const remove = async (): Promise<boolean> => {
    const { error } = await supabase.rpc('delete_own_account')
    if (error) return false
    await supabase.auth.signOut({ scope: 'local' })
    return true
  }

  return {
    account,
    loaded: !loading && (!user || Boolean(current)),
    settings: current?.settings ?? null,
    save,
    saveSettings,
    remove,
  }
}
