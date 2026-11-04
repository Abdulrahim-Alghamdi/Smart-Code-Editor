// فحوص نصائح بيئة التشغيل. الرسائل منسوخة من تشغيل فعلي على Pyodide و Wandbox والمتصفح. تشغيلها: npm test
import assert from 'node:assert'
import { workspaceCopy } from './copy.ts'
import { environmentTip } from './environmentTips.ts'

const tools = (language: string, text: string, level = 'error') => environmentTip(language, [{ level, text }])?.tools[0]

const covered: [string, string, string][] = [
  ['python', "ModuleNotFoundError: No module named 'turtle'\nThe module 'turtle' is removed from the Python standard library", 'VS Code'],
  ['python', "ModuleNotFoundError: No module named 'tkinter'", 'VS Code'],
  ['python', "ModuleNotFoundError: No module named 'PyQt5'", 'VS Code'],
  ['python', 'ReferenceError: screen is not defined', 'VS Code'],
  ['python', 'pyodide.ffi.JsException: ReferenceError: window is not defined', 'VS Code'],
  ['python', "ImportError: cannot import name 'window' from 'js' (unknown location)", 'VS Code'],
  ['python', 'cv2.error: OpenCV(4.11.0) /opencv/modules/highgui/src/window.cpp:1301: error', 'VS Code'],
  ['python', "ModuleNotFoundError: No module named 'RPi'", 'VS Code'],
  ['python', "ModuleNotFoundError: No module named 'flask'", 'VS Code'],
  ['python', 'OSError: [Errno 138] emscripten does not support processes.', 'VS Code'],
  ['cpp', 'main.cpp:1:10: fatal error: SFML/Graphics.hpp: No such file or directory', 'VS Code'],
  ['cpp', 'main.cpp:1:10: fatal error: GL/glut.h: No such file or directory', 'VS Code'],
  ['cpp', 'main.cpp:1:10: fatal error: GLFW/glfw3.h: No such file or directory', 'VS Code'],
  ['cpp', 'main.cpp:1:10: fatal error: SDL2/SDL.h: No such file or directory', 'VS Code'],
  ['cpp', 'main.cpp:1:10: fatal error: windows.h: No such file or directory', 'VS Code'],
  ['cpp', 'main.cpp:1:10: fatal error: graphics.h: No such file or directory', 'VS Code'],
  ['cpp', 'main.cpp:1:10: fatal error: conio.h: No such file or directory', 'VS Code'],
  ['cpp', 'main.cpp:1:10: fatal error: QApplication: No such file or directory', 'VS Code'],
  ['c', 'main.c:1:10: fatal error: SDL.h: No such file or directory', 'VS Code'],
  ['java', 'Exception in thread "main" java.awt.HeadlessException: \nNo X11 DISPLAY variable was set,', 'IntelliJ IDEA'],
  ['java', 'Exception in thread "main" java.awt.AWTException: headless environment', 'IntelliJ IDEA'],
  ['java', 'Main.java:1: error: package javafx.application does not exist', 'IntelliJ IDEA'],
  ['csharp', "prog.cs(2,22): error CS0234: The type or namespace name `Forms' does not exist in the namespace `System.Windows'. Are you missing `System.Windows.Forms' assembly reference?", 'Visual Studio'],
  ['csharp', "prog.cs(1,14): error CS0234: The type or namespace name `Drawing' does not exist in the namespace `System'. Are you missing `System.Drawing' assembly reference?", 'Visual Studio'],
  ['csharp', "prog.cs(2,36): error CS0246: The type or namespace name `Application' could not be found. Are you missing an assembly reference?", 'Visual Studio'],
  ['javascript', 'Uncaught ReferenceError: require is not defined', 'VS Code'],
  ['javascript', 'Uncaught ReferenceError: process is not defined', 'VS Code'],
  ['javascript', 'Uncaught ReferenceError: __dirname is not defined', 'VS Code'],
  ['javascript', 'Uncaught SyntaxError: Cannot use import statement outside a module', 'VS Code'],
  ['html', 'Uncaught ReferenceError: require is not defined', 'VS Code'],
  ['typescript', "main.ts(1,21): error TS2307: Cannot find module 'express' or its corresponding type declarations.", 'VS Code'],
  ['typescript', "main.ts(1,21): error TS2307: Cannot find module 'fs' or its corresponding type declarations.", 'VS Code'],
  ['typescript', "main.ts(1,12): error TS2580: Cannot find name 'require'. Do you need to install type definitions for node?", 'VS Code'],
  ['go', 'main.go:2:8: cannot find package "fyne.io/fyne/v2/app" in any of:', 'GoLand'],
  ['go', 'main.go:2:8: cannot find package "github.com/gin-gonic/gin" in any of:', 'GoLand'],
  ['rust', 'error[E0432]: unresolved import `ggez`', 'RustRover'],
  ['rust', "error[E0463]: can't find crate for `sdl2`", 'RustRover'],
  ['rust', 'error[E0433]: failed to resolve: use of undeclared crate or module `winit`', 'RustRover'],
]
for (const [language, text, expected] of covered) {
  assert.equal(tools(language, text), expected, text)
  // لكل نصيحة سبب باللغتين، والعربي عربي فعلاً
  const reason = environmentTip(language, [{ level: 'error', text }])!.reason
  assert.ok(workspaceCopy.en.environment.reasons[reason], reason)
  assert.match(workspaceCopy.ar.environment.reasons[reason], /[\u0600-\u06FF]/, reason)
}

// أخطاء عادية يصلحها المستخدم بنفسه: نصيحة بتغيير المحرر هنا تضلله
const ordinary: [string, string][] = [
  ['python', "ModuleNotFoundError: No module named 'nosuchmodulexyz'"],
  ['python', "NameError: name 'window' is not defined"],
  ['python', "NameError: name 'screen' is not defined"],
  ['python', "SyntaxError: invalid syntax"],
  ['cpp', 'main.cpp:1:10: fatal error: myheader.h: No such file or directory'],
  ['cpp', "main.cpp:2:5: error: 'cout' was not declared in this scope"],
  ['java', 'Main.java:1: error: package com.example does not exist'],
  ['java', 'Exception in thread "main" java.lang.NullPointerException'],
  ['csharp', "prog.cs(2,36): error CS0246: The type or namespace name `Foo' could not be found."],
  ['javascript', 'Uncaught ReferenceError: notDefinedThing is not defined'],
  ['javascript', 'Uncaught TypeError: x is not a function'],
  ['typescript', "main.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'."],
  ['typescript', "main.ts(1,21): error TS2307: Cannot find module './helper' or its corresponding type declarations."],
  ['typescript', "main.ts(1,1): error TS2304: Cannot find name 'foo'."],
  ['go', 'main.go:2:8: package fmtt is not in std'],
  ['go', 'main.go:2:8: cannot find package "fmtt" in any of:'],
  ['rust', 'error[E0432]: unresolved import `foo`'],
  ['sql', 'near "SELEC": syntax error'],
]
for (const [language, text] of ordinary) assert.equal(tools(language, text), undefined, text)

// برنامج يطبع نص الخطأ بنفسه، أو لغة أخرى بالرسالة نفسها
assert.equal(tools('python', "No module named 'tkinter'", 'log'), undefined)
assert.equal(tools('python', "No module named 'tkinter'", 'warn'), undefined)
assert.equal(tools('java', 'require is not defined'), undefined)
assert.equal(environmentTip('python', []), undefined)
// الخطأ وسط مخرجات كثيرة
assert.equal(environmentTip('python', [{ level: 'log', text: 'hello' }, { level: 'error', text: "No module named 'turtle'" }])?.tools.length, 3)

console.log(`environment tip checks passed (${covered.length} matched, ${ordinary.length} left alone)`)
