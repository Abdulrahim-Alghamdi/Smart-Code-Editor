import { useEffect, useRef, type KeyboardEvent } from 'react'
import { iconButton } from '@/lib/ui'
import type { AccountCopy } from './copy'
import type { EditorSettings } from '@/workspace/editorSettings'
import { DangerZoneTab } from './DangerZoneTab'
import { EditorTab } from './EditorTab'
import { PreferencesTab } from './PreferencesTab'
import { ProfileTab } from './ProfileTab'
import type { Profile } from './validation'

export type AccountTab = 'profile' | 'editor' | 'preferences' | 'danger'
const TABS: AccountTab[] = ['profile', 'editor', 'preferences', 'danger']

interface Props {
  // null تعني أن النافذة مغلقة
  tab: AccountTab | null
  onTab: (tab: AccountTab | null) => void
  account: Profile
  copy: AccountCopy
  lang: 'ar' | 'en'
  onLang: (lang: 'ar' | 'en') => void
  onSave: (next: Profile) => Promise<Profile | null>
  onDelete: () => void
  editor: EditorSettings
  onEditor: (next: EditorSettings) => Promise<boolean>
  notify: (text: string, kind: 'success' | 'error') => void
}

export function AccountDialog(props: Props) {
  const { tab, onTab, account, copy, lang, onLang, onSave, onDelete, notify } = props
  const ref = useRef<HTMLDialogElement>(null)
  const tabRefs = useRef<Partial<Record<AccountTab, HTMLButtonElement>>>({})

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (tab && !dialog.open) dialog.showModal()
    if (!tab && dialog.open) dialog.close()
  }, [tab])

  // الأسهم تنتقل بين التبويبات وتفعّلها، بنمط tablist المعتاد
  const onTabKey = (e: KeyboardEvent) => {
    if (!tab) return
    const at = TABS.indexOf(tab)
    const next =
      e.key === 'ArrowRight' ? TABS[(at + 1) % TABS.length]
      : e.key === 'ArrowLeft' ? TABS[(at - 1 + TABS.length) % TABS.length]
      : e.key === 'Home' ? TABS[0]
      : e.key === 'End' ? TABS[TABS.length - 1]
      : null
    if (!next) return
    e.preventDefault()
    onTab(next)
    tabRefs.current[next]?.focus()
  }

  return (
    <dialog
      ref={ref}
      onClose={() => onTab(null)}
      aria-labelledby="account-title"
      data-lenis-prevent
      className="m-auto max-h-[calc(100svh-2rem)] w-[min(40rem,calc(100%-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      {tab && (
        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-4 px-6 pt-5">
            <h2 id="account-title" className="text-xl font-semibold">
              {copy.title}
            </h2>
            <button type="button" onClick={() => onTab(null)} aria-label={copy.close} className={iconButton}>
              ✕
            </button>
          </div>

          <div role="tablist" aria-label={copy.title} onKeyDown={onTabKey} className="mt-4 flex gap-1 overflow-x-auto border-b border-line px-4">
            {TABS.map((t) => (
              <button
                key={t}
                ref={(el) => {
                  if (el) tabRefs.current[t] = el
                }}
                role="tab"
                id={`account-tab-${t}`}
                aria-selected={tab === t}
                aria-controls="account-panel"
                tabIndex={tab === t ? 0 : -1}
                onClick={() => onTab(t)}
                className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors ${
                  tab === t ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink'
                } ${t === 'danger' && tab !== t ? 'hover:text-red-400' : ''}`}
              >
                {copy.tabs[t]}
              </button>
            ))}
          </div>

          <div id="account-panel" role="tabpanel" aria-labelledby={`account-tab-${tab}`} className="overflow-y-auto p-6">
            {tab === 'profile' && <ProfileTab account={account} copy={copy} onSave={onSave} notify={notify} />}
            {tab === 'editor' && <EditorTab settings={props.editor} onChange={props.onEditor} copy={copy} notify={notify} />}
            {tab === 'preferences' && <PreferencesTab copy={copy} lang={lang} onLang={onLang} />}
            {tab === 'danger' && <DangerZoneTab copy={copy} email={account.email} onDelete={onDelete} />}
          </div>
        </div>
      )}
    </dialog>
  )
}
