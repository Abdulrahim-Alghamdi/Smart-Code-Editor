// اللغات التي يشغّلها المتصفح نفسه: HTML و JavaScript في iframe معزول، وبايثون (Pyodide) و SQL (sql.js) في Worker
export const BROWSER_RUN = ['html', 'javascript', 'python', 'sql']
// اللغات التي تُرسل لدالة run على الخادم (Wandbox)؛ تطابق COMPILERS في supabase/functions/run/index.ts. Wandbox بلا Kotlin و Dart، و Swift فيه معطّل حالياً
export const SERVER_RUN = ['java', 'c', 'cpp', 'csharp', 'go', 'rust', 'php', 'ruby', 'typescript', 'shell']

// أقصى انتظار لتشغيل على الخادم، إعادة المحاولة ضمنه؛ يطابق LIMIT_MS في الدالة (التي تجيب قبله بقليل).
// الزيادة فوق هذا بلا فائدة: Wandbox ينهي أي طلب عند 60 ثانية تقريباً
export const RUN_LIMIT_MS = 60_000

// JSPI يترك input() ينتظر فعلاً داخل Worker بلا ترويسات عزل للموقع
export const LIVE_INPUT = typeof WebAssembly !== 'undefined' && 'Suspending' in WebAssembly

// كيف يصل الإدخال للبرنامج، حسب ما يسمح به مكان التشغيل:
// live: البرنامج ينتظر فعلاً (بايثون في المتصفح).
// replay: لا إيقاف مؤقت، لكن نفاد المدخلات ظاهر، فيُسأل المستخدم ويعاد التشغيل بكل الإجابات (Scanner و prompt).
// collect: Wandbox يغلق stdin، و C و C++ و Go وأمثالها تكمل بقيم فارغة بلا إشارة، فتُكتب المدخلات قبل التشغيل
export function inputMode(language: string, code: string) {
  if (language === 'python') return LIVE_INPUT ? 'live' : 'collect'
  if (language === 'javascript' || language === 'html') return 'replay'
  if (language === 'java' && /\bScanner\b/.test(code)) return 'replay'
  return SERVER_RUN.includes(language) ? 'collect' : null
}

// lines: قراءة سطر كامل في كل مرة. tokens: قراءة أخرى، غالباً كلمة كلمة، فتكفي المسافات بين القيم
const INPUT_READS: Record<string, { lines?: RegExp; tokens?: RegExp }> = {
  python: { lines: /\binput\s*\(/g, tokens: /\bsys\.stdin\b/ },
  java: { lines: /\.(nextLine|readLine)\s*\(/g, tokens: /\bScanner\b|\bSystem\.in\b/ },
  c: { lines: /\b(fgets|getline|gets)\s*\(/g, tokens: /\b(scanf|getchar)\s*\(/ },
  cpp: { lines: /\b(fgets|getline)\s*\(/g, tokens: /\bcin\b|\bscanf\s*\(/ },
  csharp: { lines: /\bConsole\.ReadLine\s*\(/g, tokens: /\bConsole\.Read\s*\(/ },
  go: { lines: /\.ReadString\s*\(|\.Scan\(\)|\bfmt\.Scanln\s*\(/g, tokens: /\bfmt\.Scan|\bos\.Stdin\b/ },
  rust: { lines: /\.read_line\s*\(/g, tokens: /\bstdin\(\)/ },
  php: { lines: /\b(fgets|readline)\s*\(/g, tokens: /\bSTDIN\b|php:\/\/stdin/ },
  ruby: { lines: /\b(gets|readline)\b/g, tokens: /\bSTDIN\b|\$stdin\b/ },
  typescript: { tokens: /\bprocess\.stdin\b|readFileSync\(\s*0|\/dev\/stdin/ },
  shell: { lines: /(^|[\s;&|(])read\s/g },
  javascript: { lines: /\bprompt\s*\(/g },
  html: { lines: /\bprompt\s*\(/g },
}

const lineReads = (language: string, code: string) => {
  const pattern = INPUT_READS[language]?.lines
  return pattern ? (code.match(pattern)?.length ?? 0) : 0
}

export const readsInput = (language: string, code: string) => {
  const tokens = INPUT_READS[language]?.tokens
  return lineReads(language, code) > 0 || (tokens ? code.search(tokens) >= 0 : false)
}

// "10 + 5" في سطر واحد لبرنامج يقرأ سطرين أو أكثر سيفشل حتماً، فتُفصل قيمه. ما عدا ذلك يبقى كما كُتب:
// قراءة كلمة كلمة (Scanner.nextDouble و cin) تفهم المسافات، و input().split() أو اسم كامل يحتاجان السطر سليماً
export function prepareInput(language: string, code: string, stdin: string) {
  const line = stdin.trim()
  if (line.includes('\n') || lineReads(language, code) < 2 || /split|fields/i.test(code)) return stdin
  return line.split(/\s+/).join('\n')
}

// نفاد المدخلات. Scanner ضروري في جافا لأن الاستثناء نفسه يصدر عن Optional والمكرِّرات
export const MISSING_INPUT = /NoSuchElementException[\s\S]*\bScanner\.|\bEOFError\b/
