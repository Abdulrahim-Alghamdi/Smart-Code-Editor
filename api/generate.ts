// Generates code for the editor with Gemini. GEMINI_API_KEY has no VITE_ prefix, so it stays on the server.
// Signed-in users only, like supabase/functions/gemini: this route spends the same Gemini quota.
// No CORS headers on purpose: the Authorization header forces a preflight, so other sites' browsers are refused.
import { ApiError, GoogleGenAI } from '@google/genai'
import { createClient } from '@supabase/supabase-js'

// shortcut: deprecated, and from 2026-12-01 Google routes it to gemini-3.5-flash-lite; change this constant to move off it
const MODEL = 'gemini-2.5-flash'
// Under maxDuration in vercel.json, so the browser gets our error and not Vercel's timeout page
const TIMEOUT_MS = 55_000
// Caps what one request can send to Gemini on your bill
const MAX_PROMPT_CHARS = 4_000
const MAX_LANGUAGE_CHARS = 30

const systemPrompt = (language: string) => `You generate code for a code editor. The active file's language is ${language}.
Write only ${language} that does what the user asks, even if they name another language.
Your reply is inserted straight into the file, so return raw code: no Markdown, no code fences, and no text before or after the code.
Put any explanation in ${language} comments, and only where the code needs one.`

// The body comes from the browser, so check its shape and size before spending tokens on it
export const parseRequest = (raw: unknown): { prompt: string; language: string } | null => {
  const { prompt, language } = (raw ?? {}) as Record<string, unknown>
  if (typeof prompt !== 'string' || typeof language !== 'string') return null
  const input = { prompt: prompt.trim(), language: language.trim() }
  const ok = input.prompt && input.language && input.prompt.length <= MAX_PROMPT_CHARS && input.language.length <= MAX_LANGUAGE_CHARS
  return ok ? input : null
}

// The system prompt asks for raw code, but a model can still wrap it in a fence, which would land in the user's file
export const stripFences = (text: string) => (/^\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/.exec(text)?.[1] ?? text).trim()

export default {
  async fetch(req: Request) {
    // error keys match the client's message keys: request, badResponse, network
    const reply = (status: number, body: unknown) => Response.json(body, { status })

    if (req.method !== 'POST') return reply(405, { error: 'request', detail: 'POST only' })

    const apiKey = process.env.GEMINI_API_KEY
    const supabaseUrl = process.env.VITE_SUPABASE_URL
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY
    if (!apiKey || !supabaseUrl || !supabaseKey) return reply(500, { error: 'request', detail: 'Server environment is not configured' })

    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? ''
    const { data } = await createClient(supabaseUrl, supabaseKey).auth.getUser(token)
    if (!data.user || data.user.is_anonymous) return reply(401, { error: 'request', detail: 'Sign in required' })

    const input = parseRequest(await req.json().catch(() => null))
    if (!input) return reply(400, { error: 'request', detail: `Send a prompt of ${MAX_PROMPT_CHARS} characters at most and a language` })

    try {
      const response = await new GoogleGenAI({ apiKey }).models.generateContent({
        model: MODEL,
        contents: input.prompt,
        config: { systemInstruction: systemPrompt(input.language), abortSignal: AbortSignal.timeout(TIMEOUT_MS) },
      })
      const code = stripFences(response.text ?? '')
      return code ? reply(200, { code }) : reply(502, { error: 'badResponse' })
    } catch (err) {
      console.error(err)
      // Only the status goes to the browser; the full provider message stays in the function logs
      if (err instanceof ApiError) return reply(502, { error: 'request', detail: `(${err.status})` })
      return reply(504, { error: 'network' })
    }
  },
}
