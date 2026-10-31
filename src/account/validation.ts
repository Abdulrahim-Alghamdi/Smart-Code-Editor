// قواعد التحقق من حقول الملف الشخصي؛ ترجع رموز أخطاء والنصوص في copy.ts

export interface Profile {
  name: string
  username: string
  email: string
  bio: string
  // صورة مصغّرة كـ data URL، أو null بلا صورة
  avatar: string | null
}

export type ProfileField = 'name' | 'username' | 'email' | 'bio'
export type ProfileError = 'required' | 'tooLong' | 'usernameFormat' | 'emailFormat'
export type AvatarError = 'avatarType' | 'avatarSize'

export const LIMITS = { name: 60, bio: 160, usernameMin: 3, usernameMax: 20 }
export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

// النقطة مسموحة بشرط ألا تكون في البداية أو النهاية أو متتالية (dsa.4 نعم، .dsa و dsa. و dsa..4 لا)
const USERNAME = new RegExp(`^(?!\\.)(?!.*\\.\\.)(?!.*\\.$)[a-z0-9_.]{${LIMITS.usernameMin},${LIMITS.usernameMax}}$`)
// shortcut: يتحقق من شكل البريد فقط (شيء@شيء.نطاق)؛ التحقق الفعلي يحتاج إرسال رسالة من خادم
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const validateProfile = (p: Profile): Partial<Record<ProfileField, ProfileError>> => {
  const errors: Partial<Record<ProfileField, ProfileError>> = {}
  const name = p.name.trim()
  if (!name) errors.name = 'required'
  else if (name.length > LIMITS.name) errors.name = 'tooLong'

  if (!p.username) errors.username = 'required'
  else if (!USERNAME.test(p.username)) errors.username = 'usernameFormat'

  const email = p.email.trim()
  if (!email) errors.email = 'required'
  else if (!EMAIL.test(email)) errors.email = 'emailFormat'

  if (p.bio.length > LIMITS.bio) errors.bio = 'tooLong'
  return errors
}

export const checkAvatarFile = (file: { type: string; size: number }): AvatarError | null => {
  if (!AVATAR_TYPES.includes(file.type)) return 'avatarType'
  if (file.size > AVATAR_MAX_BYTES) return 'avatarSize'
  return null
}

// يحوّل صف profiles القادم من الخادم إلى Profile، ويكمل الحقول الفارغة لحساب جديد.
// الصورة تُقبل data:image فقط: رابط خارجي يجعل المتصفح يتصل بموقع غريب عند كل عرض
export const parseProfile = (raw: unknown): Profile | null => {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.email !== 'string' || !r.email) return null
  return {
    name: typeof r.name === 'string' && r.name.trim() ? r.name : r.email.split('@')[0],
    username: typeof r.username === 'string' ? r.username : usernameFromEmail(r.email),
    email: r.email,
    bio: typeof r.bio === 'string' ? r.bio : '',
    avatar: typeof r.avatar === 'string' && r.avatar.startsWith('data:image/') ? r.avatar : null,
  }
}

// اسم مستخدم مبدئي من البريد للحسابات القديمة التي لم يكن لها اسم مستخدم؛ ينظّف النقاط حتى يطابق قاعدة USERNAME
export const usernameFromEmail = (email: string) => {
  const base = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(0, LIMITS.usernameMax)
    .replace(/^\.+|\.+$/g, '')
  return base.length >= LIMITS.usernameMin ? base : `${base}_user`.slice(0, LIMITS.usernameMax)
}
