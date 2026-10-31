// Runs one file on Wandbox (https://wandbox.org), a free public compiler service with no API key, and returns its output.
// Signed-in users only, like the AI review: Wandbox rate-limits by IP, and every user's runs share this function's IP.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, forbidden } from '../_shared/cors.ts'

// The editor's language ids → Wandbox compilers, primary first, then a fallback used when the primary's container is down.
// Every name here ran a hello program on 2026-10-31 (GET https://wandbox.org/api/list.json, then POST compile.json).
// Left out after that check: dotnetcore-8.0.402 (exceeds Wandbox's file size limit), rust-1.81.0 (timed out), and Swift
// (swift-6.0.1 and swift-5.10.1 fail to start: catatonit). Wandbox has no Kotlin or Dart.
// Keep in step with SERVER_RUN in src/workspace/run.ts. Python (Pyodide) and SQL (sql.js) run in the browser.
const COMPILERS: Record<string, string[]> = {
  java: ['openjdk-jdk-22+36', 'openjdk-jdk-21+35'],
  c: ['gcc-13.2.0-c', 'gcc-12.3.0-c'],
  cpp: ['gcc-13.2.0', 'gcc-12.3.0'],
  csharp: ['mono-6.12.0.199'],
  go: ['go-1.23.2', 'go-1.22.8'],
  rust: ['rust-1.82.0'],
  php: ['php-8.3.12', 'php-8.2.24'],
  ruby: ['ruby-3.4.9', 'ruby-3.3.11'],
  typescript: ['typescript-5.6.2'],
  shell: ['bash'],
}
const MAX_CHARS = 100_000

// Total time for a run, retries included. Matches the browser's limit in src/workspace/run.ts minus a margin, so this
// function always answers before the browser gives up. Go and Rust compile slowly on Wandbox (19-30s measured).
const LIMIT_MS: Record<string, number> = { go: 30_000, rust: 30_000 }
const DEFAULT_LIMIT_MS = 15_000
const ANSWER_MARGIN_MS = 1_500
// One retry after a temporary failure (busy, 5xx, network), and only if enough time is left for it to finish
const RETRY_DELAY_MS = 1_200
const MIN_RETRY_TIME_MS = 3_000

// Results by SHA-256 of language + file name + code, kept while this function instance stays warm.
// Many users run the same examples, so this saves Wandbox calls (and its per-IP rate limit) across users.
// shortcut: per instance and lost on cold start; move to a Supabase table if hit rates matter
const CACHE_LIMIT = 200
const cache = new Map<string, unknown>()
const hash = async (text: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('')

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface WandboxResult {
  // the program's exit code, as a string
  status?: string
  signal?: string
  compiler_error?: string
  program_output?: string
  program_error?: string
}

// busy: rate limit, 5xx or a dropped connection (worth one retry). unavailable: the compiler's container won't start
// (try the fallback compiler). timeout: out of time. request: Wandbox refused the request itself.
type Attempt = { ok: true; result: WandboxResult } | { ok: false; kind: 'busy' | 'unavailable' | 'timeout' | 'request'; detail?: string }

// Wandbox saves Java as prog.java, so a top-level `public class Main` fails to compile.
// Package-private classes compile under any file name and Wandbox still runs the one with main()
const prepare = (language: string, code: string) =>
  language === 'java' ? code.replace(/^(\s*)public\s+((?:(?:final|abstract|sealed|non-sealed)\s+)*(?:class|interface|enum|record)\s)/gm, '$1$2') : code

// Wandbox's messages point at its own server: Go adds a "# _/home/wandbox" header line, and paths read
// /home/wandbox/prog.go or ./prog.go. Show them as the user's file instead, e.g. "main.go:6:31: syntax error"
const tidy = (text: string | undefined, filename: string) =>
  (text ?? '')
    .replace(/^# _\/home\/wandbox\n/gm, '')
    .replace(/(?:\/home\/wandbox\/|\.\/)?\bprog\.(\w+)\b/g, filename)

// One call to Wandbox. Raw server errors (HTML error pages, "Too many requests", container failures) become an Attempt
// kind here, so none of them reach the user as-is
async function compile(compiler: string, code: string, timeoutMs: number): Promise<Attempt> {
  try {
    const res = await fetch('https://wandbox.org/api/compile.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // save: false keeps the code off Wandbox's public permalinks
      body: JSON.stringify({ compiler, code, stdin: '', save: false }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const body = await res.text()
    // Wandbox answers "Too many requests" as plain text when its per-IP limit is hit
    if (res.status === 429 || /too many requests/i.test(body)) return { ok: false, kind: 'busy', detail: 'rate limited' }
    if (res.status >= 500) return { ok: false, kind: 'busy', detail: `HTTP ${res.status}` }
    if (!res.ok) return { ok: false, kind: 'request', detail: `HTTP ${res.status}` }
    let result: WandboxResult
    try {
      result = JSON.parse(body)
    } catch {
      // a proxy error page instead of JSON
      return { ok: false, kind: 'busy', detail: 'invalid response' }
    }
    if (/catatonit|failed to exec pid1/i.test(result.compiler_error ?? '')) return { ok: false, kind: 'unavailable', detail: compiler }
    return { ok: true, result }
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'TimeoutError'
    return { ok: false, kind: timedOut ? 'timeout' : 'busy', detail: timedOut ? undefined : String(err) }
  }
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req)
  if (!cors) return forbidden()
  // error keys match the client's output messages: request, busy, unavailable, timeout
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply(405, { error: 'request', detail: 'POST only' })

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
  // getClaims verifies the JWT against the project's signing keys (cached), without a call to the Auth server
  // on every run. The body is read at the same time. The public anon key has role "anon", so it's refused here
  const [{ data }, body] = await Promise.all([auth.auth.getClaims(token), req.json().catch(() => null)])
  const claims = data?.claims
  if (!claims?.sub || claims.role !== 'authenticated' || claims.is_anonymous) return reply(401, { error: 'request', detail: 'Sign in required' })

  // The body comes from the browser, so check it before sending anything on
  const { language, code, name, fresh } = (body ?? {}) as Record<string, unknown>
  const compilers = typeof language === 'string' && Object.hasOwn(COMPILERS, language) ? COMPILERS[language] : undefined
  if (!compilers || typeof language !== 'string' || typeof code !== 'string' || !code.trim() || code.length > MAX_CHARS) {
    return reply(400, { error: 'request', detail: `Send a supported language and 1-${MAX_CHARS} characters of code` })
  }

  // Only used to label error messages; anything unusual falls back to Wandbox's own prog.<ext>
  const filename = typeof name === 'string' && /^[\w.-]{1,100}$/.test(name) ? name : 'prog.$1'

  // fresh: the user asked to run it again for real ("Run fresh"), e.g. a program using random numbers
  const key = await hash(`${language}\0${filename}\0${code}`)
  const hit = fresh === true ? undefined : cache.get(key)
  if (hit) return reply(200, { ...(hit as object), cached: true })

  const started = performance.now()
  const deadline = started + (LIMIT_MS[language] ?? DEFAULT_LIMIT_MS) - ANSWER_MARGIN_MS
  const source = prepare(language, code)
  let compilerIndex = 0
  let retried = false
  let attempt: Attempt
  for (;;) {
    // AbortSignal.timeout needs a whole number of milliseconds
    attempt = await compile(compilers[compilerIndex], source, Math.max(1, Math.floor(deadline - performance.now())))
    if (attempt.ok || attempt.kind === 'request' || attempt.kind === 'timeout') break
    // container down: switch to the fallback compiler straight away
    if (attempt.kind === 'unavailable' && compilerIndex + 1 < compilers.length) {
      compilerIndex++
      continue
    }
    if (retried || deadline - performance.now() < RETRY_DELAY_MS + MIN_RETRY_TIME_MS) break
    retried = true
    await sleep(RETRY_DELAY_MS)
  }

  if (!attempt.ok) {
    console.error(language, attempt.kind, attempt.detail)
    const status = { busy: 503, unavailable: 503, timeout: 504, request: 502 }[attempt.kind]
    return reply(status, { error: attempt.kind, detail: attempt.kind === 'request' ? attempt.detail : undefined })
  }

  const r = attempt.result
  const exit = Number(r.status ?? 0)
  const result = {
    stdout: r.program_output ?? '',
    stderr: tidy(r.program_error, filename),
    compileOutput: tidy(r.compiler_error, filename),
    message: r.signal ? `Signal: ${r.signal}` : '',
    // null when the program exited normally; otherwise the reason, shown to the user
    status: r.compiler_error && !r.program_output && !r.program_error && exit !== 0 ? 'Compilation Error' : exit !== 0 ? `Exit code ${exit}` : null,
    // Wandbox doesn't report time or memory, so this is the round trip, compile and retries included
    time: ((performance.now() - started) / 1000).toFixed(2),
    memory: null,
  }
  // A killed program (Wandbox's time limit) may finish next time, so it isn't cached
  if (!r.signal) {
    cache.delete(key)
    cache.set(key, result)
    // Map keeps insertion order: the first key is the least recently stored
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
  }
  return reply(200, result)
})
