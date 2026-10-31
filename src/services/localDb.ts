// IndexedDB لما هو أكبر من localStorage: سجل نسخ كل ملف، ومسودات المسجّل التي لم تصل لحسابه بعد (انقطاع الشبكة).
// البيانات على هذا المتصفح فقط، وكل دالة ترفض (reject) إذا كان IndexedDB محظوراً، والقرار عند المستدعي
import type { CloudFile } from './projectService'

export interface Snapshot {
  id: number
  fileId: string
  name: string
  language: string
  content: string
  createdAt: number
  savedAt: number
  // نسخة حُفظت قبل استعادة نسخة أقدم، فلا تُدمج فيها تعديلات بعدها
  kept: boolean
}

export const SNAPSHOT_LIMIT = 50
// تعديلات الدقيقة الواحدة تُدمج في نسخة واحدة، حتى لا تملأ كل وقفة كتابة السجل
const MERGE_WINDOW_MS = 60_000

let db: Promise<IDBDatabase> | null = null
const open = () =>
  (db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('sce', 2)
    req.onupgradeneeded = (event) => {
      if (event.oldVersion < 1) {
        req.result.createObjectStore('snapshots', { keyPath: 'id', autoIncrement: true }).createIndex('fileId', 'fileId')
        req.result.createObjectStore('drafts', { keyPath: 'owner' })
      }
      // الإصدار 2: نتائج التشغيل المحفوظة، مرتبة بوقت الحفظ لحذف الأقدم
      if (event.oldVersion < 2) req.result.createObjectStore('runs', { keyPath: 'key' }).createIndex('at', 'at')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }))

const done = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

const committed = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = tx.onabort = () => reject(tx.error)
  })

const store = async (name: 'snapshots' | 'drafts' | 'runs', mode: IDBTransactionMode) => (await open()).transaction(name, mode).objectStore(name)

// آخر نتائج تشغيل تُحفظ على الجهاز؛ الأقدم يُحذف
export const RUN_CACHE_LIMIT = 100

export const localDb = {
  async getRun<T>(key: string): Promise<T | null> {
    const runs = await store('runs', 'readonly')
    const row = (await done(runs.get(key))) as { value: T } | undefined
    return row?.value ?? null
  },

  async putRun(key: string, value: unknown) {
    const runs = await store('runs', 'readwrite')
    runs.put({ key, value, at: Date.now() })
    const keys = await done(runs.index('at').getAllKeys())
    for (const old of keys.slice(0, Math.max(0, keys.length - RUN_CACHE_LIMIT))) runs.delete(old)
    return committed(runs.transaction)
  },

  // يحفظ محتوى الملف نسخةً جديدة، أو يحدّث آخر نسخة إذا بدأت قبل أقل من دقيقة. keep تثبّت النسخة قبل الاستعادة.
  // لكل محتوى نسخة واحدة: محتوى موجود من قبل (استعادة أو تراجع إليه) تنتقل نسخته للأعلى بدل تكرارها
  async addSnapshot(file: CloudFile, keep = false) {
    const snapshots = await store('snapshots', 'readwrite')
    // shortcut: نسخ الملفات المغلقة تبقى حتى يُمسح تخزين المتصفح؛ إن كبرت أضف حداً كلياً
    const all = (await done(snapshots.index('fileId').getAll(file.id))) as Snapshot[]
    const last = all.at(-1)
    const same = all.find((s) => s.content === file.content)
    const now = Date.now()
    const entry = { fileId: file.id, name: file.name, language: file.language, content: file.content, createdAt: now, savedAt: now, kept: keep }

    if (same === last && last) {
      if (keep && !last.kept) snapshots.put({ ...last, kept: true })
    } else if (same) {
      // مثبّتة، حتى لا تُدمج فيها تعديلات الدقيقة التالية فتضيع النسخة المستعادة
      snapshots.delete(same.id)
      snapshots.add({ ...entry, kept: true })
    } else if (last && !last.kept && !keep && now - last.createdAt < MERGE_WINDOW_MS) {
      snapshots.put({ ...last, name: file.name, language: file.language, content: file.content, savedAt: now })
    } else {
      snapshots.add(entry)
      for (const old of all.slice(0, Math.max(0, all.length + 1 - SNAPSHOT_LIMIT))) snapshots.delete(old.id)
    }
    return committed(snapshots.transaction)
  },

  // الأحدث أولاً، بلا تكرار للمحتوى نفسه (نسخ قديمة حُفظت قبل منع التكرار)
  async listSnapshots(fileId: string): Promise<Snapshot[]> {
    const snapshots = await store('snapshots', 'readonly')
    const seen = new Set<string>()
    return ((await done(snapshots.index('fileId').getAll(fileId))) as Snapshot[])
      .reverse()
      .filter((s) => {
        if (seen.has(s.content)) return false
        seen.add(s.content)
        return true
      })
  },

  // يحذف النسخة ومعها أي نسخة قديمة بالمحتوى نفسه، لأن القائمة تعرض واحدة منها فقط
  async deleteSnapshot(snapshot: Snapshot) {
    const snapshots = await store('snapshots', 'readwrite')
    const all = (await done(snapshots.index('fileId').getAll(snapshot.fileId))) as Snapshot[]
    for (const s of all) if (s.content === snapshot.content) snapshots.delete(s.id)
    return committed(snapshots.transaction)
  },

  async clearSnapshots(fileId: string) {
    const snapshots = await store('snapshots', 'readwrite')
    for (const key of await done(snapshots.index('fileId').getAllKeys(fileId))) snapshots.delete(key)
    return committed(snapshots.transaction)
  },

  // تبويبات المسجّل كاملة كما كانت عند فشل آخر مزامنة؛ null إذا وصل كل شيء للحساب
  async loadDrafts(owner: string): Promise<CloudFile[] | null> {
    const drafts = await store('drafts', 'readonly')
    const row = (await done(drafts.get(owner))) as { files: CloudFile[] } | undefined
    return row?.files.length ? row.files : null
  },

  async saveDrafts(owner: string, files: CloudFile[]) {
    const drafts = await store('drafts', 'readwrite')
    drafts.put({ owner, files, savedAt: Date.now() })
    return committed(drafts.transaction)
  },

  async clearDrafts(owner: string) {
    const drafts = await store('drafts', 'readwrite')
    drafts.delete(owner)
    return committed(drafts.transaction)
  },
}
