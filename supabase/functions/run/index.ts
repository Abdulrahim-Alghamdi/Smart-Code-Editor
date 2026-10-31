// Runs one file on Wandbox (https://wandbox.org), a free public compiler service with no API key, and returns its output.
// Signed-in users only, like the AI review: Wandbox rate-limits by IP, and every user's runs share this function's IP.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, forbidden } from '../_shared/cors.ts'

// The editor's language ids → Wandbox compiler names (from GET https://wandbox.org/api/list.json).
// Keep in step with SERVER_RUN in src/workspace/run.ts. Wandbox has no Kotlin or Dart.
const COMPILERS: Record<string, string> = {
  python: 'cpython-3.13.8',
  java: 'openjdk-jdk-22+36',
  c: 'gcc-13.2.0-c',
  cpp: 'gcc-13.2.0',
  csharp: 'mono-6.12.0.199',
  go: 'go-1.23.2',
  rust: 'rust-1.82.0',
  php: 'php-8.3.12',
  ruby: 'ruby-3.4.9',
  swift: 'swift-6.0.1',
  typescript: 'typescript-5.6.2',
  shell: 'bash',
  sql: 'sqlite-3.46.1',
}
const MAX_CHARS = 100_000
const TIMEOUT_MS = 30_000

interface WandboxResult {
  // the program's exit code, as a string
  status?: string
  signal?: string
  compiler_error?: string
  program_output?: string
  program_error?: string
}

// Wandbox saves Java as prog.java, so a top-level `public class Main` fails to compile.
// Package-private classes compile under any file name and Wandbox still runs the one with main()
const prepare = (language: string, code: string) =>
  language === 'java' ? code.replace(/^(\s*)public\s+((?:(?:final|abstract|sealed|non-sealed)\s+)*(?:class|interface|enum|record)\s)/gm, '$1$2') : code

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  if (!cors) return forbidden()
  // error keys match the client's output messages: request, limit, network
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply(405, { error: 'request', detail: 'POST only' })

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
  const { data } = await auth.auth.getUser(token)
  if (!data.user || data.user.is_anonymous) return reply(401, { error: 'request', detail: 'Sign in required' })

  // The body comes from the browser, so check it before sending anything on
  let language: unknown, code: unknown
  try {
    ;({ language, code } = await req.json())
  } catch {
    // invalid JSON falls through to the 400 below
  }
  const compiler = typeof language === 'string' ? COMPILERS[language] : undefined
  if (!compiler || typeof code !== 'string' || !code.trim() || code.length > MAX_CHARS) {
    return reply(400, { error: 'request', detail: `Send a supported language and 1-${MAX_CHARS} characters of code` })
  }

  try {
    const started = performance.now()
    const res = await fetch('https://wandbox.org/api/compile.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // save: false keeps the code off Wandbox's public permalinks
      body: JSON.stringify({ compiler, code: prepare(language as string, code), stdin: '', save: false }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    // Wandbox answers "Too many requests" as plain text when its per-IP limit is hit
    if (res.status === 429) return reply(429, { error: 'limit' })
    const body = await res.text()
    if (!res.ok) return reply(502, { error: 'request', detail: `(${res.status}) ${body.slice(0, 200)}` })
    let r: WandboxResult
    try {
      r = JSON.parse(body)
    } catch {
      return reply(/too many/i.test(body) ? 429 : 502, { error: /too many/i.test(body) ? 'limit' : 'request', detail: body.slice(0, 200) })
    }

    const exit = Number(r.status ?? 0)
    return reply(200, {
      stdout: r.program_output ?? '',
      stderr: r.program_error ?? '',
      compileOutput: r.compiler_error ?? '',
      message: r.signal ? `Signal: ${r.signal}` : '',
      // null when the program exited normally; otherwise the reason, shown to the user
      status: r.compiler_error && !r.program_output && !r.program_error && exit !== 0 ? 'Compilation Error' : exit !== 0 ? `Exit code ${exit}` : null,
      // Wandbox doesn't report time or memory, so this is the round trip, compile included
      time: ((performance.now() - started) / 1000).toFixed(2),
      memory: null,
    })
  } catch (err) {
    console.error(err)
    return reply(504, { error: 'network' })
  }
})
