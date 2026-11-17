// رابط مشاركة ملف: الملف مضغوطاً داخل جزء # من الرابط، فلا يُرسل لأي خادم ولا يحتاج جدولاً أو حساباً.
// shortcut: الرابط يطول مع الملف (حد MAX_HASH)؛ انقل المشاركة لجدول في Supabase إن احتاج المستخدمون ملفات أكبر

export interface SharedFile {
  name: string
  language: string
  content: string
}

export const SHARE_PREFIX = '#share='
// روابط أطول من هذا تقصّها بعض تطبيقات المحادثة
export const MAX_HASH = 16_000

const pipe = async (bytes: Uint8Array, stream: CompressionStream | DecompressionStream) =>
  new Uint8Array(await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream)).arrayBuffer())

const toBase64Url = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const fromBase64Url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

// null: الملف أكبر من أن يوضع في رابط
export async function encodeShare(file: SharedFile): Promise<string | null> {
  const json = JSON.stringify([file.name, file.language, file.content])
  const hash = SHARE_PREFIX + toBase64Url(await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw')))
  return hash.length <= MAX_HASH ? hash : null
}

// الرابط قادم من أي أحد، فيُتحقق من شكله قبل فتحه في المحرر. null: ليس رابط مشاركة أو تالف
export async function decodeShare(hash: string): Promise<SharedFile | null> {
  if (!hash.startsWith(SHARE_PREFIX) || hash.length > MAX_HASH) return null
  try {
    const bytes = await pipe(fromBase64Url(hash.slice(SHARE_PREFIX.length)), new DecompressionStream('deflate-raw'))
    const [name, language, content] = JSON.parse(new TextDecoder().decode(bytes))
    if (typeof name !== 'string' || typeof language !== 'string' || typeof content !== 'string') return null
    // اسم الملف يصبح اسم تبويب: بلا مسار، وبطول معقول
    const base = name.split(/[\\/]/).pop()!.trim().slice(0, 100)
    return base ? { name: base, language, content } : null
  } catch {
    return null
  }
}
