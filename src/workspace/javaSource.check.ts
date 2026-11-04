// فحوص قراءة ملف جافا. تشغيلها: npm test
import assert from 'node:assert'
import { extraPublics, forWandbox, javaFileName, javaTypes, maskJava } from '../../supabase/functions/_shared/javaSource.ts'

const demote = (code: string) => extraPublics(code).reduceRight((text, [start, end]) => text.slice(0, start) + text.slice(end), code)
const main = 'public static void main(String[] args) {}'

// اسم الملف
assert.equal(javaFileName('public class Calculator {}'), 'Calculator.java')
assert.equal(javaFileName(`class Helper {}\npublic class App { ${main} }`), 'App.java')
assert.equal(javaFileName(`class First {}\nclass Runner { ${main} }`), 'Runner.java', 'no public: the class with main')
assert.equal(javaFileName(`public class Model {}\nclass Runner { ${main} }`), 'Model.java', 'the public type wins, as javac requires')
assert.equal(javaFileName('class A {}'), undefined)
assert.equal(javaFileName('int x = 1;'), undefined)
assert.equal(javaFileName('public interface Shape {}'), 'Shape.java')
assert.equal(javaFileName('public enum Color { RED }'), 'Color.java')
assert.equal(javaFileName('public record Point(int x, int y) {}'), 'Point.java')
assert.equal(javaFileName('public final class Sealed {}'), 'Sealed.java')
assert.equal(javaFileName('public abstract class Base<T extends Comparable<T>> {}'), 'Base.java')
assert.equal(javaFileName('@Deprecated\npublic class Old {}'), 'Old.java')
assert.equal(javaFileName('public class حساب {}'), 'حساب.java', 'Java allows Unicode names')

// ما ليس تصريحاً حقيقياً لا يُحسب
assert.equal(javaFileName(`// public class Comment {}\n/* public class Block {} */\npublic class Real {}`), 'Real.java')
assert.equal(javaFileName(`class Real { String s = "public class Str {}"; }`), undefined)
assert.equal(javaFileName(`public class Real { String s = """\n  public class Text {}\n  """; }`), 'Real.java')
assert.equal(javaFileName(`class Real { char c = '"'; }\npublic class Next {}`), 'Next.java', 'a quote in a char')
assert.equal(javaFileName(`public class Outer { public class Inner {} public static class Nested {} }`), 'Outer.java')
assert.equal(javaFileName(`class A { void f() { Object o = String.class; } }\npublic class B {}`), 'B.java')
assert.deepEqual(javaTypes(`public class Outer { class Inner { ${main} } }`).map((t) => [t.name, t.hasMain]), [['Outer', false]], 'main in a nested class')
assert.equal(maskJava('a "b" c').length, 7)

// أكثر من نوع public
assert.equal(demote('public class A {}\npublic class B {}\nclass C {}'), 'public class A {}\nclass B {}\nclass C {}')
assert.equal(demote(`public class A {}\npublic class B { ${main} }`), `class A {}\npublic class B { ${main} }`, 'the class with main stays public')
assert.equal(demote('public   final class A {}\npublic  abstract class B {}'), 'public   final class A {}\nabstract class B {}')
assert.equal(demote('public interface I {}\npublic enum E { X }\npublic record R() {}'), 'public interface I {}\nenum E { X }\nrecord R() {}')
assert.equal(demote('public class A { public class B {} }'), 'public class A { public class B {} }', 'nested classes keep public')
assert.equal(demote('public class A {}'), 'public class A {}')
assert.equal(demote('class A {}'), 'class A {}')
assert.equal(demote('public class A { String s = "public class B {}"; }\n// public class C {}'), 'public class A { String s = "public class B {}"; }\n// public class C {}')

// الإرسال إلى Wandbox
assert.equal(forWandbox('public class A {}'), '       class A {}', 'same columns')
const nested = 'public class A { public class B {} }'
assert.equal(forWandbox(nested), '       class A { public class B {} }')
const block = 'public class A { String s = """\n  public class Fake {}\n  """; }'
assert.ok(forWandbox(block).includes('  public class Fake {}'), 'strings are not touched')
assert.equal(forWandbox('package com.example.app;\nclass A {}'), '                        \nclass A {}')
assert.equal(forWandbox('// package x;\nclass A {}'), '// package x;\nclass A {}')
assert.equal(forWandbox('class A { String p = "package x;"; }'), 'class A { String p = "package x;"; }')
for (const code of [block, nested, 'package a.b;\npublic class C {}']) {
  assert.equal(forWandbox(code).length, code.length)
  assert.equal(forWandbox(code).split('\n').length, code.split('\n').length, 'line numbers stay right')
}

console.log('java source checks passed')
