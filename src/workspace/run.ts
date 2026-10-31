// اللغات التي يشغّلها المتصفح نفسه داخل iframe معزول
export const BROWSER_RUN = ['html', 'javascript']
// اللغات التي تُرسل لدالة run على الخادم (Wandbox)؛ تطابق COMPILERS في supabase/functions/run/index.ts. Wandbox بلا Kotlin و Dart
export const SERVER_RUN = ['python', 'java', 'c', 'cpp', 'csharp', 'go', 'rust', 'php', 'ruby', 'swift', 'typescript', 'shell', 'sql']
