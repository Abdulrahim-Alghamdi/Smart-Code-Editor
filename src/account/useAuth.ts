import { createContext, useContext } from 'react'
import { FunctionsHttpError, type User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// روابط البريد (التأكيد واستعادة كلمة المرور) ترجع لنفس الموقع، محلياً أو على Vercel
const redirectTo = () => window.location.origin

export const authActions = {
  signUp: (name: string, email: string, password: string) =>
    supabase.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: redirectTo() } }),
  // يقبل البريد أو اسم المستخدم: الاسم يمر بدالة login على الخادم لأن Supabase يسجّل الدخول بالبريد فقط
  signIn: async (identifier: string, password: string): Promise<{ error: { message: string } | null }> => {
    if (identifier.includes('@')) return supabase.auth.signInWithPassword({ email: identifier, password })
    const { data, error } = await supabase.functions.invoke<{ access_token: string; refresh_token: string }>('login', {
      body: { username: identifier, password },
    })
    if (error || !data) {
      const reply = error instanceof FunctionsHttpError ? await error.context.json().catch(() => null) : null
      return { error: { message: reply?.error ?? error?.message ?? 'Invalid login credentials' } }
    }
    return supabase.auth.setSession(data)
  },
  // ينقل المتصفح لصفحة Google أو GitHub، ثم يرجع للموقع مسجّلاً؛ onAuthStateChange يلتقط الجلسة من الرابط
  signInWithProvider: (provider: 'google' | 'github') =>
    supabase.auth.signInWithOAuth({ provider, options: { redirectTo: redirectTo() } }),
  resetPassword: (email: string) => supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() }),
  updatePassword: (password: string) => supabase.auth.updateUser({ password }),
  signOut: () => supabase.auth.signOut(),
}

export interface Auth extends Readonly<typeof authActions> {
  user: User | null
  // true حتى تصل أول حالة جلسة، حتى لا تومض أزرار الدخول لمستخدم مسجّل
  loading: boolean
  // true بعد فتح رابط استعادة كلمة المرور من البريد، فيطلب التطبيق كلمة مرور جديدة
  recovering: boolean
  endRecovery: () => void
}

export const AuthContext = createContext<Auth | null>(null)

export function useAuth() {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}
