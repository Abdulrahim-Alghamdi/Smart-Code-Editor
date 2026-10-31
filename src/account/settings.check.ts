// فحص إعدادات المحرر وقراءة الملف الشخصي: npm test
import assert from 'node:assert'
import { DEFAULT_EDITOR_SETTINGS, parseEditorSettings } from '../workspace/editorSettings.ts'
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

// --- الملف الشخصي القادم من الخادم
assert.equal(parseProfile({ name: 'x' }), null)
assert.equal(parseProfile({ email: 'a@b.co', avatar: 'https://tracker.example/pixel.png' })!.avatar, null, 'لا روابط صور خارجية')
assert.equal(parseProfile({ email: 'a@b.co', avatar: 'data:image/webp;base64,AAA' })!.avatar, 'data:image/webp;base64,AAA')

console.log('editor settings + profile: ok')
