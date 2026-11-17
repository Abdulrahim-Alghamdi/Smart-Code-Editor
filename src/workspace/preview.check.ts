// فحوص تضمين ملفات المشروع في معاينة HTML. تشغيلها: npm test
import assert from 'node:assert'
import { inlineProjectFiles } from './preview.ts'

const files = [
  { name: 'style.css', content: 'body { color: red }' },
  { name: 'app.js', content: "console.log('</script> inside')" },
]

assert.equal(inlineProjectFiles('<link rel="stylesheet" href="style.css">', files), '<style>body { color: red }</style>')
assert.equal(inlineProjectFiles("<link href='./css/style.css' rel=stylesheet />", files), '<style>body { color: red }</style>', 'path and quotes')
assert.equal(inlineProjectFiles('<script src="app.js"></script>', files), "<script>console.log('<\\/script> inside')</script>", 'closing tag escaped')
assert.equal(inlineProjectFiles('<script type="module" src="app.js?v=2"></script>', files), "<script type=\"module\">console.log('<\\/script> inside')</script>")

// يبقى كما هو
const external = '<link rel="stylesheet" href="https://cdn.example.com/style.css"><script src="//cdn.example.com/app.js"></script>'
assert.equal(inlineProjectFiles(external, files), external, 'external links')
assert.equal(inlineProjectFiles('<link rel="icon" href="style.css">', files), '<link rel="icon" href="style.css">', 'not a stylesheet')
assert.equal(inlineProjectFiles('<script src="missing.js"></script>', files), '<script src="missing.js"></script>', 'no such file')

console.log('preview checks passed')
