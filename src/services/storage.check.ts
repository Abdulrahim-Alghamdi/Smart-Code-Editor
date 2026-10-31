// فحص طبقة التخزين بمحوّل في الذاكرة: npm test
import assert from 'node:assert'
import { memoryAdapter, setStorageAdapter, storage, type StorageAdapter } from './storage.ts'

const mem = memoryAdapter()
setStorageAdapter(mem)

// كتابة وقراءة JSON
assert.equal(await storage.set('k', { a: 1, list: [1, 2] }), true)
assert.deepEqual(await storage.get('k'), { a: 1, list: [1, 2] })

// مفتاح غير موجود
assert.equal(await storage.get('missing'), null)

// null يحذف المفتاح
assert.equal(await storage.set('k', null), true)
assert.equal(await storage.get('k'), null)

// القيم القديمة المحفوظة نصاً خاماً قبل JSON تُقرأ كما هي، والأرقام تُقرأ أرقاماً
await mem.set('lang', 'en')
assert.equal(await storage.get('lang'), 'en')
await mem.set('count', '1')
assert.equal(await storage.get('count'), 1)

// محوّل يفشل (تخزين ممتلئ أو خادم لا يرد): set يعيد false و get يعيد null بدل رمي خطأ
const broken: StorageAdapter = {
  get: async () => {
    throw new Error('offline')
  },
  set: async () => {
    throw new Error('quota')
  },
  remove: async () => {
    throw new Error('offline')
  },
}
setStorageAdapter(broken)
assert.equal(await storage.set('k', 1), false)
assert.equal(await storage.set('k', null), false)
assert.equal(await storage.get('k'), null)

console.log('storage: ok')
