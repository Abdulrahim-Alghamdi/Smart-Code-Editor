// اللغات التي يشغّلها المتصفح نفسه: HTML و JavaScript في iframe معزول، وبايثون (Pyodide) و SQL (sql.js) في Worker
export const BROWSER_RUN = ['html', 'javascript', 'python', 'sql']
// اللغات التي تُرسل لدالة run على الخادم (Wandbox)؛ تطابق COMPILERS في supabase/functions/run/index.ts. Wandbox بلا Kotlin و Dart، و Swift فيه معطّل حالياً
export const SERVER_RUN = ['java', 'c', 'cpp', 'csharp', 'go', 'rust', 'php', 'ruby', 'typescript', 'shell']

// أقصى انتظار لتشغيل على الخادم، إعادة المحاولة ضمنه؛ يطابق LIMIT_MS في الدالة (التي تجيب قبله بقليل).
// الزيادة فوق هذا بلا فائدة: Wandbox ينهي أي طلب عند 60 ثانية تقريباً
export const RUN_LIMIT_MS = 60_000
