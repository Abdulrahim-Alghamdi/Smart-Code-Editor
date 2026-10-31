import { input } from '@/lib/ui'
import type { AccountCopy } from './copy'

type Lang = 'ar' | 'en'

export function PreferencesTab({ copy, lang, onLang }: { copy: AccountCopy; lang: Lang; onLang: (lang: Lang) => void }) {
  return (
    <div className="max-w-sm">
      <label htmlFor="account-language" className="text-sm font-medium">
        {copy.language}
      </label>
      <select
        id="account-language"
        value={lang}
        onChange={(e) => onLang(e.target.value as Lang)}
        aria-describedby="account-language-hint"
        className={input}
      >
        {(['ar', 'en'] as const).map((l) => (
          <option key={l} value={l}>
            {copy.languages[l]}
          </option>
        ))}
      </select>
      <p id="account-language-hint" className="mt-1 text-xs text-ink-2">
        {copy.languageHint}
      </p>
    </div>
  )
}
