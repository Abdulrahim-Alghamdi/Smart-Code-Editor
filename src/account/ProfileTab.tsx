import { useRef, useState, type ChangeEvent, type ReactNode, type SubmitEvent } from 'react'
import { accentButton, input, outlineButton } from '@/lib/ui'
import { Avatar } from './AccountMenu'
import type { AccountCopy } from './copy'
import { AVATAR_TYPES, checkAvatarFile, LIMITS, validateProfile, type Profile, type ProfileField } from './validation'

const AVATAR_PX = 128

// تصغير الصورة وقصّها مربعاً قبل الحفظ، فتبقى بضعة كيلوبايتات بدل ميغابايتات في التخزين المحلي
const shrinkImage = async (file: File): Promise<string> => {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = AVATAR_PX
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX)
  bitmap.close()
  return canvas.toDataURL('image/webp', 0.85)
}

interface Props {
  account: Profile
  copy: AccountCopy
  onSave: (next: Profile) => Promise<Profile | 'usernameTaken' | null>
  notify: (text: string, kind: 'success' | 'error') => void
}

export function ProfileTab({ account, copy, onSave, notify }: Props) {
  const [draft, setDraft] = useState<Profile>(account)
  // الأخطاء تظهر للحقل بعد مغادرته أو بعد محاولة الحفظ، لا أثناء أول كتابة
  const [touched, setTouched] = useState<Partial<Record<ProfileField, boolean>>>({})
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const errors = validateProfile(draft)
  const dirty = JSON.stringify(draft) !== JSON.stringify(account)

  const set = (field: keyof Profile) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft({ ...draft, [field]: field === 'username' ? e.target.value.toLowerCase() : e.target.value })

  const pickAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // يسمح باختيار الملف نفسه مرة أخرى بعد خطأ
    e.target.value = ''
    if (!file) return
    const problem = checkAvatarFile(file)
    if (problem) return setAvatarError(copy.errors[problem])
    setAvatarError(null)
    setProcessing(true)
    try {
      const avatar = await shrinkImage(file)
      setDraft((d) => ({ ...d, avatar }))
    } catch {
      setAvatarError(copy.errors.avatarRead)
    } finally {
      setProcessing(false)
    }
  }

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    const invalid = (Object.keys(errors) as ProfileField[])
    if (invalid.length) {
      setTouched({ name: true, username: true, email: true, bio: true })
      formRef.current?.querySelector<HTMLElement>(`[name="${invalid[0]}"]`)?.focus()
      return notify(copy.toasts.fixErrors, 'error')
    }
    // الحفظ يقص المسافات، فنأخذ النسخة المحفوظة حتى لا يبقى النموذج "معدّلاً" بعده
    setSaving(true)
    const saved = await onSave(draft)
    setSaving(false)
    if (!saved) return notify(copy.toasts.saveFailed, 'error')
    if (saved === 'usernameTaken') {
      formRef.current?.querySelector<HTMLElement>('[name="username"]')?.focus()
      return notify(copy.toasts.usernameTaken, 'error')
    }
    setDraft(saved)
    setTouched({})
    // البريد الجديد ينتظر التأكيد من الرسالة، فالمحفوظ يرجع بالبريد الحالي
    notify(saved.email === draft.email.trim() ? copy.toasts.saved : copy.toasts.emailPending, 'success')
  }

  const field = (name: ProfileField, label: string, control: ReactNode, hint?: ReactNode) => {
    const error = touched[name] && errors[name] ? copy.errors[errors[name]] : null
    return (
      <div>
        <label htmlFor={`account-${name}`} className="text-sm font-medium">
          {label}
        </label>
        {control}
        {error ? (
          <p id={`account-${name}-msg`} className="mt-1 text-xs text-accent-hover">
            {error}
          </p>
        ) : (
          hint && (
            <p id={`account-${name}-msg`} className="mt-1 text-xs text-ink-2">
              {hint}
            </p>
          )
        )}
      </div>
    )
  }

  const props = (name: ProfileField) => ({
    id: `account-${name}`,
    name,
    value: draft[name],
    onChange: set(name),
    onBlur: () => setTouched((t) => ({ ...t, [name]: true })),
    'aria-invalid': Boolean(touched[name] && errors[name]),
    'aria-describedby': `account-${name}-msg`,
  })

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar profile={draft} size="size-16" />
        <div className="space-y-2">
          <p className="text-sm font-medium">{copy.avatar}</p>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept={AVATAR_TYPES.join(',')} onChange={pickAvatar} hidden />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={processing} className={outlineButton}>
              {processing ? copy.processing : copy.upload}
            </button>
            {draft.avatar && (
              <button type="button" onClick={() => setDraft({ ...draft, avatar: null })} className={outlineButton}>
                {copy.removeAvatar}
              </button>
            )}
          </div>
          <p role={avatarError ? 'alert' : undefined} className={`text-xs ${avatarError ? 'text-accent-hover' : 'text-ink-2'}`}>
            {avatarError ?? copy.avatarHint}
          </p>
        </div>
      </div>

      {field('name', copy.name, <input {...props('name')} autoComplete="nickname" maxLength={LIMITS.name + 20} className={input} />, copy.nameHint)}
      {field(
        'username',
        copy.username,
        <input {...props('username')} dir="ltr" autoComplete="username" spellCheck={false} className={input} />,
        copy.usernameHint
      )}
      {field('email', copy.email, <input {...props('email')} dir="ltr" type="email" autoComplete="email" className={input} />)}
      {field(
        'bio',
        copy.bio,
        <textarea {...props('bio')} rows={3} className={`${input} resize-none`} />,
        copy.bioCount(draft.bio.length)
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={!dirty || processing || saving} aria-busy={saving} className={accentButton}>
          {saving ? copy.saving : copy.save}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setDraft(account)
              setTouched({})
              setAvatarError(null)
            }}
            className={outlineButton}
          >
            {copy.discard}
          </button>
        )}
        <p className="ms-auto text-xs text-ink-2">{copy.localNote}</p>
      </div>
    </form>
  )
}
