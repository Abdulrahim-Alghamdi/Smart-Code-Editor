// سجل الملفات الأخيرة: لقطة من كل ملف عمل عليه المستخدم، تبقى بعد إعادة تحميل الصفحة
export interface HistoryEntry {
  // معرّف الملف في المحرر، فتحديث الملف نفسه يحدّث لقطته بدل إضافة سطر جديد
  id: string
  name: string
  language: string
  content: string
  // وقت آخر تعديل بالميلي ثانية
  updatedAt: number
}

export const HISTORY_LIMIT = 20
// shortcut: الملفات الأكبر لا تُسجَّل حتى لا يمتلئ localStorage (حوالي 5 ميغابايت)؛ ارفع الحد مع تخزين على خادم
export const HISTORY_MAX_CHARS = 100_000

export const isHistoryEntry = (v: unknown): v is HistoryEntry => {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  return (
    typeof e.id === 'string' &&
    typeof e.name === 'string' &&
    e.name.trim() !== '' &&
    typeof e.language === 'string' &&
    typeof e.content === 'string' &&
    typeof e.updatedAt === 'number' &&
    Number.isFinite(e.updatedAt)
  )
}

// يرفض السجل كله إذا لم يكن مصفوفة، ويتجاهل الإدخالات التالفة وحدها
export const parseHistory = (raw: unknown): HistoryEntry[] | null =>
  Array.isArray(raw)
    ? raw
        .filter(isHistoryEntry)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, HISTORY_LIMIT)
    : null

// يضع أحدث لقطة في الأعلى ويزيل لقطة الملف نفسه القديمة. يعيد السجل نفسه (المرجع ذاته) إذا كان الملف فارغاً
// أو كبيراً أو لم يتغير منذ آخر لقطة، فلا يُكتب التخزين ولا تتكرر الكتابة بلا نهاية
export const recordEntry = (history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] => {
  if (!entry.content.trim() || entry.content.length > HISTORY_MAX_CHARS) return history
  const last = history.find((e) => e.id === entry.id)
  if (last && last.content === entry.content && last.name === entry.name && last.language === entry.language) return history
  return [entry, ...history.filter((e) => e.id !== entry.id)].slice(0, HISTORY_LIMIT)
}
