// اللغات التي يشغّلها المتصفح نفسه: HTML و JavaScript في iframe معزول، وبايثون (Pyodide) و SQL (sql.js) في Worker
export const BROWSER_RUN = ['html', 'javascript', 'python', 'sql']
// اللغات التي تُرسل لدالة run على الخادم (Wandbox)؛ تطابق COMPILERS في supabase/functions/run/index.ts. Wandbox بلا Kotlin و Dart، و Swift فيه معطّل حالياً
export const SERVER_RUN = ['java', 'c', 'cpp', 'csharp', 'go', 'rust', 'php', 'ruby', 'typescript', 'shell']

// أقصى انتظار لتشغيل على الخادم، إعادة المحاولة ضمنه؛ يطابق LIMIT_MS في الدالة (التي تجيب قبله بقليل).
// Go و Rust أبطأ ترجمة على Wandbox (قيس 19-30 ثانية)
const RUN_LIMIT_MS: Record<string, number> = { go: 30_000, rust: 30_000 }
export const runLimitMs = (language: string) => RUN_LIMIT_MS[language] ?? 15_000
