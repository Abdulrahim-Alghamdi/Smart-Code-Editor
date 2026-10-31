// فحص إعدادات المحرر وسجل الملفات وقراءة الملف الشخصي: npm test
import assert from 'node:assert'
import { DEFAULT_EDITOR_SETTINGS, parseEditorSettings } from '../workspace/editorSettings.ts'
import { HISTORY_LIMIT, HISTORY_MAX_CHARS, parseHistory, recordEntry, type HistoryEntry } from '../workspace/history.ts'
import { parseProfile } from './validation.ts'

// --- إعدادات المحرر
assert.deepEqual(parseEditorSettings({}), DEFAULT_EDITOR_SETTINGS)
assert.equal(parseEditorSettings(null), null)
assert.equal(parseEditorSettings('x'), null)
assert.equal(parseEditorSettings({ fontSize: 99 })!.fontSize, 24)
assert.equal(parseEditorSettings({ fontSize: 2 })!.fontSize, 10)
assert.equal(parseEditorSettings({ fontSize: 'big' })!.fontSize, DEFAULT_EDITOR_SETTINGS.fontSize)
assert.equal(parseEditorSettings({ tabSize: 3 })!.tabSize, DEFAULT_EDITOR_SETTINGS.tabSize)
assert.equal(parseEditorSettings({ tabSize: 4 })!.tabSize, 4)
assert.equal(parseEditorSettings({ minimap: 'yes' })!.minimap, DEFAULT_EDITOR_SETTINGS.minimap)

// --- السجل
const entry = (id: string, updatedAt: number, content = 'code'): HistoryEntry => ({ id, name: `${id}.js`, language: 'javascript', content, updatedAt })
let h: HistoryEntry[] = []
h = recordEntry(h, entry('a', 1))
h = recordEntry(h, entry('b', 2))
h = recordEntry(h, entry('a', 3, 'new'))
assert.deepEqual(h.map((e) => e.id), ['a', 'b'], 'تحديث الملف نفسه ينقله للأعلى بدل التكرار')
assert.equal(h[0].content, 'new')
assert.equal(recordEntry(h, entry('c', 4, '   ')), h, 'الملف الفارغ لا يُسجَّل')
assert.equal(recordEntry(h, entry('a', 99, 'new')), h, 'ملف لم يتغير لا يُسجَّل من جديد ولا يغيّر الترتيب')
assert.equal(recordEntry(h, entry('c', 4, 'x'.repeat(HISTORY_MAX_CHARS + 1))), h, 'الملف الكبير لا يُسجَّل')
for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = recordEntry(h, entry(`f${i}`, 10 + i))
assert.equal(h.length, HISTORY_LIMIT)
assert.equal(parseHistory('nope'), null)
assert.deepEqual(parseHistory([entry('x', 1), { bad: true }, entry('y', 5)])!.map((e) => e.id), ['y', 'x'], 'يتجاهل التالف ويرتب الأحدث أولاً')

// --- الملف الشخصي القادم من الخادم
assert.equal(parseProfile({ name: 'x' }), null)
assert.equal(parseProfile({ email: 'a@b.co', avatar: 'https://tracker.example/pixel.png' })!.avatar, null, 'لا روابط صور خارجية')
assert.equal(parseProfile({ email: 'a@b.co', avatar: 'data:image/webp;base64,AAA' })!.avatar, 'data:image/webp;base64,AAA')

console.log('editor settings + history + profile: ok')
