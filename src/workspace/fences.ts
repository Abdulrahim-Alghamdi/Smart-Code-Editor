// The AI is asked for raw code, but a model can still wrap it in a fence, which would land in the user's file
export const stripFences = (text: string) => (/^\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/.exec(text)?.[1] ?? text).trim()

// /api/generate streams the code, then one END byte and a status: "ok", or an error key (network, busy, ...).
// A stream cut without that tail (the function killed, the connection dropped) is an error, never half a file.
export const END = '\u0000'
export const readGenerated = (body: string): { code: string } | { error: string } => {
  const at = body.lastIndexOf(END)
  if (at === -1) return { error: 'network' }
  const status = body.slice(at + 1)
  if (status !== 'ok') return { error: status || 'network' }
  const code = stripFences(body.slice(0, at))
  return code ? { code } : { error: 'badResponse' }
}
