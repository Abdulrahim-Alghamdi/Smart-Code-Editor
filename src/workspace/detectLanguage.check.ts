// فحوص التعرف على اللغة. أمثلة المحرر كلها عينة اختبار، وقصيرها الغامض مسموح أن يبقى بلا حكم، أما الحكم الخاطئ فلا. تشغيلها: npm test
import assert from 'node:assert'
import { LANGUAGES } from '../lib/languages.ts'
import { detectLanguage } from './detectLanguage.ts'

let right = 0
let unsure = 0
const wrong: string[] = []
for (const language of LANGUAGES) {
  for (const example of language.examples) {
    const found = detectLanguage(example)
    if (found === language.id) right++
    else if (found === null) unsure++
    else wrong.push(`${language.id} -> ${found}: ${example.slice(0, 60).replace(/\n/g, ' ')}`)
  }
}
assert.deepEqual(wrong, [], 'examples detected as another language')
assert.ok(right / (right + unsure) >= 0.9, `only ${right} of ${right + unsure} examples recognised`)

// أزواج متشابهة يسهل الخلط بينها
const samples: [string, string][] = [
  ['java', 'public class Calculator {\n  public int add(int a, int b) { return a + b; }\n}'],
  ['java', 'class Node {\n  private String value;\n  Node next;\n}'],
  ['java', 'import java.util.*;\nclass A {}'],
  ['java', 'interface Shape { double area(); }\nclass Circle implements Shape {\n  private boolean ready;\n  public double area() { return 1; }\n}'],
  ['csharp', 'public class Person\n{\n    public string Name { get; set; }\n}'],
  ['csharp', 'using System;\nclass P { static void Main() { Console.WriteLine("x"); } }'],
  ['cpp', '#include <iostream>\nint main() { std::cout << 1; }'],
  ['cpp', 'class A {\npublic:\n  int x;\n};'],
  ['c', '#include <stdio.h>\nint main(void) { printf("x"); return 0; }'],
  ['python', 'def add(a, b):\n    return a + b'],
  ['python', 'print("hello")'],
  ['python', 'class Dog:\n    def bark(self):\n        pass'],
  ['ruby', 'def add(a, b)\n  a + b\nend\nputs add(1, 2)'],
  ['javascript', 'const add = (a, b) => a + b;\nconsole.log(add(1, 2));'],
  ['javascript', 'function greet(name) {\n  return "hi " + name;\n}'],
  ['typescript', 'const add = (a: number, b: number): number => a + b;'],
  ['typescript', 'interface User {\n  name: string;\n  age: number;\n}'],
  ['typescript', 'export type Id = string | number;'],
  ['go', 'package main\nimport "fmt"\nfunc main() { fmt.Println("x") }'],
  ['go', 'func add(a int, b int) int {\n\treturn a + b\n}\nx := 1'],
  ['rust', 'fn main() {\n    let mut x = 1;\n    println!("{}", x);\n}'],
  ['php', '<?php\necho "x";'],
  ['sql', 'SELECT id, name FROM users WHERE age > 18;'],
  ['sql', 'select 1;\nselect 2 from t;'],
  ['sql', "INSERT INTO t VALUES (1);"],
  ['html', '<div class="a"><p>Hello</p></div>'],
  ['html', '<!DOCTYPE html>\n<html><body></body></html>'],
  ['css', '.card {\n  margin: 0;\n  color: red;\n}'],
  ['css', '@media (max-width: 600px) {\n  body { color: red; }\n}'],
  ['json', '{"a": 1, "b": [1, 2]}'],
  ['shell', '#!/bin/bash\necho hi'],
  ['c', '#include <stdio.h>\nvoid main() {\n  printf("x");\n}'],
  ['cpp', '#include <iostream>\nvoid main() {\n  std::cout << 1;\n}'],
  ['kotlin', 'fun main() {\n    val x = 1\n    println(x)\n}'],
  ['swift', 'import Foundation\nlet x = 1\nprint(x)'],
]
for (const [expected, code] of samples) assert.equal(detectLanguage(code), expected, code)

// الشك لا يغيّر شيئاً
for (const code of ['', '   ', 'x', 'hello world', 'a = 1', '// just a comment', '42']) assert.equal(detectLanguage(code), null, code)
// كود لغة داخل نص لغة أخرى لا يخدع الكاشف
assert.equal(detectLanguage('public class Q {\n  private String sql = "SELECT id FROM users";\n}'), 'java')
assert.equal(detectLanguage('query = "SELECT * FROM t"\nfor row in rows:\n    print(row)'), 'python')

// البنية الخارجية تحكم لا النص الذي يطبعه البرنامج
const page = '<!DOCTYPE html><html><body><script>console.log(1)</script></body></html>'
const wrapped: [string, string][] = [
  ['cpp', '#include <iostream>\nint main() {\n  std::cout << "' + page + '";\n}'],
  ['cpp', '#include <iostream>\nint main() {\n  std::cout << R"html(\n' + page + '\n)html";\n}'],
  ['python', 'html = """\n' + page + '\n"""\nprint(html)'],
  ['python', 'q = """\nSELECT id\nFROM users\n"""\nfor row in rows:\n    print(row)'],
  ['java', 'public class Page {\n  public static void main(String[] a) {\n    System.out.println("' + page + '");\n  }\n}'],
  ['java', 'class Page {\n  String html = """\n' + page + '\n""";\n  public static void main(String[] a) {}\n}'],
  ['javascript', 'const page = \u0060\n' + page + '\n\u0060;\nconsole.log(page);'],
  ['go', 'package main\nimport "fmt"\nfunc main() {\n\tfmt.Println(\u0060' + page + '\u0060)\n}'],
  ['rust', 'fn main() {\n    println!("{}", r#"' + page + '"#);\n}'],
  ['php', '<?php\necho "<html><body></body></html>";'],
  ['php', '<?php $title = "x"; ?>\n<!DOCTYPE html>\n<html><body></body></html>'],
  ['php', '<html>\n<body><?php echo "hi"; ?></body>\n</html>'],
  ['html', '<!DOCTYPE html>\n<html>\n<body>\n<script>\nconst x = 1;\nfunction go() { console.log("x"); }\ndocument.title = "a";\n</script>\n</body>\n</html>'],
  ['html', '<div class="a">\n<script>\nconsole.log(1);\nfunction go() { return 1; }\n</script>\n<p>Don\'t stop</p>\n</div>'],
  ['html', '<!-- page -->\n<!DOCTYPE html>\n<html><head><style>\n.card { margin: 0; color: red; }\n</style></head><body></body></html>'],
  ['html', '<!-- page -->\n<script>\nconst x = 1;\nfunction go() { console.log("x"); }\ndocument.title = "a";\n</script>'],
  ['typescript', '<T>(x: T): T => x;\nconst y: number = 1;'],
  ['dart', "import 'dart:io';\nvoid main() {\n  print('x');\n}"],
  ['markdown', '# Title\n\n\u0060\u0060\u0060python\nprint("x")\n\u0060\u0060\u0060\n'],
]
for (const [expected, code] of wrapped) assert.equal(detectLanguage(code), expected, code)

console.log(`language checks passed (${right} examples recognised, ${unsure} left undecided)`)
