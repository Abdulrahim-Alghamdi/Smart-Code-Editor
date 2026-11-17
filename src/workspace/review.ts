// شكل مراجعة الذكاء الاصطناعي والتحقق منه قبل عرضه

export interface FileContent {
  name: string
  content: string
}

export interface ReviewText {
  bugs: string[]
  rootCause: string
  fixes: string[]
  optimizations: string[]
}

// شكل المراجعة المنظمة التي نطلبها من Gemini: الشرح باللغتين حتى يتبع لغة الواجهة عند تبديلها، والكود مشترك
export interface Review {
  ar: ReviewText
  en: ReviewText
  fixedFiles: FileContent[]
  renamedFiles: Array<{ from: string; to: string }>
  suggestedFiles: FileContent[]
}

// الرد قادم من خدمة خارجية، لذا نتحقق من شكله قبل عرضه
const isFileList = (v: unknown): v is FileContent[] =>
  Array.isArray(v) && v.every((f) => typeof f?.name === 'string' && typeof f?.content === 'string')

const isReviewText = (v: ReviewText | undefined) =>
  Array.isArray(v?.bugs) && typeof v.rootCause === 'string' && Array.isArray(v.fixes) && Array.isArray(v.optimizations)

export const parseReview = (text: string): Review | null => {
  try {
    const r = JSON.parse(text)
    const ok =
      isReviewText(r.ar) &&
      isReviewText(r.en) &&
      isFileList(r.fixedFiles) &&
      Array.isArray(r.renamedFiles) &&
      r.renamedFiles.every((x: Review['renamedFiles'][number]) => typeof x?.from === 'string' && typeof x?.to === 'string') &&
      isFileList(r.suggestedFiles)
    if (!ok) return null
    // الأسماء المقترحة تصبح أسماء تبويبات، فنزيل منها أي مسار ونهمل الفارغ
    const baseName = (name: string) => name.split(/[\\/]/).pop()!.trim()
    r.suggestedFiles = r.suggestedFiles
      .map((f: FileContent) => ({ ...f, name: baseName(f.name) }))
      .filter((f: FileContent) => f.name)
    r.renamedFiles = r.renamedFiles
      .map((x: Review['renamedFiles'][number]) => ({ ...x, to: baseName(x.to) }))
      .filter((x: Review['renamedFiles'][number]) => x.to)
    return r
  } catch {
    return null
  }
}
