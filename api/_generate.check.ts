// Checks the generate route's input and output handling: npm test
// The _ prefix keeps this file from being deployed as a Vercel Function
import assert from 'node:assert'
import { ApiError } from '@google/genai'
import handler, { firstFreeModel, parseRequest, stripFences } from './generate.ts'

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

// A busy model hands over to the next one, so the request still succeeds
console.warn = () => {}
const failWith = (status: number) => () => Promise.reject(new ApiError({ message: 'x', status }))
const attempts = (replies: Array<() => Promise<string>>) => {
  const tried: string[] = []
  const call = (model: string) => {
    tried.push(model)
    return replies[tried.length - 1]()
  }
  return { tried, call }
}
const ok = () => Promise.resolve('code')

const fellBack = attempts([failWith(503), failWith(429), ok])
assert.equal(await firstFreeModel(fellBack.call), 'code')
assert.equal(new Set(fellBack.tried).size, 3)

const firstFree = attempts([ok])
assert.equal(await firstFreeModel(firstFree.call), 'code')
assert.equal(firstFree.tried.length, 1)

// Every model busy is null, which the route answers as busy
assert.equal(await firstFreeModel(attempts([failWith(503), failWith(503), failWith(503)]).call), null)

// A bad key or request fails the same on every model, so it stops at the first one
const badKey = attempts([failWith(403)])
await assert.rejects(firstFreeModel(badKey.call), ApiError)
assert.equal(badKey.tried.length, 1)

// A timeout isn't busy: the shared deadline has passed, so no other model is tried
const timedOut = attempts([() => Promise.reject(new DOMException('late', 'TimeoutError'))])
await assert.rejects(firstFreeModel(timedOut.call), /late/)
assert.equal(timedOut.tried.length, 1)

// Only POST reaches the key or Gemini; without server env the route refuses rather than calling out
assert.equal((await handler.fetch(new Request('http://x/api/generate'))).status, 405)
delete process.env.GEMINI_API_KEY
assert.equal((await handler.fetch(new Request('http://x/api/generate', { method: 'POST' }))).status, 500)

console.log('generate checks passed')
