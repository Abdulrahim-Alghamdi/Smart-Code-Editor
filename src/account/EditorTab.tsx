import { outlineButton } from '@/lib/ui'
import { DEFAULT_EDITOR_SETTINGS, FONT_SIZE, type EditorSettings } from '@/workspace/editorSettings'
import type { AccountCopy } from './copy'

interface Props {
  settings: EditorSettings
  onChange: (next: EditorSettings) => Promise<boolean>
  copy: AccountCopy
  notify: (text: string, kind: 'success' | 'error') => void
}

// كل تغيير يُطبَّق فوراً على المحرر؛ لا رسالة لكل تحريك للمنزلق، فقط عند فشل الحفظ أو الاستعادة
export function EditorTab({ settings, onChange, copy, notify }: Props) {
  const change = async (patch: Partial<EditorSettings>) => {
    if (!(await onChange({ ...settings, ...patch }))) notify(copy.toasts.editorSaveFailed, 'error')
  }

  const reset = async () => {
    if (await onChange(DEFAULT_EDITOR_SETTINGS)) notify(copy.toasts.editorReset, 'success')
    else notify(copy.toasts.editorSaveFailed, 'error')
  }

  const toggle = (key: 'wordWrap' | 'lineNumbers' | 'minimap', label: string) => (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
      <span className="text-sm">{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={settings[key]}
        onChange={(e) => change({ [key]: e.target.checked })}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative h-6 w-11 shrink-0 rounded-full bg-line-strong transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent after:absolute after:start-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-ink after:transition-transform peer-checked:after:translate-x-5"
      />
    </label>
  )

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="editor-font" className="text-sm font-medium">
            {copy.fontSize}
          </label>
          <output htmlFor="editor-font" className="text-sm tabular-nums text-ink-2">
            {settings.fontSize}px
          </output>
        </div>
        <input
          id="editor-font"
          type="range"
          min={FONT_SIZE.min}
          max={FONT_SIZE.max}
          step={1}
          value={settings.fontSize}
          onChange={(e) => change({ fontSize: Number(e.target.value) })}
          className="mt-2 w-full accent-accent"
        />
      </div>

      <fieldset>
        <legend className="text-sm font-medium">{copy.tabSize}</legend>
        <div className="mt-2 flex gap-2">
          {([2, 4] as const).map((n) => (
            <label key={n} className="cursor-pointer">
              <input type="radio" name="tab-size" checked={settings.tabSize === n} onChange={() => change({ tabSize: n })} className="peer sr-only" />
              <span className="grid h-9 place-items-center rounded-lg border border-line-strong px-4 text-sm text-ink-2 transition-colors peer-checked:border-accent peer-checked:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-accent">
                {copy.spaces(n)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="divide-y divide-line">
        {toggle('wordWrap', copy.wordWrap)}
        {toggle('lineNumbers', copy.lineNumbers)}
        {toggle('minimap', copy.minimap)}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={reset} className={outlineButton}>
          {copy.resetEditor}
        </button>
        <p className="text-xs text-ink-2">{copy.editorNote}</p>
      </div>
    </div>
  )
}
