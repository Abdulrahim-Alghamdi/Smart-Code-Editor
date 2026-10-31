// طبقة التخزين الموحدة: الواجهة تتعامل مع وعود (Promise) فقط، فاستبدال localStorage بخادم
// (Supabase / Firebase / REST) يعني كتابة StorageAdapter جديد واستدعاء setStorageAdapter، دون لمس المكوّنات

export interface StorageAdapter {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
}

// كل مفاتيح التطبيق في مكان واحد، حتى يعرف النسخ الاحتياطي والحذف ما يوجد
export const KEYS = {
  lang: 'sce.lang',
  editor: 'sce.editor',
} as const

export const memoryAdapter = (): StorageAdapter => {
  const data = new Map<string, string>()
  return {
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => void data.set(key, value),
    remove: async (key) => void data.delete(key),
  }
}

const localAdapter: StorageAdapter = {
  get: async (key) => localStorage.getItem(key),
  set: async (key, value) => localStorage.setItem(key, value),
  remove: async (key) => localStorage.removeItem(key),
}

// التصفح الخاص قد يمنع localStorage كلياً؛ عندها تبقى البيانات في الذاكرة حتى إغلاق الصفحة
const pickAdapter = (): StorageAdapter => {
  try {
    localStorage.setItem('sce.probe', '1')
    localStorage.removeItem('sce.probe')
    return localAdapter
  } catch {
    return memoryAdapter()
  }
}

let adapter: StorageAdapter = pickAdapter()

export const setStorageAdapter = (next: StorageAdapter) => {
  adapter = next
}

// القيم القديمة حُفظت نصاً خاماً ('en'، '1') قبل JSON، فنعيدها كما هي إذا لم تكن JSON
const decode = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export const storage = {
  // null إذا لم توجد القيمة أو تعذرت القراءة؛ التحقق من شكلها مسؤولية المستدعي
  async get(key: string): Promise<unknown> {
    try {
      const raw = await adapter.get(key)
      return raw === null ? null : decode(raw)
    } catch {
      return null
    }
  },

  // false إذا فشل الحفظ (التخزين ممتلئ أو الخادم لا يرد)، حتى لا تظهر رسالة نجاح كاذبة. null يحذف المفتاح
  async set(key: string, value: unknown): Promise<boolean> {
    try {
      if (value === null) await adapter.remove(key)
      else await adapter.set(key, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  },
}
