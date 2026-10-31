import { createContext, useContext } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

// روابط البريد (التأكيد واستعادة كلمة المرور) ترجع لنفس الموقع، محلياً أو على Vercel
const redirectTo = () => window.location.origin

export const authActions = {
  signUp: (name: string, email: string, password: string) =>
    supabase.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: redirectTo() } }),
  signIn: (email: string, password: string) => supabase.auth.signInWithPassword({ email, password }),
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
