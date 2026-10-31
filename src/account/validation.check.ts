// فحص سريع لقواعد التحقق: npm test
import assert from 'node:assert'
import { checkAvatarFile, usernameFromEmail, validateProfile, type Profile } from './validation.ts'

const valid: Profile = { name: 'Sara Ali', username: 'sara_ali', email: 'sara@example.com', bio: 'Backend developer', avatar: null }
assert.deepEqual(validateProfile(valid), {})

assert.equal(validateProfile({ ...valid, name: '   ' }).name, 'required')
assert.equal(validateProfile({ ...valid, name: 'x'.repeat(61) }).name, 'tooLong')
assert.equal(validateProfile({ ...valid, username: '' }).username, 'required')
for (const good of ['dsa.4', 'sara.ali_2', 'a.b.c']) {
  assert.equal(validateProfile({ ...valid, username: good }).username, undefined, good)
}
for (const bad of ['ab', 'Sara', 'sara ali', 'sara-ali', 'x'.repeat(21), '.dsa', 'dsa.', 'dsa..4', '...']) {
  assert.equal(validateProfile({ ...valid, username: bad }).username, 'usernameFormat', bad)
}
for (const bad of ['sara', 'sara@', 'sara@example', 'sa ra@example.com']) {
  assert.equal(validateProfile({ ...valid, email: bad }).email, 'emailFormat', bad)
}
assert.equal(validateProfile({ ...valid, bio: 'x'.repeat(161) }).bio, 'tooLong')
assert.equal(validateProfile({ ...valid, bio: '' }).bio, undefined)

assert.equal(checkAvatarFile({ type: 'image/png', size: 1000 }), null)
assert.equal(checkAvatarFile({ type: 'image/gif', size: 1000 }), 'avatarType')
assert.equal(checkAvatarFile({ type: 'image/jpeg', size: 3 * 1024 * 1024 }), 'avatarSize')

assert.equal(usernameFromEmail('Sara.Ali@example.com'), 'sara.ali')
assert.equal(usernameFromEmail('.x..y.@example.com'), 'x.y')
assert.equal(usernameFromEmail('a@b.co'), 'a_user')
assert.equal(validateProfile({ ...valid, username: usernameFromEmail('Ünïcode+tag@example.com') }).username, undefined)

console.log('account validation: ok')
