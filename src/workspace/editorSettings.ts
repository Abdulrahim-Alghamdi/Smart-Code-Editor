// إعدادات المحرر التي يغيّرها المستخدم، بقيمها الافتراضية الحالية للمحرر
export interface EditorSettings {
  fontSize: number
  tabSize: 2 | 4
  wordWrap: boolean
  lineNumbers: boolean
  minimap: boolean
}

export const FONT_SIZE = { min: 10, max: 24 }

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = { fontSize: 14, tabSize: 2, wordWrap: false, lineNumbers: true, minimap: false }

// يقبل أي قيمة محفوظة أو مستوردة: الحقول الصحيحة تُؤخذ والناقصة أو التالفة ترجع لقيمتها الافتراضية
export const parseEditorSettings = (raw: unknown): EditorSettings | null => {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const d = DEFAULT_EDITOR_SETTINGS
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
  return {
    fontSize:
      typeof r.fontSize === 'number' && Number.isFinite(r.fontSize)
        ? Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, Math.round(r.fontSize)))
        : d.fontSize,
    tabSize: r.tabSize === 4 ? 4 : r.tabSize === 2 ? 2 : d.tabSize,
    wordWrap: bool(r.wordWrap, d.wordWrap),
    lineNumbers: bool(r.lineNumbers, d.lineNumbers),
    minimap: bool(r.minimap, d.minimap),
  }
}
