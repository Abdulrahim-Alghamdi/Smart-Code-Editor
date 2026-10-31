// لغات البرمجة المدعومة: id هو معرّف اللغة في Monaco و ext امتداد ملفاتها، ولكل لغة ثلاثة أمثلة
// بالترتيب: خطأ نحوي، خطأ منطقي، كود نظيف
export const LANGUAGES = [
  {
    id: 'javascript',
    ext: 'js',
    label: 'JavaScript',
    glyph: 'JS',
    examples: [
      `function greet(name) {
  console.log("Hello, " + name
}

greet("World");
`,
      `function sumArray(arr) {
  let total = 0;
  for (let i = 0; i <= arr.length; i++) {
    total += arr[i];
  }
  return total;
}

console.log(sumArray([1, 2, 3]));
`,
      `const unique = (items) => [...new Set(items)];

console.log(unique([1, 2, 2, 3]));
`,
    ],
  },
  {
    id: 'html',
    ext: 'html',
    label: 'HTML',
    glyph: '</>',
    examples: [
      `<!DOCTYPE html>
<html>
  <body>
    <h1>Welcome</h2>
    <p>Hello, World
  </body>
</html>
`,
      `<form>
  <label for="email">Email</label>
  <input id="mail" type="email">
  <img src="logo.png">
  <button>Send</button>
</form>
`,
      `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Home</title>
  </head>
  <body>
    <h1>Welcome</h1>
    <img src="logo.png" alt="Company logo">
  </body>
</html>
`,
    ],
  },
  {
    id: 'css',
    ext: 'css',
    label: 'CSS',
    glyph: 'CSS',
    examples: [
      `.card {
  color: #333
  padding 16px;
}

.title {
  font-size: 24px;
`,
      `.button {
  background-color: #ff4d14;
  colour: white;
  padding: 8px 16;
  z-index: 10px;
}
`,
      `:root {
  --accent: #ff4d14;
}

.button {
  background: var(--accent);
  color: white;
  padding: 8px 16px;
  border-radius: 8px;
}
`,
    ],
  },
  {
    id: 'python',
    ext: 'py',
    label: 'Python',
    glyph: 'Py',
    examples: [
      `def greet(name)
    print("Hello, " + name)

greet("World")
`,
      `def average(nums):
    total = 0
    for i in range(len(nums) + 1):
        total += nums[i]
    return total / len(nums)

print(average([4, 8, 15]))
`,
      `def is_palindrome(text: str) -> bool:
    cleaned = "".join(c.lower() for c in text if c.isalnum())
    return cleaned == cleaned[::-1]

print(is_palindrome("A man, a plan, a canal: Panama"))
`,
    ],
  },
  {
    id: 'sql',
    ext: 'sql',
    label: 'SQL',
    glyph: 'SQL',
    examples: [
      `SELECT name, email
FROM users
WHERE age > 18
ORDER name;
`,
      `SELECT *
FROM orders
WHERE status = NULL;
`,
      `SELECT department, COUNT(*) AS employees
FROM staff
GROUP BY department
ORDER BY employees DESC;
`,
    ],
  },
  {
    id: 'typescript',
    ext: 'ts',
    label: 'TypeScript',
    glyph: 'TS',
    examples: [
      `function add(a: number, b: number): number {
  return a + b;


console.log(add(2, 3));
`,
      `function isAdult(age: number): boolean {
  return age > 18;
}

console.log(isAdult(18));
`,
      `export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}
`,
    ],
  },
  {
    id: 'json',
    ext: 'json',
    label: 'JSON',
    glyph: '{ }',
    examples: [
      `{
  "name": "smart-code-editor",
  "version": "1.0.0",
  'private': true,
  "scripts": {
    "dev": "vite",
  }
}
`,
      `{
  "name": "smart-code-editor",
  "version": 1.0,
  "port": "3000",
  "debug": "false",
  "name": "my-app"
}
`,
      `{
  "name": "smart-code-editor",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}
`,
    ],
  },
  {
    id: 'shell',
    ext: 'sh',
    label: 'Bash',
    glyph: 'sh',
    examples: [
      `#!/bin/bash
if [ "$1" = "start" ]
  echo "Starting..."
fi
`,
      `#!/bin/bash
count=0
for f in *.txt; do
  count=$count+1
done
echo "Files: $count"
`,
      `#!/bin/bash
set -euo pipefail

for file in *.log; do
  echo "Found: $file"
done
`,
    ],
  },
  {
    id: 'java',
    ext: 'java',
    label: 'Java',
    glyph: 'Jv',
    examples: [
      `public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World")
    }
}
`,
      `public class Main {
    static int max(int[] nums) {
        int best = 0;
        for (int n : nums) {
            if (n > best) best = n;
        }
        return best;
    }

    public static void main(String[] args) {
        System.out.println(max(new int[]{-5, -2, -9}));
    }
}
`,
      `import java.util.List;

public class Main {
    public static void main(String[] args) {
        List<String> names = List.of("Ali", "Sara", "Omar");
        names.forEach(System.out::println);
    }
}
`,
    ],
  },
  {
    id: 'csharp',
    ext: 'cs',
    label: 'C#',
    glyph: 'C#',
    examples: [
      `using System;

class Program {
    static void Main() {
        Console.WriteLine("Hello, World")
    }
}
`,
      `using System;

class Program {
    static double Average(int[] nums) {
        int sum = 0;
        foreach (var n in nums) sum += n;
        return sum / nums.Length;
    }

    static void Main() {
        Console.WriteLine(Average(new[] { 1, 2 }));
    }
}
`,
      `using System;
using System.Linq;

class Program {
    static void Main() {
        var evens = Enumerable.Range(1, 10).Where(n => n % 2 == 0);
        Console.WriteLine(string.Join(", ", evens));
    }
}
`,
    ],
  },
  {
    id: 'cpp',
    ext: 'cpp',
    label: 'C++',
    glyph: 'C++',
    examples: [
      `#include <iostream>

int main() {
    std::cout << "Hello, World" << std::endl
    return 0;
}
`,
      `#include <iostream>
#include <vector>

int main() {
    std::vector<int> v = {3, 1, 2};
    for (size_t i = v.size() - 1; i >= 0; i--) {
        std::cout << v[i] << " ";
    }
}
`,
      `#include <algorithm>
#include <iostream>
#include <vector>

int main() {
    std::vector<int> v = {3, 1, 2};
    std::sort(v.begin(), v.end());
    for (int n : v) std::cout << n << ' ';
}
`,
    ],
  },
  {
    id: 'c',
    ext: 'c',
    label: 'C',
    glyph: 'C',
    examples: [
      `#include <stdio.h>

int main() {
    printf("Hello, World\\n")
    return 0;
}
`,
      `#include <stdio.h>

int main() {
    int nums[3] = {1, 2, 3};
    int sum = 0;
    for (int i = 0; i <= 3; i++) {
        sum += nums[i];
    }
    printf("%d\\n", sum);
    return 0;
}
`,
      `#include <stdio.h>

int factorial(int n) {
    return n <= 1 ? 1 : n * factorial(n - 1);
}

int main(void) {
    printf("%d\\n", factorial(5));
    return 0;
}
`,
    ],
  },
  {
    id: 'php',
    ext: 'php',
    label: 'PHP',
    glyph: 'php',
    examples: [
      `<?php
function greet($name) {
    echo "Hello, " . $name
}

greet("World");
`,
      `<?php
$prices = [10, 20, 30];
$total = 0;
foreach ($prices as $price) {
    $total =+ $price;
}
echo $total;
`,
      `<?php
$names = ["Ali", "Sara", "Omar"];
sort($names);
echo implode(", ", $names);
`,
    ],
  },
  {
    id: 'yaml',
    ext: 'yml',
    label: 'YAML',
    glyph: 'yml',
    examples: [
      `name: CI
on: push
jobs:
  build:
    runs-on: ubuntu-latest
     steps:
      - run: npm test
`,
      `services:
  web:
    image: node:20
    ports:
      - 3000:3000
    depends_on:
      - database
  db:
    image: postgres:16
`,
      `name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
`,
    ],
  },
  {
    id: 'markdown',
    ext: 'md',
    label: 'Markdown',
    glyph: 'MD',
    examples: [
      `# Smart Code Editor

An editor that finds bugs with AI.

## Install

\`\`\`bash
npm install
npm run dev

## Usage

[Open the app(http://localhost:5173)
`,
      `# Smart Code Editor

See [Installation](#install) to get started.

#### Installation

1. Clone the repo
1. Run npm install
3. Run npm run dev
`,
      `# Smart Code Editor

Paste code and get the bug and the fix.

## Installation

\`\`\`bash
npm install
npm run dev
\`\`\`

## License

MIT
`,
    ],
  },
  {
    id: 'go',
    ext: 'go',
    label: 'Go',
    glyph: 'Go',
    examples: [
      `package main

import "fmt"

func main() {
    fmt.Println("Hello, World"
}
`,
      `package main

import "fmt"

func divide(a, b int) int {
    return a / b
}

func main() {
    fmt.Println(divide(10, 0))
}
`,
      `package main

import (
    "fmt"
    "strings"
)

func main() {
    words := strings.Fields("go is fun")
    fmt.Println(len(words), "words")
}
`,
    ],
  },
  {
    id: 'rust',
    ext: 'rs',
    label: 'Rust',
    glyph: 'Rs',
    examples: [
      `fn main() {
    let name = "World"
    println!("Hello, {}", name);
}
`,
      `fn main() {
    let v = vec![1, 2, 3];
    for i in 0..=v.len() {
        println!("{}", v[i]);
    }
}
`,
      `fn main() {
    let squares: Vec<i32> = (1..=5).map(|n| n * n).collect();
    println!("{:?}", squares);
}
`,
    ],
  },
  {
    id: 'kotlin',
    ext: 'kt',
    label: 'Kotlin',
    glyph: 'Kt',
    examples: [
      `fun main() {
    val name = "World"
    println("Hello, " + name
}
`,
      `fun main() {
    val items = listOf("a", "b", "c")
    for (i in 0..items.size) {
        println(items[i])
    }
}
`,
      `fun main() {
    val evens = (1..10).filter { it % 2 == 0 }
    println(evens)
}
`,
    ],
  },
  {
    id: 'dart',
    ext: 'dart',
    label: 'Dart',
    glyph: 'Dt',
    examples: [
      `void main() {
  var name = 'World'
  print('Hello, ' + name);
}
`,
      `void main() {
  var list = [1, 2, 3];
  for (var i = 1; i <= list.length; i++) {
    print(list[i]);
  }
}
`,
      `void main() {
  final doubled = [1, 2, 3].map((n) => n * 2).toList();
  print(doubled);
}
`,
    ],
  },
  {
    id: 'ruby',
    ext: 'rb',
    label: 'Ruby',
    glyph: 'Rb',
    examples: [
      `def greet(name)
  puts "Hello, " + name

greet("World")
`,
      `def average(nums)
  nums.sum / nums.size
end

puts average([1, 2])
`,
      `words = %w[ruby is fun]
puts words.map(&:capitalize).join(" ")
`,
    ],
  },
  {
    id: 'swift',
    ext: 'swift',
    label: 'Swift',
    glyph: 'Sw',
    examples: [
      `let name = "World"
print("Hello, " + name
`,
      `let scores = [90, 85, 70]
var total = 0
for i in 0...scores.count {
    total += scores[i]
}
print(total)
`,
      `let names = ["Sara", "Ali", "Omar"]
print(names.sorted().joined(separator: ", "))
`,
    ],
  },
]
