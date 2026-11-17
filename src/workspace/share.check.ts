// فحوص رابط المشاركة. تشغيلها: npm test
import assert from 'node:assert'
import { decodeShare, encodeShare, MAX_HASH, SHARE_PREFIX } from './share.ts'

const file = { name: 'main.py', language: 'python', content: "print('مرحبا')\n# + / = في الكود" }
const hash = await encodeShare(file)
assert.ok(hash?.startsWith(SHARE_PREFIX))
assert.deepEqual(await decodeShare(hash!), file, 'round trip keeps Arabic and symbols')

assert.equal(await decodeShare('#other'), null)
assert.equal(await decodeShare(`${SHARE_PREFIX}not-valid!!`), null, 'damaged link')
assert.equal(await decodeShare(SHARE_PREFIX + (await encodeShare({ ...file, name: '' }))!.slice(SHARE_PREFIX.length)), null, 'empty name')
assert.equal((await decodeShare((await encodeShare({ ...file, name: '../../etc/x.py' }))!))?.name, 'x.py', 'path stripped')

// كود عشوائي لا يُضغط، فيتجاوز الحد
const noise = Array.from(crypto.getRandomValues(new Uint8Array(MAX_HASH)), (b) => String.fromCharCode(33 + (b % 90))).join('')
assert.equal(await encodeShare({ ...file, content: noise }), null, 'too large for a link')

console.log('share checks passed')
