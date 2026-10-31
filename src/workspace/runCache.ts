import { localDb } from '@/services/localDb'

export interface Line {
  level: string
  text: string
}

// نتيجة تشغيل مكتمل: أسطر المخرجات ومدة التشغيل بالثواني (نص، كما يعرضه سطر الإحصاءات)
export interface CachedRun {
  lines: Line[]
  time: string | null
}

// الذاكرة للتشغيل المتكرر في الجلسة نفسها، و IndexedDB ليبقى بعد إعادة تحميل الصفحة
const memory = new Map<string, CachedRun>()

// SHA-256 للغة واسم الملف والكود: اسم الملف داخل الكاش لأن رسائل الأخطاء تذكره
export async function runKey(language: string, name: string, code: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${language}\0${name}\0${code}`))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function getCachedRun(key: string): Promise<CachedRun | null> {
  const hit = memory.get(key) ?? (await localDb.getRun<CachedRun>(key).catch(() => null))
  if (hit) memory.set(key, hit)
  return hit
}

// shortcut: يُحفظ ناتج أي برنامج مكتمل، فبرنامج عشوائي أو يعتمد على الوقت يعيد الناتج نفسه حتى "تشغيل جديد"؛ الواجهة توضّح أن النتيجة محفوظة
export function putCachedRun(key: string, run: CachedRun) {
  memory.set(key, run)
  localDb.putRun(key, run).catch(console.error)
}
