// Reviews a project's files with Gemini. The API key stays here on the server; the browser only sends the files.
// Only signed-in users may call it: the platform's verify_jwt check rejects a missing or forged JWT,
// and getUser below rejects the public anon key, which is also a valid JWT.
import { createClient } from 'npm:@supabase/supabase-js@2'

// Tried in order: if one is busy or times out, the next one gets the request
const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-lite-latest']
const MODEL_TIMEOUT_MS = 20_000
// Caps what one request can send to Gemini on your bill
const MAX_FILES = 50
const MAX_TOTAL_CHARS = 300_000

// Browser origins allowed to call this function; `*` matches one DNS label part (letters, digits, dashes).
// The ALLOWED_ORIGINS secret (comma-separated, same syntax) replaces this list without a code change.
const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://smart-code-editor.vercel.app',
  'https://smart-code-editor-*.vercel.app',
]
const ORIGIN_PATTERNS = (Deno.env.get('ALLOWED_ORIGINS')?.split(',') ?? DEFAULT_ORIGINS)
  .map((o) => o.trim())
  .filter(Boolean)
  .map((o) => new RegExp(`^${o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+')}$`, 'i'))

const isAllowedOrigin = (origin: string) => ORIGIN_PATTERNS.some((p) => p.test(origin))

const TEXT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    bugs: { type: 'ARRAY', items: { type: 'STRING' } },
    rootCause: { type: 'STRING' },
    fixes: { type: 'ARRAY', items: { type: 'STRING' } },
    optimizations: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['bugs', 'rootCause', 'fixes', 'optimizations'],
}

const FILE_LIST_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: { name: { type: 'STRING' }, content: { type: 'STRING' } },
    required: ['name', 'content'],
  },
}

const REVIEW_SCHEMA = {
  type: 'OBJECT',
  properties: {
    ar: TEXT_SCHEMA,
    en: TEXT_SCHEMA,
    fixedFiles: FILE_LIST_SCHEMA,
    renamedFiles: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { from: { type: 'STRING' }, to: { type: 'STRING' } },
        required: ['from', 'to'],
      },
    },
    suggestedFiles: FILE_LIST_SCHEMA,
  },
  required: ['ar', 'en', 'fixedFiles', 'renamedFiles', 'suggestedFiles'],
}

interface ReviewFile {
  name: string
  // Human-readable language label, e.g. "JavaScript"
  language: string
  content: string
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  error?: { message?: string }
}

// The body comes from the browser, so check its shape and size before spending tokens on it
const parseFiles = (raw: unknown): ReviewFile[] | null => {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_FILES) return null
  const ok = raw.every((f) => typeof f?.name === 'string' && typeof f?.language === 'string' && typeof f?.content === 'string')
  if (!ok) return null
  const total = raw.reduce((n: number, f: ReviewFile) => n + f.name.length + f.content.length, 0)
  return total <= MAX_TOTAL_CHARS ? raw : null
}

const buildPrompt = (files: ReviewFile[]) => {
  const project = files.map((f) => `File: ${f.name} (${f.language})\n\`\`\`\n${f.content}\n\`\`\``).join('\n\n')
  return `You are an expert code reviewer. Below is a project of ${files.length} file(s): ${files.map((f) => f.name).join(', ')}.
Analyze the whole project together, including how the files interact (e.g. a main method using classes from other files), for syntax errors, logical bugs and object-oriented structure problems.
Return:
- "ar" and "en": the same review written in Arabic ("ar") and in English ("en"), each with:
  - "bugs": each error found, naming the file it is in (empty if none)
  - "rootCause": why the errors happen
  - "fixes": how to fix each one
  - "optimizations": performance, readability, OOP structure and best-practice suggestions
- "fixedFiles": for each existing file that needs changes, its exact existing file name and full corrected content (empty if nothing needs fixing)
- "renamedFiles": files whose name must change, as {"from": exact existing name, "to": new name}. When a file name does not match the class it declares (e.g. "main.java" declaring "public class Main"), rename the file to match the class; never rename the class in code just to match its file name (empty if none)
- "suggestedFiles": when the code uses classes that no file defines, or one file holds several classes that belong in separate files (e.g. Java requires one public class per file), one entry per class, named after the class with the right extension (e.g. "VIP.java"), with its full code. Never include a file name that already exists. If you move a class out of a file, also return that file without it in "fixedFiles" (empty if none)
Keep code identifiers unchanged in both languages.

${project}`
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  // A browser on any other site is refused before auth or Gemini run. Non-browser callers send no Origin;
  // they are not a CORS question and still need a signed-in user's JWT below.
  if (origin && !isAllowedOrigin(origin)) return new Response('Origin not allowed', { status: 403, headers: { Vary: 'Origin' } })

  const cors: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
    ...(origin && { 'Access-Control-Allow-Origin': origin }),
  }
  // error keys match the client's message keys: request, badResponse, network
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply(405, { error: 'request', detail: 'POST only' })

  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
  const { data } = await auth.auth.getUser(token)
  if (!data.user || data.user.is_anonymous) return reply(401, { error: 'request', detail: 'Sign in required' })

  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) return reply(500, { error: 'request', detail: 'GEMINI_API_KEY is not set on the server' })

  let files: ReviewFile[] | null = null
  try {
    files = parseFiles((await req.json())?.files)
  } catch {
    // invalid JSON falls through to the 400 below
  }
  if (!files) return reply(400, { error: 'request', detail: `Send 1-${MAX_FILES} files, ${MAX_TOTAL_CHARS} characters at most` })

  const body = JSON.stringify({
    contents: [{ parts: [{ text: buildPrompt(files) }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: REVIEW_SCHEMA },
  })

  let last = { status: 502, error: 'network', detail: '' }
  for (const model of MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body,
        signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      })
      const data: GeminiResponse = await res.json()
      if (res.ok) {
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        try {
          JSON.parse(text)
          // The client still checks the review's shape before showing it
          return reply(200, { text, model })
        } catch {
          last = { status: 502, error: 'badResponse', detail: '' }
          continue
        }
      }
      last = { status: 502, error: 'request', detail: `(${res.status}) ${data.error?.message ?? ''}` }
      // A bad key or request won't be fixed by trying another model
      if ([400, 401, 403].includes(res.status)) break
    } catch (err) {
      console.error(model, err)
      last = { status: 504, error: 'network', detail: '' }
    }
  }
  return reply(last.status, { error: last.error, detail: last.detail })
})
