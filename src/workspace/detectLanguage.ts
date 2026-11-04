// يتعرف على لغة كود ملصوق من بصمات نحوية عامة. لا توجد قاعدة تخص نطاقاً أو مثالاً بعينه، وكل نمط وزنه يعبّر عن قوة دلالته:
// 5 فأكثر يكفي وحده، وما دونه يحتاج دليلاً آخر. shortcut: مطابقة أنماط لا محلل نحوي؛ مقتطف قصير بلا سمات واضحة لا يُحسم
import { javaFileName } from '../../supabase/functions/_shared/javaSource.ts'

type Signals = [RegExp, number][]

// أقل مجموع لتغيير اللغة؛ الشك يبقي لغة الملف كما هي، فالتبديل الخاطئ أسوأ من عدم التبديل
const MIN_SCORE = 4

const JAVASCRIPT: Signals = [
  [/\bconsole\.(log|error|warn|info)\s*\(/, 5],
  [/\b(const|let)\s+[\w$[{]/, 2],
  [/\bvar\s+\w+\s*=/, 1],
  [/\bfunction\b\s*\*?\s*\w*\s*\([^)]*\)\s*\{/, 4],
  [/=>\s*[{(\w`'"[]/, 2],
  [/\b(document|window)\.\w+/, 4],
  [/\brequire\s*\(\s*['"]/, 4],
  [/^\s*(import|export)\b.*\bfrom\s+['"]/m, 5],
  [/^\s*export\s+(default|const|function|class)\b/m, 3],
  [/\bmodule\.exports\b/, 5],
  [/\b(alert|prompt)\s*\(/, 3],
  [/[=!]==/, 3],
  [/\.(map|filter|reduce|forEach)\s*\(/, 1],
  [/\bundefined\b/, 1],
]

// TypeScript يشمل JavaScript، فيأخذ أدلتها ويتقدم عليها بما يخصه فقط
const TYPESCRIPT_ONLY: Signals = [
  [/^\s*(export\s+)?(declare\s+)?(interface|type)\s+\w+(<[^>]*>)?\s*(=|\{|extends\b)/m, 4],
  [/[\w)\]]\??\s*:\s*(string|number|boolean|void|any|unknown|never)\b(\[\])?\s*[,)=;{|]/, 5],
  [/\)\s*:\s*(string|number|boolean|void|any|unknown|never|Promise<|\w+\[\])/, 4],
  [/\bas\s+(const|unknown|any|string|number)\b/, 3],
  [/\b(private|public|protected|readonly)\s+\w+\s*[:?]/, 3],
  [/<\w+>\s*\(.*\)\s*:/, 2],
]

const SIGNALS: Record<string, Signals> = {
  javascript: JAVASCRIPT,
  java: [
    [/^\s*import\s+(static\s+)?javax?\.[\w.*]+;/m, 6],
    [/\bpublic\s+static\s+void\s+main\s*\(\s*String/, 6],
    [/\bSystem\.(out|err|in)\b/, 5],
    [/^\s*package\s+[\w.]+;/m, 4],
    [/^\s*(public\s+)?(final\s+|abstract\s+|sealed\s+)*(class|interface|enum|record)\s+\w+/m, 2],
    [/^\s*public\s+(final\s+|abstract\s+)*class\s+\w+/m, 2],
    [/\b(private|public|protected)\s+(static\s+|final\s+)*(void|int|double|long|float|boolean|String|\w+<.*>|\w+\[\])\s+\w+/, 2],
    [/\bboolean\s+\w+/, 3],
    [/\bString(\[\])?\s+\w+\s*[=;,)]/, 3],
    [/\bnew\s+(ArrayList|HashMap|HashSet|LinkedList|Scanner|StringBuilder)\b/, 4],
    [/@Override\b/, 3],
    [/\bextends\s+\w+.*\{|\bimplements\s+\w+/, 1],
  ],
  csharp: [
    [/^\s*using\s+System\b/m, 6],
    [/\bConsole\.(Write|WriteLine|ReadLine|Read)\s*\(/, 6],
    [/^\s*namespace\s+[\w.]+/m, 3],
    [/\bstatic\s+(async\s+)?(void|int|Task)\s+Main\s*\(/, 5],
    [/\{\s*get;\s*((private|protected|internal)\s+)?(set|init);/, 5],
    [/\bforeach\s*\(\s*\w+\s+\w+\s+in\b/, 5],
    [/\basync\s+Task\b/, 3],
    [/\b(string|bool)\s+\w+\s*[=;,)]/, 3],
    [/^\s*public\s+(sealed\s+|abstract\s+|static\s+|partial\s+)*class\s+\w+/m, 1],
  ],
  cpp: [
    [/^\s*#include\s*<(iostream|vector|string|map|set|algorithm|memory|sstream|fstream|unordered_map|queue|stack|array|cmath|cstdio|cstdlib)>/m, 6],
    [/\bstd::\w+/, 5],
    [/\busing\s+namespace\s+std\b/, 6],
    [/\bc(out|in|err)\s*(<<|>>)/, 5],
    [/\btemplate\s*</, 4],
    [/^\s*(public|private|protected)\s*:\s*$/m, 5],
    [/\bint\s+main\s*\(/, 2],
    [/\bnullptr\b/, 3],
  ],
  c: [
    [/^\s*#include\s*<\w+\.h>/m, 5],
    [/\b(printf|scanf|malloc|free|fgets|strlen)\s*\(/, 2],
    [/\bint\s+main\s*\(/, 2],
    [/^\s*(typedef\s+)?struct\b/m, 1],
    [/^\s*#define\s+\w+/m, 2],
  ],
  go: [
    [/^\s*package\s+\w+\s*$/m, 3],
    [/^\s*func\s+(\(\w+\s+\*?\w+\)\s*)?\w+\s*\(/m, 4],
    [/\bfmt\.\w+\(/, 5],
    [/\w\s*:=\s*\S/, 2],
    [/^\s*import\s+(\(\s*$|")/m, 2],
    [/\bgo\s+func\b|\bchan\s+\w+|\bmake\(\[\]|\bdefer\s+\w/, 3],
    [/^\s*type\s+\w+\s+(struct|interface)\s*\{/m, 5],
  ],
  rust: [
    [/\bfn\s+main\s*\(\s*\)/, 5],
    [/\bfn\s+\w+(<[^>]*>)?\s*\(/, 3],
    [/\blet\s+mut\b/, 6],
    [/\b(println|print|format|vec|panic)!\s*[([]/, 6],
    [/^\s*(pub\s+)?(impl|trait|mod)\b/m, 3],
    [/^\s*use\s+(std|crate|super)::/m, 5],
    [/->\s*(Self|i32|i64|u32|u64|usize|f64|bool|String|&str|Vec<|Option<|Result<)/, 3],
    [/&(mut\s+)?(self|str)\b/, 3],
  ],
  python: [
    [/^\s*(async\s+)?def\s+\w+\s*\(.*\)\s*(->.*)?:\s*(#.*)?$/m, 6],
    [/^\s*class\s+\w+(\(.*\))?:\s*(#.*)?$/m, 6],
    [/^\s*from\s+[\w.]+\s+import\b/m, 5],
    [/^\s*import\s+[\w.]+(\s+as\s+\w+)?\s*$/m, 1],
    [/^\s*(if|elif|for|while|with|try|except|else|finally)\b.*:\s*(#.*)?$/m, 4],
    [/\bif\s+__name__\s*==/, 6],
    [/\bin\s+range\s*\(/, 4],
    [/^\s*print\s*\(/m, 4],
    [/\bself\.\w+/, 1],
    [/\b(None|True|False)\b/, 1],
    [/\bf["']/, 1],
    [/\blen\s*\(|\binput\s*\(/, 1],
  ],
  ruby: [
    [/^\s*def\s+[\w.]+[?!]?(\s*\(.*\))?\s*$/m, 3],
    [/^\s*end\s*$/m, 3],
    [/^\s*puts\b/m, 4],
    [/\bdo\s*\|[\w,\s]+\|/, 4],
    [/^\s*require(_relative)?\s+['"]/m, 3],
    [/\battr_(accessor|reader|writer)\b/, 5],
    [/\.(each|times|map)\b/, 1],
    [/\bnil\b/, 1],
  ],
  php: [
    [/<\?(php|=)/, 20],
    [/\$\w+\s*=[^=]/, 2],
    [/\$this->/, 3],
    [/\becho\s+["'$]/, 1],
  ],
  shell: [
    [/^#!.*\b(ba|z|k|da)?sh\b/, 8],
    [/^\s*(if|while|elif)\s+\[\[?\s/m, 4],
    [/^\s*(fi|done|esac)\s*$/m, 4],
    [/^\s*echo\s/m, 2],
    [/^\s*\w+=\S*\s*$/m, 1],
    [/\$\{?\w+\}?/, 1],
    [/^\s*(sudo|apt(-get)?|npm|git|cd|ls|mkdir|curl|chmod|export)\s/m, 3],
    [/^\s*\w+\s*\(\)\s*\{/m, 2],
  ],
  sql: [
    [/^\s*(WITH\b[\s\S]*)?SELECT\b[\s\S]*\bFROM\b/im, 5],
    [/^\s*SELECT\b/im, 3],
    [/^\s*(CREATE\s+(TABLE|INDEX|VIEW|DATABASE)|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+TABLE|ALTER\s+TABLE)\b/im, 6],
    [/\b(WHERE|GROUP\s+BY|ORDER\s+BY|INNER\s+JOIN|LEFT\s+JOIN)\b/i, 1],
  ],
  html: [
    [/<!doctype\s+html/i, 10],
    [/<html[\s>]/i, 6],
    [/<(head|body|div|span|script|style|section|main|nav|h[1-6]|p|ul|ol|table|form|button|input|img|a)(\s[^<>]*)?\/?>/i, 3],
    [/<\/\w+>/, 2],
  ],
  css: [
    [/^\s*@(media|import|keyframes|font-face|supports)\b/m, 5],
    [/^[ \t]*(:root|[.#][\w-]+|[a-z][a-z0-9]*)([ \t,>+~:.#\w-]|\[[^\]]*\])*\{[ \t]*$/m, 3],
    [/^[ \t]*(--)?[a-z-]+[ \t]*:[ \t]*[^;{}\n]+;[ \t]*$/m, 3],
    [/\b(margin|padding|color|background|font-size|display|border)\s*:/, 2],
  ],
  yaml: [
    [/^---\s*$/m, 3],
    [/^[\w-]+:[ \t]+\S.*\n[\w-]+:[ \t]+\S/m, 4],
    [/^[\w-]+:\s*\n\s+[-\w]/m, 3],
    [/^\s+-\s+[\w-]+:\s/m, 2],
  ],
  markdown: [
    [/^#{1,6}\s+\S/m, 3],
    [/^```/m, 3],
    [/\[[^\]]+\]\([^)]+\)/, 3],
    [/\*\*\S.*\S\*\*/, 2],
    [/^\s*([-*]|\d+\.)\s+\S/m, 1],
  ],
  kotlin: [
    [/\bfun\s+\w+\s*\(/, 6],
    [/^\s*(val|var)\s+\w+\s*(:\s*\w+)?\s*=/m, 3],
    [/\bdata\s+class\b/, 4],
    [/\bwhen\s*\(/, 2],
    [/\b(println|listOf|mapOf)\s*\(/, 2],
  ],
  dart: [
    [/\bvoid\s+main\s*\(\s*\)\s*(async\s*)?\{/, 6],
    [/^\s*import\s+'(dart|package):/m, 6],
    [/\bfinal\s+\w+\s*=/, 3],
    [/\bList<\w+>\s+\w+\s*=\s*\[/, 4],
    [/^\s*print\s*\(/m, 1],
    [/\$\{?\w+\}?/, 1],
  ],
  swift: [
    [/^\s*import\s+(Foundation|UIKit|SwiftUI|Combine)\b/m, 6],
    [/\bfunc\s+\w+\s*\(.*\)\s*(->\s*\S+\s*)?\{/, 4],
    [/^\s*(let|var)\s+\w+\s*(:\s*[\w[\]?]+)?\s*=/m, 2],
    [/^\s*(let|var)\s+\w+[^\n;]*\n[\s\S]*^\s*print\s*\(/m, 3],
    [/\b(guard|if)\s+let\b/, 3],
    [/\b\d+\.\.[.<]\s*\w+/, 3],
    [/\\\(\w+/, 3],
    [/^\s*print\s*\(/m, 1],
    [/\.(joined|sorted|count)\b/, 2],
  ],
}

// محتوى النصوص بيانات البرنامج لا بنيته، فبرنامج يطبع HTML يبقى بلغته. أسطر الاستيراد وحدود كتل Markdown تبقى لأن بصماتها فيها
const STRINGS = /(^[ \t]*(?:import\b|```).*$)|\/\*[\s\S]*?\*\/|R"(\w*)\([\s\S]*?\)\2"|\br(#*)"[\s\S]*?"\3|"""[\s\S]*?"""|'''[\s\S]*?'''|`(?:[^`\\]|\\[\s\S])*`|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/gm
// يبدأ بإعلان مستند أو بوسم له إغلاق: الوسوم هي الغلاف الخارجي، وما بداخلها من script وstyle جزء منها
const MARKUP = /^<(!doctype\s+html|[a-z!][\s\S]*<\/[a-z])/i

const structureOf = (code: string) => code.replace(STRINGS, (_, kept) => kept ?? '""')

const score = (code: string, signals: Signals) => signals.reduce((total, [pattern, weight]) => total + (pattern.test(code) ? weight : 0), 0)

const isJson = (code: string) => {
  try {
    return typeof JSON.parse(code) === 'object'
  } catch {
    return false
  }
}

// معرّف اللغة كما في LANGUAGES، أو null عند الشك
export function detectLanguage(code: string): string | null {
  const text = code.trim()
  if (!text) return null
  if (/^[[{]/.test(text) && isJson(text)) return 'json'

  if (MARKUP.test(text)) return /<\?(php|=)/.test(text) ? 'php' : 'html'

  const structure = structureOf(text)
  const scores = Object.entries(SIGNALS).map(([id, signals]) => [id, score(structure, signals)] as const)
  const only = score(structure, TYPESCRIPT_ONLY)
  if (only) scores.push(['typescript', score(structure, JAVASCRIPT) + only])
  const [best, second] = scores.sort((a, b) => b[1] - a[1])
  return best[1] >= MIN_SCORE && best[1] > second[1] ? best[0] : null
}

// لغات لا يحمل ملفها اسم نوع، وما يبدو فيها كذلك جزء من مثال أو من script داخلها
const NO_TYPES = new Set(['html', 'css', 'json', 'yaml', 'markdown', 'sql', 'shell'])
const DEFAULT_STEMS: Record<string, string> = { html: 'index', css: 'styles', php: 'index', sql: 'script', csharp: 'Program' }

// تعريف لا تصريح مسبق: class Foo; و struct Foo *p لا يُعرّفان شيئاً
const TYPE = /^([ \t]*)(?:template\s*<[^>]*>\s*)?(?:(?:public|private|protected|internal|abstract|final|sealed|static|partial|open|data|export|default|declare|typedef|pub(?:\(\w+\))?)\s+)*(?:class|struct|type(?=\s+\w+\s+struct\b))\s+(?!extends\b)(\w+)\b(?![ \t]*[;*&])/gm
const DEFAULT_EXPORT = /^export\s+default\s+(?:(?:async\s+)?(?:function\*?|class)\s+(?!extends\b)(\w+)|(\w+)\s*;?\s*$)/m
// الحرف الكبير يميّز مكوّن React، والصغير يستثني ثوابت مثل MAX_SIZE
const COMPONENT = /^([ \t]*)(?:export\s+)?(?:function|const)\s+([A-Z]\w*[a-z]\w*)\b(?=\s*[(<]|\s*=\s*(?:async\s*)?\()/gm

// shortcut: الأخير بين الأقل مسافة بادئة، لأن التعريف يلي عادةً ما يستخدمه؛ يخطئ في ملف يضع الرئيسي أولاً، ويحتاج عندها تحليل الاستخدام
const outermostLast = (code: string, pattern: RegExp) => {
  const found = [...code.matchAll(pattern)]
  const outer = Math.min(...found.map((match) => match[1].length))
  return found.findLast((match) => match[1].length === outer)?.[2]
}

const primaryName = (id: string, code: string) => {
  if (NO_TYPES.has(id)) return undefined
  const structure = structureOf(code)
  if (id !== 'javascript' && id !== 'typescript') return outermostLast(structure, TYPE)
  const exported = DEFAULT_EXPORT.exec(structure)
  return exported?.[1] ?? exported?.[2] ?? outermostLast(structure, TYPE) ?? outermostLast(structure, COMPONENT)
}

// اسم الملف الذي يناسب الكود: نوعه الرئيسي إن وُجد، وإلا الاسم المعتاد للغة
export function fileNameFor(language: { id: string; ext: string }, code: string) {
  if (language.id === 'java') return javaFileName(code) ?? 'Main.java'
  return `${primaryName(language.id, code) ?? DEFAULT_STEMS[language.id] ?? 'main'}.${language.ext}`
}
