// Mono takes its console encoding from LANG, which Wandbox leaves empty, so Console.WriteLine turns every non-ASCII
// character into ? and Console.ReadLine splits it into bytes. Wandbox can't set environment variables and Mono has no
// flag for this (runtime-option-raw only reaches the program as an argument), so the program has to set it itself.
import { maskJava } from './javaSource.ts'

const MAIN = /\bstatic\b[^;{}()=]*\bMain\s*\(\s*(?:(?:params\s+)?(?:System\.)?[Ss]tring\s*\[\s*\]\s+@?\w+\s*)?\)\s*\{/
// No BOM: Encoding.UTF8 could write one ahead of the program's first output
const UTF8_CONSOLE =
  ' global::System.Console.OutputEncoding = new global::System.Text.UTF8Encoding(false); global::System.Console.InputEncoding = new global::System.Text.UTF8Encoding(false);'

// shortcut: an expression-bodied Main (`static void Main() => ...;`) has no { to write into and keeps the old encoding, and
// a static initializer that prints runs before this. Moving the program behind a generated entry point would cover both
export function forMono(code: string) {
  const main = MAIN.exec(maskJava(code))
  if (!main) return code
  const body = main.index + main[0].length
  // On the same line, so compile errors keep their line numbers
  return code.slice(0, body) + UTF8_CONSOLE + code.slice(body)
}
