// Spends one of the caller's daily AI calls (see migrations/20261117000000_ai_usage.sql).
// true: allowed. false: today's quota is used up. Throws when the count can't be checked, so a broken quota
// table fails closed instead of opening the Gemini key to unlimited use.
import { createClient } from 'npm:@supabase/supabase-js@2'

export async function consumeAiQuota(token: string): Promise<boolean> {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db.rpc('consume_ai_quota')
  if (error) throw error
  return data !== -1
}
