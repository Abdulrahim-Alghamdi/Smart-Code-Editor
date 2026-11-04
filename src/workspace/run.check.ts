// فحوص كشف المدخلات وفصلها. تشغيلها: npm test
import assert from 'node:assert'
import { inputMode, LIVE_INPUT, MISSING_INPUT, prepareInput, readsInput } from './run.ts'

// طريقة الإدخال لكل مكان تشغيل
assert.equal(inputMode('python', ''), LIVE_INPUT ? 'live' : 'collect')
assert.equal(inputMode('javascript', ''), 'replay')
assert.equal(inputMode('html', ''), 'replay')
assert.equal(inputMode('java', 'new Scanner(System.in)'), 'replay')
assert.equal(inputMode('java', 'new BufferedReader(r)'), 'collect', 'readLine gives null, with no reliable signal')
assert.equal(inputMode('cpp', 'std::cin >> x;'), 'collect')
assert.equal(inputMode('go', 'fmt.Scan(&x)'), 'collect')
assert.equal(inputMode('sql', 'SELECT 1'), null)
assert.equal(prepareInput('javascript', "prompt('a'); prompt('b')", '1 2'), '1\n2')

// الكشف
assert.ok(readsInput('java', 'Scanner s = new Scanner(System.in);'))
assert.ok(readsInput('python', "name = input('Name: ')"))
assert.ok(readsInput('python', 'import sys\nfor l in sys.stdin: print(l)'))
assert.ok(readsInput('cpp', 'int x; std::cin >> x;'))
assert.ok(readsInput('c', 'scanf("%d", &x);'))
assert.ok(readsInput('go', 'fmt.Scan(&x)'))
assert.ok(readsInput('rust', 'io::stdin().read_line(&mut s)'))
assert.ok(readsInput('ruby', 'name = gets'))
assert.ok(readsInput('php', '$a = fgets(STDIN);'))
assert.ok(readsInput('csharp', 'var a = Console.ReadLine();'))
assert.ok(readsInput('shell', 'read name\necho $name'))
assert.ok(readsInput('typescript', "process.stdin.on('data', f)"))
assert.ok(!readsInput('python', "print('hello')\nuser_input = 5"))
assert.ok(!readsInput('java', 'System.out.println(1);'))
assert.ok(!readsInput('shell', 'echo "ready to go"'))
assert.ok(!readsInput('javascript', 'input()'))

// الفصل: سطر واحد لبرنامج يقرأ أسطراً عدة
const three = 'a = input()\nb = input()\nc = input()'
assert.equal(prepareInput('python', three, '10 + 5'), '10\n+\n5')
assert.equal(prepareInput('python', three, '  10   +\t5 \n'), '10\n+\n5')
assert.equal(prepareInput('java', 's.nextLine(); s.nextLine();', '10 5'), '10\n5')

// يبقى كما كُتب
assert.equal(prepareInput('python', three, '10\n+\n5'), '10\n+\n5', 'already on lines')
assert.equal(prepareInput('python', 'name = input()', 'Ada Lovelace'), 'Ada Lovelace', 'one read keeps the whole line')
assert.equal(prepareInput('python', 'a, b = input().split()\nc = input()', '3 4'), '3 4', 'the program splits it itself')
assert.equal(prepareInput('java', 'new Scanner(System.in).nextDouble();', '10 + 5'), '10 + 5', 'token reads need no split')
assert.equal(prepareInput('python', three, ''), '')

// نفاد المدخلات
assert.ok(MISSING_INPUT.test('Exception in thread "main" java.util.NoSuchElementException\n\tat java.base/java.util.Scanner.throwFor(Scanner.java:962)'))
assert.ok(MISSING_INPUT.test('EOFError: EOF when reading a line'))
assert.ok(!MISSING_INPUT.test('java.util.NoSuchElementException: No value present\n\tat java.base/java.util.Optional.get(Optional.java:143)'))
assert.ok(!MISSING_INPUT.test('ValueError: invalid literal'))

console.log('run checks passed')
