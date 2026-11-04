// Reads a Java file just far enough to find its top-level types. Shared by the editor (naming the file) and the run
// function (compiling it), so both agree. Regexes alone can't do this: they'd match `public class` inside a string,
// a comment or a nested class.

export interface JavaType {
  name: string
  // offset of the `public` keyword, or -1 when the type isn't public
  publicAt: number
  hasMain: boolean
  at: number
}

const TYPE = /\b(?:class|interface|enum|record)\s+([\p{L}_$][\p{L}\p{N}_$]*)/gu
const MAIN = /\bstatic\b[^;{}()]*\bvoid\s+main\s*\(\s*(?:final\s+)?String\s*(?:\[\s*\]|\.\.\.)/gu
const PACKAGE = /\bpackage\s+[\p{L}\p{N}_$.\s]+;/u

// The same text with comments, strings and text blocks blanked out. Offsets and line breaks stay as they were
export function maskJava(code: string) {
  let out = ''
  let i = 0
  const blank = (end: number) => {
    out += code.slice(i, end).replace(/[^\n]/g, ' ')
    i = end
  }
  while (i < code.length) {
    if (code.startsWith('//', i)) {
      const end = code.indexOf('\n', i)
      blank(end < 0 ? code.length : end)
    } else if (code.startsWith('/*', i)) {
      const end = code.indexOf('*/', i + 2)
      blank(end < 0 ? code.length : end + 2)
    } else if (code.startsWith('"""', i)) {
      let end = i + 3
      while (end < code.length && !code.startsWith('"""', end)) end += code[end] === '\\' ? 2 : 1
      blank(Math.min(end + 3, code.length))
    } else if (code[i] === '"' || code[i] === "'") {
      let end = i + 1
      while (end < code.length && code[end] !== code[i] && code[end] !== '\n') end += code[end] === '\\' ? 2 : 1
      blank(Math.min(end + 1, code.length))
    } else {
      out += code[i++]
    }
  }
  return out
}

// Brace depth at every offset of masked text
const depths = (masked: string) => {
  const depth = new Uint16Array(masked.length + 1)
  let level = 0
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === '}') level = Math.max(level - 1, 0)
    depth[i] = level
    if (masked[i] === '{') level++
  }
  return depth
}

export function javaTypes(code: string): JavaType[] {
  const masked = maskJava(code)
  const depth = depths(masked)
  const types: JavaType[] = []
  for (const match of masked.matchAll(TYPE)) {
    if (depth[match.index] !== 0) continue
    // the modifiers sit between the previous declaration and this one
    const start = Math.max(masked.lastIndexOf(';', match.index), masked.lastIndexOf('}', match.index)) + 1
    const found = masked.slice(start, match.index).search(/\bpublic\b/)
    types.push({ name: match[1], publicAt: found < 0 ? -1 : start + found, hasMain: false, at: match.index })
  }
  for (const match of masked.matchAll(MAIN)) {
    if (depth[match.index] !== 1) continue
    const owner = types.findLast((type) => type.at < match.index)
    if (owner) owner.hasMain = true
  }
  return types
}

// The type the file is named after: the public one (the one with main if several are public), else the one with main
const entryType = (types: JavaType[]) =>
  types.find((type) => type.publicAt >= 0 && type.hasMain) ?? types.find((type) => type.publicAt >= 0) ?? types.find((type) => type.hasMain)

export const javaFileName = (code: string) => {
  const entry = entryType(javaTypes(code))
  return entry && `${entry.name}.java`
}

// Where the `public` keywords of every public type but the entry sit, as [start, end] with their trailing spaces.
// A Java file may hold one public top-level type, so these are the ones javac would refuse
export function extraPublics(code: string): [number, number][] {
  const types = javaTypes(code)
  const entry = entryType(types)
  return types
    .filter((type) => type.publicAt >= 0 && type !== entry)
    .map((type) => [type.publicAt, type.publicAt + 'public'.length + (/^[ \t]*/.exec(code.slice(type.publicAt + 'public'.length))?.[0].length ?? 0)])
}

// Wandbox saves the code as prog.java and runs it from one folder, so a public type won't compile and a package
// won't load. Both are blanked with spaces, which keeps the line and column of every compiler message right
export function forWandbox(code: string) {
  const masked = maskJava(code)
  const depth = depths(masked)
  const blanks: [number, number][] = javaTypes(code)
    .filter((type) => type.publicAt >= 0)
    .map((type) => [type.publicAt, type.publicAt + 'public'.length])
  const pkg = PACKAGE.exec(masked)
  if (pkg && depth[pkg.index] === 0) blanks.push([pkg.index, pkg.index + pkg[0].length])
  return blanks.reduce((text, [start, end]) => text.slice(0, start) + text.slice(start, end).replace(/[^\n]/g, ' ') + text.slice(end), code)
}
