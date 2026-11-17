// معاينة HTML تعمل في iframe معزول بلا عنوان، فلا يصل فيه <link href="style.css"> ولا <script src="app.js"> إلى ملفات المشروع.
// لذلك يوضع محتوى الملف نفسه مكانهما إذا كان في المشروع ملف بهذا الاسم؛ الروابط الخارجية (https://) تبقى كما هي

interface NamedFile {
  name: string
  content: string
}

// ./style.css و css/style.css تطابقان ملفاً اسمه style.css: تبويبات المحرر بلا مجلدات
const lookup = (files: NamedFile[], ref: string) => {
  if (/^[a-z]+:|^\/\//i.test(ref)) return undefined
  const name = ref.split(/[?#]/)[0].split('/').pop()
  return files.find((f) => f.name === name)
}

// لا يُغلق <style> أو <script> قبل نهاية الملف المضمَّن
const escapeClosing = (text: string, tag: string) => text.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`)

export function inlineProjectFiles(html: string, files: NamedFile[]) {
  return html
    .replace(/<link\b[^>]*>/gi, (tag) => {
      if (!/\brel\s*=\s*["']?stylesheet/i.test(tag)) return tag
      const file = lookup(files, /\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1] ?? '')
      return file ? `<style>${escapeClosing(file.content, 'style')}</style>` : tag
    })
    .replace(/<script\b([^>]*)\bsrc\s*=\s*["']?([^"'\s>]+)["']?([^>]*)>\s*<\/script>/gi, (tag, before: string, src: string, after: string) => {
      const file = lookup(files, src)
      return file ? `<script${`${before}${after}`.trimEnd()}>${escapeClosing(file.content, 'script')}</script>` : tag
    })
}
