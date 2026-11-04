// فحوص ضبط ترميز UTF-8 لبرامج C# على Mono. تشغيلها: npm test
import assert from 'node:assert'
import { forMono } from '../../supabase/functions/_shared/csharpSource.ts'

const set = (code: string) => /OutputEncoding = new global::System\.Text\.UTF8Encoding\(false\);/.test(code)
// الموضع الذي كُتب فيه الضبط: ما قبله يجب أن ينتهي بقوس جسم Main الفعلي
const before = (code: string) => code.slice(0, code.indexOf(' global::System.Console.OutputEncoding'))

const forms = [
  'class P {\n  static void Main() {\n  }\n}',
  'class P\n{\n    static void Main(string[] args)\n    {\n    }\n}',
  'class P {\n  public static int Main(string[] args) { return 0; }\n}',
  'class P {\n  static async System.Threading.Tasks.Task Main() {\n  }\n}',
  'class P {\n  static async Task<int> Main(string[] args) {\n  }\n}',
  'class P {\n  public static void Main(params string[] args) {\n  }\n}',
  'class P {\n  static void Main(String [] @params) {\n  }\n}',
  'class P {\n  static void Main(System.String[] a) {\n  }\n}',
  'namespace Bank {\n  internal class P {\n    private static void Main() {\n    }\n  }\n}',
]
for (const code of forms) {
  const out = forMono(code)
  assert.ok(set(out), code)
  assert.ok(before(out).endsWith('{'), code)
  // رقم كل سطر يبقى كما هو في رسائل المترجم
  assert.equal(out.split('\n').length, code.split('\n').length, code)
  assert.equal(out.replace(/ global::System\.Console\.OutputEncoding.*?UTF8Encoding\(false\); global::.*?UTF8Encoding\(false\);/, ''), code)
}

// لا يُكتب إلا في Main الحقيقية، ولا في تعليق أو نص أو دالة أخرى بالاسم نفسه
const real = 'static void Main() {\n'
const decoys = [
  `// static void Main() {\nclass P {\n  ${real}  }\n}`,
  `/* static void Main() { */\nclass P {\n  ${real}  }\n}`,
  `class P {\n  const string S = "static void Main() {";\n  ${real}  }\n}`,
  `class P {\n  static void Main(int x) { }\n  ${real}  }\n}`,
  `class P {\n  void Main() { }\n  ${real}  }\n}`,
  `class P {\n  static void MainLoop() { }\n  ${real}  }\n}`,
]
for (const code of decoys) assert.ok(before(forMono(code)).endsWith(`  ${real.trimEnd()}`), code)

// بلا Main يمكن الكتابة فيها: يُرسل الكود كما هو، فيبقى المترجم صاحب الرسالة
for (const code of ['', 'class P { }', 'class P {\n  static void Main() => System.Console.WriteLine("x");\n}', '// static void Main() {']) {
  assert.equal(forMono(code), code)
}

console.log('csharp source checks passed')
