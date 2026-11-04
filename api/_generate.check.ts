// Checks the generate route's input and output handling: npm test
// The _ prefix keeps this file from being deployed as a Vercel Function
import assert from 'node:assert'
import handler, { parseRequest, stripFences } from './generate.ts'

// Raw code passes through untouched, apart from the blank edges
assert.equal(stripFences('const a = 1\n'), 'const a = 1')
assert.equal(stripFences('    indented()\n  more()'), 'indented()\n  more()')

// A fence around the whole reply is removed, with or without a language tag
assert.equal(stripFences('```js\nconst a = 1\n```'), 'const a = 1')
assert.equal(stripFences('```\nconst a = 1\n```\n'), 'const a = 1')
assert.equal(stripFences('\n```python\nprint(1)\n\nprint(2)\n```'), 'print(1)\n\nprint(2)')

// A fence inside the code (a Markdown file, a doc comment) stays
assert.equal(stripFences('# Title\n\n```js\nx\n```\n\nEnd'), '# Title\n\n```js\nx\n```\n\nEnd')

// A reply of nothing stays empty, so the route answers badResponse and never blanks the file
assert.equal(stripFences(''), '')
assert.equal(stripFences('```\n```'), '')

// Request shape and size are checked before any tokens are spent
assert.deepEqual(parseRequest({ prompt: ' sort a list ', language: 'C#' }), { prompt: 'sort a list', language: 'C#' })
for (const bad of [null, undefined, 'text', {}, { prompt: 'x' }, { language: 'Go' }, { prompt: 1, language: 'Go' }, { prompt: '   ', language: 'Go' }, { prompt: 'x', language: ' ' }])
  assert.equal(parseRequest(bad), null)
assert.equal(parseRequest({ prompt: 'x'.repeat(4_001), language: 'Go' }), null)
assert.ok(parseRequest({ prompt: 'x'.repeat(4_000), language: 'Go' }))
assert.equal(parseRequest({ prompt: 'x', language: 'x'.repeat(31) }), null)

// Only POST reaches the key or Gemini; without server env the route refuses rather than calling out
assert.equal((await handler.fetch(new Request('http://x/api/generate'))).status, 405)
delete process.env.GEMINI_API_KEY
assert.equal((await handler.fetch(new Request('http://x/api/generate', { method: 'POST' }))).status, 500)

console.log('generate checks passed')
