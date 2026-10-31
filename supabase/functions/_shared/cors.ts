// Browser origins allowed to call the Edge Functions; `*` matches one DNS label part (letters, digits, dashes).
// The ALLOWED_ORIGINS secret (comma-separated, same syntax) replaces this list without a code change.
const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://smartcode-editor.vercel.app',
  // Vercel preview deployments: <project>-<hash>-<team>.vercel.app, limited to this team so other Vercel projects can't match
  'https://smart-code-editor-*-smart-code-editor-org.vercel.app',
]
const ORIGIN_PATTERNS = (Deno.env.get('ALLOWED_ORIGINS')?.split(',') ?? DEFAULT_ORIGINS)
  .map((o) => o.trim())
  .filter(Boolean)
  .map((o) => new RegExp(`^${o.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+')}$`, 'i'))

const isAllowedOrigin = (origin: string) => ORIGIN_PATTERNS.some((p) => p.test(origin))

// CORS headers for this request, or null when a browser on another site is calling (answer it with forbidden()).
// Non-browser callers send no Origin; they are not a CORS question and each function still checks auth itself.
export const corsHeaders = (req: Request): Record<string, string> | null => {
  const origin = req.headers.get('Origin')
  if (origin && !isAllowedOrigin(origin)) return null
  return {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
    ...(origin && { 'Access-Control-Allow-Origin': origin }),
  }
}

export const forbidden = () => new Response('Origin not allowed', { status: 403, headers: { Vary: 'Origin' } })
