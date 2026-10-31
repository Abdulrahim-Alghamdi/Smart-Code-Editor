import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { AccountCopy } from './copy'
import type { Profile } from './validation'

export function Avatar({ profile, size }: { profile: Pick<Profile, 'name' | 'avatar'>; size: string }) {
  if (profile.avatar) return <img src={profile.avatar} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
  return (
    <span aria-hidden="true" className={`${size} grid shrink-0 place-items-center rounded-full bg-accent-mid text-sm font-medium text-ink`}>
      {profile.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

interface Props {
  account: Profile
  copy: AccountCopy
  onManage: () => void
  onPreferences: () => void
  onSignOut: () => void
}

// قائمة الحساب في الهيدر بنمط menu button: الأسهم تتنقل بين العناصر، و Escape أو النقر خارجها يغلقها
export function AccountMenu({ account, copy, onManage, onPreferences, onSignOut }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemsRef = useRef<HTMLButtonElement[]>([])

  useEffect(() => {
    if (!open) return
    itemsRef.current[0]?.focus()
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }

  const onMenuKey = (e: KeyboardEvent) => {
    const items = itemsRef.current.filter(Boolean)
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    const go = (i: number) => items[(i + items.length) % items.length]?.focus()
    if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(items.length - 1)
    else if (e.key === 'Escape') close()
    else if (e.key === 'Tab') return close(false)
    else return
    e.preventDefault()
  }

  const items: Array<[string, () => void]> = [
    [copy.manage, onManage],
    [copy.preferences, onPreferences],
    [copy.signOut, onSignOut],
  ]

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${copy.menuLabel}: ${account.name}`}
        className="flex h-9 items-center gap-2 rounded-lg border border-line-strong ps-1 pe-3 text-sm text-ink transition-colors hover:bg-surface"
      >
        <Avatar profile={account} size="size-7" />
        <span className="hidden max-w-32 truncate sm:inline">{account.name}</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label={copy.menuLabel}
          onKeyDown={onMenuKey}
          className="absolute end-0 top-full z-50 mt-2 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-xl"
        >
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <Avatar profile={account} size="size-10" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{account.name}</p>
              <p dir="ltr" className="truncate text-xs text-ink-2">
                {account.email}
              </p>
            </div>
          </div>
          <div className="my-1 h-px bg-line" />
          {items.map(([label, action], i) => (
            <button
              key={label}
              ref={(el) => {
                if (el) itemsRef.current[i] = el
              }}
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close(false)
                action()
              }}
              className={`flex h-9 w-full items-center rounded-lg px-2.5 text-start text-sm outline-none hover:bg-surface-2 focus-visible:bg-surface-2 ${
                i === items.length - 1 ? 'text-ink-2' : 'text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
