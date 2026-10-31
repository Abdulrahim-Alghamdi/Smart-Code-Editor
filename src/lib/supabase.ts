import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// بدون المفتاحين لا يعمل تسجيل الدخول إطلاقاً، فالأوضح أن يفشل التطبيق برسالة صريحة بدل أخطاء شبكة غامضة
if (!url || !anonKey) throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env')

export const supabase = createClient(url, anonKey)
