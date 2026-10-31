// Signs in with a username instead of an email. Supabase Auth only accepts an email, so this looks the email up
// here on the server and signs in for the browser; the email is never sent back, so a username can't reveal it.
// Callers are guests, so the platform's verify_jwt check passes with the public anon key.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, forbidden } from '../_shared/cors.ts'

// Same rule as the profiles.username check constraint
const USERNAME = /^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9_.]{3,20}$/
const INVALID = 'Invalid login credentials'

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  if (!cors) return forbidden()
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply(405, { error: 'POST only' })

  let username = ''
  let password = ''
  try {
    const body = await req.json()
    username = String(body?.username ?? '').trim().toLowerCase()
    password = String(body?.password ?? '')
  } catch {
    // invalid JSON is treated like wrong credentials below
  }
  // One message for an unknown username and a wrong password, so this can't be used to find out who has an account
  if (!USERNAME.test(username) || !password || password.length > 72) return reply(400, { error: INVALID })

  const url = Deno.env.get('SUPABASE_URL')!
  const noSession = { auth: { persistSession: false, autoRefreshToken: false } }
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, noSession)

  const { data: profile } = await admin.from('profiles').select('id').eq('username', username).maybeSingle()
  const { data: found } = profile ? await admin.auth.admin.getUserById(profile.id) : { data: { user: null } }
  const email = found.user?.email
  if (!email) return reply(400, { error: INVALID })

  // shortcut: every username login reaches Supabase Auth from this function's IP, so they share one sign-in rate limit; raise it under Auth > Rate Limits if many users log in by username
  const auth = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, noSession)
  const { data, error } = await auth.auth.signInWithPassword({ email, password })
  if (error || !data.session) return reply(400, { error: error?.message ?? INVALID })

  // The browser stores this session with supabase.auth.setSession, exactly like an email sign-in
  return reply(200, { access_token: data.session.access_token, refresh_token: data.session.refresh_token })
})
