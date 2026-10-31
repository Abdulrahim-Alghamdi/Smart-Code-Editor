import { useCallback, useEffect, useRef, useState, type SubmitEvent } from 'react'
import Editor, { type Monaco } from '@monaco-editor/react'
import { useLenis } from 'lenis/react'
import { LockIcon } from '@/components/Icons'
import LandingSections from '@/components/LandingSections'
import SplitText from '@/components/SplitText'
import { gsap, ScrollTrigger, useGSAP } from '@/lib/gsap'
import { GUEST_LANGUAGE_COUNT, LANGUAGES } from '@/lib/languages'
import { accentButton, iconButton, input, outlineButton } from '@/lib/ui'
import { KEYS } from '@/services/storage'
import { useStored } from '@/services/useStored'
import { workspaceCopy } from '@/workspace/copy'
import { DEFAULT_EDITOR_SETTINGS, parseEditorSettings, type EditorSettings } from '@/workspace/editorSettings'
import { parseHistory, recordEntry, type HistoryEntry } from '@/workspace/history'
import { RecentDialog } from '@/workspace/RecentDialog'
import { AccountDialog, type AccountTab } from '@/account/AccountDialog'
import { AccountMenu } from '@/account/AccountMenu'
import { accountCopy } from '@/account/copy'
import { Toast, type ToastMessage } from '@/account/Toast'
import { useAccount } from '@/account/useAccount'
import { useAuth } from '@/account/useAuth'

// تعريف نوع البيانات لاستجابة Gemini API
interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
  error?: { message?: string }
}

type Lang = 'ar' | 'en'
type Tab = 'bugs' | 'fix' | 'optimize'
// reset يطلب رابط الاستعادة، و newPassword يظهر بعد فتح ذلك الرابط من البريد
type AuthMode = 'signin' | 'signup' | 'reset' | 'newPassword'

// ملف واحد من ملفات المشروع المفتوحة في تبويبات المحرر
interface ProjectFile {
  id: string
  name: string
  language: string
  content: string
}

interface FileContent {
  name: string
  content: string
}

interface ReviewText {
  bugs: string[]
  rootCause: string
  fixes: string[]
  optimizations: string[]
}

// شكل المراجعة المنظمة التي نطلبها من Gemini: الشرح باللغتين حتى يتبع لغة الواجهة عند تبديلها، والكود مشترك
interface Review {
  ar: ReviewText
  en: ReviewText
  fixedFiles: FileContent[]
  renamedFiles: Array<{ from: string; to: string }>
  suggestedFiles: FileContent[]
}

const TEXT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    bugs: { type: 'ARRAY', items: { type: 'STRING' } },
    rootCause: { type: 'STRING' },
    fixes: { type: 'ARRAY', items: { type: 'STRING' } },
    optimizations: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['bugs', 'rootCause', 'fixes', 'optimizations'],
}

const FILE_LIST_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: { name: { type: 'STRING' }, content: { type: 'STRING' } },
    required: ['name', 'content'],
  },
}

const REVIEW_SCHEMA = {
  type: 'OBJECT',
  properties: {
    ar: TEXT_SCHEMA,
    en: TEXT_SCHEMA,
    fixedFiles: FILE_LIST_SCHEMA,
    renamedFiles: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { from: { type: 'STRING' }, to: { type: 'STRING' } },
        required: ['from', 'to'],
      },
    },
    suggestedFiles: FILE_LIST_SCHEMA,
  },
  required: ['ar', 'en', 'fixedFiles', 'renamedFiles', 'suggestedFiles'],
}

const newId = () => Math.random().toString(36).slice(2)

// امتدادات شائعة أخرى للغات نفسها، حتى يُعرف ملف مستورد مثل index.htm أو config.yaml
const EXT_ALIASES = new Map([
  ['htm', 'html'], ['yaml', 'yml'], ['markdown', 'md'], ['jsx', 'js'], ['mjs', 'js'], ['cjs', 'js'], ['tsx', 'ts'],
  ['h', 'c'], ['hpp', 'cpp'], ['cc', 'cpp'], ['cxx', 'cpp'], ['bash', 'sh'], ['kts', 'kt'],
])

// امتداد اسم الملف يحدد لغته عند الإمكان، وإلا تبقى اللغة الحالية
const languageOf = (name: string, fallback: string) => {
  const raw = /\.(\w+)$/.exec(name)?.[1].toLowerCase() ?? ''
  const ext = EXT_ALIASES.get(raw) ?? raw
  return LANGUAGES.find((l) => l.ext === ext)?.id ?? fallback
}

// ما يقبله حوار الاستيراد: امتداد كل لغة وبدائله
const IMPORT_ACCEPT = [...LANGUAGES.map((l) => l.ext), ...EXT_ALIASES.keys()].map((e) => `.${e}`).join(',')
// المحرر للنصوص البرمجية، فالملفات الأكبر من هذا غالباً ليست كوداً يُراجع
const MAX_IMPORT_BYTES = 1_000_000

const withExt = (name: string, ext: string) => `${name.replace(/\.\w+$/, '')}.${ext}`

// يضيف رقماً لاسم الملف إذا كان مستخدماً: Main.java ← Main2.java
const uniqueName = (name: string, taken: string[]) => {
  let n = 1
  let candidate = name
  while (taken.includes(candidate)) candidate = name.replace(/(\.\w+)?$/, `${++n}$1`)
  return candidate
}

// ترتيب أمثلة كل لغة: خطأ نحوي، خطأ منطقي، كود نظيف؛ النظيف هو العرض التجريبي عند تبديل اللغة
const CLEAN_EXAMPLE = 2

const GUEST_LANGUAGES = new Set(LANGUAGES.slice(0, GUEST_LANGUAGE_COUNT).map((l) => l.id))

const FIRST_FILE: ProjectFile = {
  // معرّف جديد في كل جلسة: السجل يحدّث لقطات الملفات بمعرّفها، ومعرّف ثابت كان سيكتب فوق ملف الجلسة السابقة
  id: newId(),
  name: `main.${LANGUAGES[0].ext}`,
  language: LANGUAGES[0].id,
  content: LANGUAGES[0].examples[0],
}

// النماذج بالترتيب: إذا كان أحدها مشغولاً أو لم يرد خلال المهلة ننتقل للتالي
const GEMINI_MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-flash-lite-latest']
const MODEL_TIMEOUT_MS = 20_000
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined

// عدد مرات الفحص المجانية للزائر قبل طلب تسجيل الدخول
const FREE_TRIES = 1
// رقم متزايد لكل رسالة، فتظهر الرسالة نفسها من جديد إذا تكررت
let toastCount = 0

// اللقطة تُحفظ بعد توقف الكتابة بهذه المدة، لا مع كل حرف
const HISTORY_DELAY_MS = 1500

const parseLang = (v: unknown): Lang | null => (v === 'ar' || v === 'en' ? v : null)
const parseCount = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)
// أمثلة اللغات الجاهزة ليست عمل المستخدم، فلا تُسجَّل في الملفات الأخيرة
const isExample = (content: string) => LANGUAGES.some((l) => l.examples.includes(content))

// ينزّل نصاً كملف، للحفظ والنسخة الاحتياطية
const download = (name: string, text: string, type: string) => {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// قاموس الترجمة لجميع نصوص الواجهة
const t = {
  ar: {
    brand: 'محرر الأكواد الذكي',
    title: 'ماذا ستصلح اليوم؟',
    subtitle: 'الصق الكود ودع الذكاء الاصطناعي يكتشف الأخطاء ويشرح الحل',
    toggle: 'English',
    toggleLabel: 'التبديل إلى الإنجليزية',
    scrollDown: 'انتقل إلى المزايا',
    language: 'لغة البرمجة',
    replaceCode: 'سيُستبدل الكود الحالي بمثال تجريبي للغة الجديدة. هل تريد المتابعة؟',
    tryExample: 'جرّب مثالاً',
    exampleNames: ['خطأ نحوي', 'خطأ منطقي', 'كود نظيف'],
    copyCode: 'نسخ الكود',
    clear: 'مسح المحرر',
    copied: 'تم النسخ ✓',
    analyze: 'فحص الكود بالذكاء الاصطناعي',
    analyzing: 'جاري الفحص واستخراج الأخطاء...',
    newReview: 'مراجعة جديدة',
    freeLeft: 'لديك تجربة مجانية واحدة — سجّل الدخول للفحص بلا حدود',
    freeUsed: 'انتهت تجربتك المجانية — سجّل الدخول أو أنشئ حساباً للمتابعة',
    tabs: { bugs: 'تحليل الأخطاء والسبب الجذري', fix: 'الإصلاح المقترح', optimize: 'التحسين وأفضل الممارسات' },
    rootCause: 'السبب الجذري',
    noBugs: 'لم يتم العثور على أخطاء.',
    noFix: 'لا يحتاج الكود إلى إصلاح.',
    noOptimizations: 'لا توجد اقتراحات تحسين.',
    suggestedFiles: 'ملفات الأصناف المقترحة',
    createFiles: 'إنشاء ملفات الأصناف المقترحة',
    files: {
      label: 'ملفات المشروع',
      new: 'ملف جديد',
      close: 'إغلاق',
      rename: 'اسم الملف',
      renameAction: 'إعادة تسمية',
      renameHint: 'انقر مرتين أو اضغط F2 لإعادة التسمية',
      confirmClose: 'سيُفقد محتوى هذا الملف. هل تريد إغلاقه؟',
      import: 'استيراد',
      export: 'حفظ',
      importSkipped: 'لم تُستورد هذه الملفات لأنها ليست نصية أو أكبر من 1 ميغابايت:',
    },
    applyFix: 'تطبيق إصلاح الذكاء الاصطناعي',
    copyExplanation: 'نسخ الشرح',
    lines: 'سطر',
    chars: 'حرف',
    status: { missing: 'المفتاح مفقود', checking: 'جاري الفحص', error: 'خطأ في الاتصال', online: 'متصل', ready: 'جاهز' },
    auth: {
      login: 'تسجيل الدخول',
      signupButton: 'إنشاء حساب',
      signinTitle: 'تسجيل الدخول',
      signupTitle: 'إنشاء حساب',
      limitNotice: 'استخدمت تجربتك المجانية. سجّل الدخول أو أنشئ حساباً لمواصلة فحص الكود.',
      featureNotice: 'هذه الميزة متاحة بحساب مجاني. أنشئ حساباً أو سجّل الدخول لاستخدامها.',
      name: 'الاسم',
      email: 'البريد الإلكتروني',
      password: 'كلمة المرور',
      signin: 'دخول',
      signup: 'إنشاء الحساب',
      noAccount: 'ليس لديك حساب؟',
      haveAccount: 'لديك حساب بالفعل؟',
      toSignup: 'أنشئ حساباً',
      toSignin: 'سجّل الدخول',
      close: 'إغلاق',
      forgot: 'نسيت كلمة المرور؟',
      resetTitle: 'استعادة كلمة المرور',
      sendReset: 'إرسال رابط الاستعادة',
      resetSent: 'إذا كان البريد مسجّلاً فستصلك رسالة فيها رابط لتعيين كلمة مرور جديدة.',
      newPasswordTitle: 'كلمة مرور جديدة',
      savePassword: 'حفظ كلمة المرور',
      checkEmail: 'أرسلنا رسالة تأكيد إلى بريدك. افتح الرابط فيها لتفعيل حسابك.',
      backToSignin: 'العودة لتسجيل الدخول',
    },
    errors: {
      // ⁦…⁩ (⁦…⁩) يعزلان الأسماء اللاتينية حتى لا تقفز نقطة .env لطرفها الخطأ داخل الجملة العربية
      noKey: 'لم يتم العثور على مفتاح ⁦VITE_GEMINI_API_KEY⁩ في ملف ⁦.env⁩. أضفه ثم أعد تشغيل خادم التطوير.',
      request: 'تعذر الحصول على نتيجة.',
      badResponse: 'وصل رد غير مفهوم من الذكاء الاصطناعي. حاول مرة أخرى.',
      network: 'انتهت مهلة الاتصال بالذكاء الاصطناعي أو انقطع الاتصال. حاول مرة أخرى.',
    },
  },
  en: {
    brand: 'Smart Code Editor',
    title: 'What will you fix today?',
    subtitle: 'Paste your code — AI finds the bugs and explains the fix',
    toggle: 'العربية',
    toggleLabel: 'Switch to Arabic',
    scrollDown: 'Scroll to features',
    language: 'Language',
    replaceCode: 'Your current code will be replaced with a demo for the new language. Continue?',
    tryExample: 'Try an example',
    exampleNames: ['Syntax Error', 'Logic Bug', 'Clean Code'],
    copyCode: 'Copy Code',
    clear: 'Clear Editor',
    copied: 'Copied ✓',
    analyze: 'Analyze code with AI',
    analyzing: 'Analyzing and extracting errors...',
    newReview: 'New review',
    freeLeft: 'You have 1 free review — sign in for unlimited reviews',
    freeUsed: 'Your free review is used — sign in or create an account to continue',
    tabs: { bugs: 'Bug Analysis & Root Cause', fix: 'Suggested Code Fix', optimize: 'Optimization & Best Practices' },
    rootCause: 'Root Cause',
    noBugs: 'No bugs found.',
    noFix: 'The code needs no fix.',
    noOptimizations: 'No optimization suggestions.',
    suggestedFiles: 'Suggested class files',
    createFiles: 'Create Suggested Class Files',
    files: {
      label: 'Project files',
      new: 'New file',
      close: 'Close',
      rename: 'File name',
      renameAction: 'Rename',
      renameHint: 'Double-click or press F2 to rename',
      confirmClose: "This file's content will be lost. Close it?",
      import: 'Import',
      export: 'Save',
      importSkipped: 'These files were not imported because they are not text or are over 1 MB:',
    },
    applyFix: 'Apply AI Fix',
    copyExplanation: 'Copy Explanation',
    lines: 'lines',
    chars: 'chars',
    status: { missing: 'Key missing', checking: 'Analyzing', error: 'Connection error', online: 'Online', ready: 'Ready' },
    auth: {
      login: 'Log in',
      signupButton: 'Sign up',
      signinTitle: 'Log in',
      signupTitle: 'Create account',
      limitNotice: 'You have used your free review. Log in or create an account to keep analyzing code.',
      featureNotice: 'This feature comes with a free account. Create one or log in to use it.',
      name: 'Name',
      email: 'Email',
      password: 'Password',
      signin: 'Log in',
      signup: 'Create account',
      noAccount: "Don't have an account?",
      haveAccount: 'Already have an account?',
      toSignup: 'Sign up',
      toSignin: 'Log in',
      close: 'Close',
      forgot: 'Forgot password?',
      resetTitle: 'Reset password',
      sendReset: 'Send reset link',
      resetSent: "If that email has an account, we've sent it a link to set a new password.",
      newPasswordTitle: 'Set a new password',
      savePassword: 'Save password',
      checkEmail: "We've sent you a confirmation email. Open the link in it to activate your account.",
      backToSignin: 'Back to log in',
    },
    errors: {
      noKey: 'VITE_GEMINI_API_KEY was not found in .env. Add it and restart the dev server.',
      request: 'Could not get a result.',
      badResponse: 'The AI returned a response that could not be read. Please try again.',
      network: 'The AI request timed out or the connection dropped. Please try again.',
    },
  },
}

type ErrorKey = keyof (typeof t)['en']['errors']

const STATUS_STYLES = {
  missing: 'bg-red-500',
  checking: 'bg-amber-400 animate-pulse',
  error: 'bg-red-500',
  online: 'bg-emerald-500',
  ready: 'bg-ink-2',
}

// الرد قادم من خدمة خارجية، لذا نتحقق من شكله قبل عرضه
const isFileList = (v: unknown): v is FileContent[] =>
  Array.isArray(v) && v.every((f) => typeof f?.name === 'string' && typeof f?.content === 'string')

const isReviewText = (v: ReviewText | undefined) =>
  Array.isArray(v?.bugs) && typeof v.rootCause === 'string' && Array.isArray(v.fixes) && Array.isArray(v.optimizations)

const parseReview = (text: string): Review | null => {
  try {
    const r = JSON.parse(text)
    const ok =
      isReviewText(r.ar) &&
      isReviewText(r.en) &&
      isFileList(r.fixedFiles) &&
      Array.isArray(r.renamedFiles) &&
      r.renamedFiles.every((x: Review['renamedFiles'][number]) => typeof x?.from === 'string' && typeof x?.to === 'string') &&
      isFileList(r.suggestedFiles)
    if (!ok) return null
    // الأسماء المقترحة تصبح أسماء تبويبات، فنزيل منها أي مسار ونهمل الفارغ
    const baseName = (name: string) => name.split(/[\\/]/).pop()!.trim()
    r.suggestedFiles = r.suggestedFiles
      .map((f: FileContent) => ({ ...f, name: baseName(f.name) }))
      .filter((f: FileContent) => f.name)
    r.renamedFiles = r.renamedFiles
      .map((x: Review['renamedFiles'][number]) => ({ ...x, to: baseName(x.to) }))
      .filter((x: Review['renamedFiles'][number]) => x.to)
    return r
  } catch {
    return null
  }
}

// زر بأيقونة ونص، للأفعال التي لا تكفي أيقونتها وحدها
const labelButton =
  'flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-ink-2 transition-colors hover:bg-surface hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent'
const chip = 'h-8 rounded-md bg-surface-2 px-2.5 text-[13px] text-ink transition-colors hover:bg-line'

function App() {
  const heroRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const authRef = useRef<HTMLDialogElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const lenis = useLenis()

  // حالات الواجهة والمحرر والذكاء الاصطناعي
  const [lang, setLang] = useStored<Lang>(KEYS.lang, 'ar', parseLang)
  const [editorSettings, setEditorSettings] = useStored(KEYS.editor, DEFAULT_EDITOR_SETTINGS, parseEditorSettings)
  const [history, setHistory, historyLoaded] = useStored<HistoryEntry[]>(KEYS.history, [], parseHistory)
  const [recentOpen, setRecentOpen] = useState(false)
  const [files, setFiles] = useState<ProjectFile[]>([FIRST_FILE])
  const [activeId, setActiveId] = useState<string>(FIRST_FILE.id)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [error, setError] = useState<{ key: ErrorKey; detail?: string } | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [lastModel, setLastModel] = useState<string>('')
  const [tab, setTab] = useState<Tab>('bugs')
  const [copied, setCopied] = useState<'code' | 'explanation' | null>(null)

  // حالات الحساب والتجربة المجانية
  // shortcut: حد التجربة المجانية للزائر محفوظ في المتصفح ويمكن تجاوزه بمسح بياناته؛ انقله لخادم إذا صار مهماً
  const auth = useAuth()
  const { account: user, loaded: accountLoaded, settings: accountSettings, save, saveSettings, remove } = useAccount()
  const [accountTab, setAccountTab] = useState<AccountTab | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [freeUsed, setFreeUsed] = useStored(KEYS.freeUsed, 0, parseCount)
  const [authMode, setAuthMode] = useState<AuthMode>('signin')
  // سبب فتح نافذة الدخول: انتهاء الفحص المجاني أو ميزة للمسجّلين، ويظهر كتنبيه فوق النموذج
  const [authNotice, setAuthNotice] = useState<'limit' | 'feature' | null>(null)
  // نتيجة آخر إرسال للنموذج: خطأ من Supabase أو تعليمات مثل "افتح بريدك"
  const [authAlert, setAuthAlert] = useState<{ text: string; error: boolean } | null>(null)
  const [authBusy, setAuthBusy] = useState(false)

  const tr = t[lang]
  // المحرر وأدواته تعمل على الملف النشط، والفحص يشمل كل الملفات
  const active = files.find((f) => f.id === activeId) ?? files[0]
  const code = active.content
  const language = active.language
  const hasCode = files.some((f) => f.content.trim())
  const current = LANGUAGES.find((l) => l.id === language) ?? LANGUAGES[0]
  const apiStatus = !API_KEY ? 'missing' : loading ? 'checking' : error ? 'error' : lastModel ? 'online' : 'ready'
  const freeLeft = Math.max(0, FREE_TRIES - freeUsed)
  // تتحول واجهة البداية إلى مساحة عمل بعمودين عند بدء الفحص
  const panelOpen = Boolean(review || error || loading)

  // مزامنة لغة الصفحة وحفظها؛ الاتجاه يبقى LTR في اللغتين حتى لا تنقلب الواجهة عند تبديل اللغة
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  // ارتفاع الواجهة يتغير عند فتح لوحة المراجعة أو تغيير اللغة، فنعيد حساب مواضع حركات التمرير
  useEffect(() => {
    ScrollTrigger.refresh()
  }, [panelOpen, lang])

  // حركة دخول عناصر الواجهة عند التحميل
  useGSAP(() => {
    gsap.from(heroRef.current?.children ?? [], { y: 24, opacity: 0, duration: 0.7, stagger: 0.1, ease: 'power2.out' })
  })

  // حركة ظهور لوحة المراجعة ونتيجتها
  useGSAP(
    () => {
      if (panelOpen) gsap.from(resultRef.current, { y: 16, opacity: 0, duration: 0.5, ease: 'power2.out' })
    },
    { dependencies: [review, error, panelOpen] }
  )

  const openAuth = (mode: AuthMode, notice: 'limit' | 'feature' | null = null) => {
    // المسجّل لا يحتاج نافذة الدخول؛ أزرار "أنشئ حساباً" تفتح له إدارة الحساب
    if (user) return setAccountTab('profile')
    setAuthMode(mode)
    setAuthNotice(notice)
    setAuthAlert(null)
    const dialog = authRef.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    gsap.fromTo(dialog, { scale: 0.95, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'power2.out' })
  }

  const closeAuth = () => authRef.current?.close()

  // shortcut: القيود في الواجهة فقط ويمكن تجاوزها من أدوات المطوّر؛ تصبح حقيقية عند نقلها لخادم مع الحسابات
  // يكمل الإجراء للمسجّل، ويفتح للزائر نافذة إنشاء حساب مع سبب المنع
  const needsAccount = () => {
    if (user) return false
    openAuth('signup', 'feature')
    return true
  }
  const lockedLanguage = (id: string) => !user && !GUEST_LANGUAGES.has(id)

  const switchAuth = (mode: AuthMode) => {
    setAuthMode(mode)
    setAuthAlert(null)
  }

  const submitAuth = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    setAuthBusy(true)
    setAuthAlert(null)
    const { error } =
      authMode === 'signup' ? await auth.signUp(String(form.get('name') ?? '').trim(), email, password)
      : authMode === 'signin' ? await auth.signIn(email, password)
      : authMode === 'reset' ? await auth.resetPassword(email)
      : await auth.updatePassword(password)
    setAuthBusy(false)
    // shortcut: رسائل خطأ Supabase بالإنجليزية فقط؛ ترجم الشائعة منها (error.code) إذا احتاج المستخدم العربي ذلك
    if (error) return setAuthAlert({ text: error.message, error: true })
    if (authMode === 'signup') return setAuthAlert({ text: tr.auth.checkEmail, error: false })
    if (authMode === 'reset') return setAuthAlert({ text: tr.auth.resetSent, error: false })
    if (authMode === 'newPassword') notify(ac.toasts.passwordUpdated, 'success')
    closeAuth()
  }

  // رابط الاستعادة من البريد يسجّل الدخول مؤقتاً، فنطلب كلمة المرور الجديدة فوراً
  useEffect(() => {
    if (!auth.recovering || authRef.current?.open) return
    setAuthMode('newPassword')
    setAuthNotice(null)
    setAuthAlert(null)
    authRef.current?.showModal()
  }, [auth.recovering])

  const ac = accountCopy[lang]
  const notify = (text: string, kind: ToastMessage['kind']) => setToast({ text, kind, id: ++toastCount })
  const clearToast = useCallback(() => setToast(null), [])

  const wc = workspaceCopy[lang]

  // اللغة وإعدادات المحرر المحفوظة في حساب المسجّل تتبعه بين الأجهزة، فتُطبَّق فور تحميل ملفه
  useEffect(() => {
    if (accountSettings?.lang) setLang(accountSettings.lang)
    if (accountSettings?.editor) setEditorSettings(accountSettings.editor)
  }, [accountSettings, setLang, setEditorSettings])

  // تُحفظ في المتصفح دائماً، وفي جدول profiles أيضاً للمسجّل
  const saveLang = async (next: Lang) => (await setLang(next)) && (await saveSettings({ lang: next }))
  const saveEditor = async (next: EditorSettings) => (await setEditorSettings(next)) && (await saveSettings({ editor: next }))

  const signOut = async () => {
    setAccountTab(null)
    const { error } = await auth.signOut()
    if (error) return notify(error.message, 'error')
    notify(ac.toasts.signedOut, 'success')
  }

  const deleteAccount = async () => {
    if (!(await remove())) return notify(ac.toasts.deleteFailed, 'error')
    setAccountTab(null)
    notify(ac.toasts.deleted, 'success')
  }

  const changeLang = async (next: Lang) => {
    if (await saveLang(next)) notify(accountCopy[next].toasts.languageSaved, 'success')
    else notify(accountCopy[next].toasts.editorSaveFailed, 'error')
  }

  // الملفات الأخيرة: لقطة من الملف النشط بعد توقف الكتابة
  useEffect(() => {
    // قبل تحميل السجل المحفوظ قد تستبدل الكتابة الأولى السجل كله
    if (!historyLoaded || !active.content.trim() || isExample(active.content)) return
    const timer = setTimeout(() => {
      const next = recordEntry(history, { id: active.id, name: active.name, language: active.language, content: active.content, updatedAt: Date.now() })
      // shortcut: فشل حفظ السجل في الخلفية لا يُعرض حتى لا تتكرر الرسالة كل ثانيتين؛ يظهر عند المسح أو الإزالة
      if (next !== history) setHistory(next)
    }, HISTORY_DELAY_MS)
    return () => clearTimeout(timer)
  }, [historyLoaded, active.id, active.name, active.language, active.content, history, setHistory])

  const openRecent = (entry: HistoryEntry) => {
    const open = files.find((f) => f.id === entry.id)
    if (open) {
      setActiveId(open.id)
      setRecentOpen(false)
      return
    }
    // فتح ملف من السجل يضيف تبويباً، وتعدد الملفات للمسجّلين
    setRecentOpen(false)
    if (needsAccount()) return
    const name = uniqueName(entry.name, files.map((f) => f.name))
    setFiles((all) => [...all, { id: entry.id, name, language: entry.language, content: entry.content }])
    setActiveId(entry.id)
    notify(wc.toasts.opened(name), 'success')
  }

  const removeRecent = async (id: string) => {
    if (await setHistory(history.filter((e) => e.id !== id))) notify(wc.toasts.removed, 'success')
    else notify(wc.toasts.historyFailed, 'error')
  }

  const clearRecent = async () => {
    if (await setHistory([])) notify(wc.toasts.cleared, 'success')
    else notify(wc.toasts.historyFailed, 'error')
  }

  const copy = async (text: string, what: 'code' | 'explanation') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(null), 1500)
    } catch (err) {
      console.error(err)
    }
  }

  const updateFile = (id: string, patch: Partial<ProjectFile>) =>
    setFiles((all) => all.map((f) => (f.id === id ? { ...f, ...patch } : f)))

  const setCode = (content: string) => updateFile(active.id, { content })

  // اختيار لغة يغيّر امتداد الملف النشط، ومع exampleIndex يحمّل أحد أمثلتها بدل الكود
  const selectLanguage = (id: string, exampleIndex?: number) => {
    const next = LANGUAGES.find((l) => l.id === id)
    if (!next) return
    const taken = files.filter((f) => f.id !== active.id).map((f) => f.name)
    updateFile(active.id, {
      language: next.id,
      name: uniqueName(withExt(active.name, next.ext), taken),
      ...(exampleIndex !== undefined && { content: next.examples[exampleIndex] }),
    })
  }

  // Monaco يعيد استخدام نموذج الملف بلغته القديمة إذا تغيرت لغة الملف وهو غير نشط، فنزامنها عند كل تبديل
  const monacoRef = useRef<Monaco | null>(null)
  useEffect(() => {
    const monaco = monacoRef.current
    const model = monaco?.editor.getModel(monaco.Uri.parse(active.id))
    if (model && model.getLanguageId() !== active.language) monaco!.editor.setModelLanguage(model, active.language)
  }, [active.id, active.language])

  // حجم المسافة البادئة إعداد لكل نموذج (ملف) في Monaco، فخيار المحرر وحده لا يغيّر الملفات المفتوحة
  const applyTabSize = () => {
    for (const model of monacoRef.current?.editor.getModels() ?? []) model.updateOptions({ tabSize: editorSettings.tabSize, insertSpaces: true })
  }
  useEffect(applyTabSize, [editorSettings.tabSize, active.id])

  const newFile = () => {
    const file = { id: newId(), name: uniqueName(`untitled.${current.ext}`, files.map((f) => f.name)), language, content: '' }
    setFiles([...files, file])
    setActiveId(file.id)
    setRenamingId(file.id)
  }

  const renameFile = (file: ProjectFile, raw: string) => {
    setRenamingId(null)
    const name = raw.trim()
    // الأسماء فريدة لأن إصلاحات الذكاء الاصطناعي تُطبَّق على الملفات بأسمائها
    if (!name || name === file.name || files.some((f) => f.name === name)) return
    const nextLanguage = languageOf(name, file.language)
    // تغيير الامتداد طريق آخر لاختيار لغة، فيخضع لقيد اللغات نفسه
    if (nextLanguage !== file.language && lockedLanguage(nextLanguage) && needsAccount()) return
    updateFile(file.id, { name, language: nextLanguage })
  }

  // كل ملف مستورد يفتح في تبويب جديد بلغة امتداده، وأولها يصبح النشط
  const importFiles = async (list: FileList | null) => {
    if (!list?.length) return
    const taken = files.map((f) => f.name)
    const imported: ProjectFile[] = []
    const skipped: string[] = []
    for (const file of Array.from(list)) {
      const content = file.size <= MAX_IMPORT_BYTES ? await file.text() : null
      // حرف NUL علامة ملف ثنائي (صورة، أرشيف) لا يصلح للمحرر
      if (content === null || content.includes('\0')) {
        skipped.push(file.name)
        continue
      }
      const name = uniqueName(file.name, taken)
      taken.push(name)
      imported.push({ id: newId(), name, language: languageOf(name, language), content })
    }
    if (imported.length) {
      setFiles((all) => [...all, ...imported])
      setActiveId(imported[0].id)
    }
    if (imported.length) notify(wc.toasts.filesImported(imported.length), 'success')
    if (skipped.length) notify(`${tr.files.importSkipped} ${skipped.join('، ')}`, 'error')
  }

  // الحفظ بامتداد لغة الملف، فملف اسمه main.js ولغته Python يُحفظ main.py
  const exportFile = () => {
    const name = languageOf(active.name, '') === active.language ? active.name : withExt(active.name, current.ext)
    download(name, code, 'text/plain;charset=utf-8')
    notify(wc.toasts.fileSaved(name), 'success')
  }

  const closeFile = (file: ProjectFile) => {
    if (files.length === 1) return
    if (file.content.trim() && !window.confirm(`${file.name}\n${tr.files.confirmClose}`)) return
    const rest = files.filter((f) => f.id !== file.id)
    setFiles(rest)
    if (file.id === active.id) setActiveId(rest[Math.max(0, files.indexOf(file) - 1)].id)
  }

  const closePanel = () => {
    setReview(null)
    setError(null)
  }

  const explanationText = review
    ? [
        tr.tabs.bugs,
        ...review[lang].bugs.map((b) => `- ${b}`),
        `${tr.rootCause}: ${review[lang].rootCause}`,
        '',
        tr.tabs.fix,
        ...review[lang].fixes.map((f) => `- ${f}`),
        '',
        tr.tabs.optimize,
        ...review[lang].optimizations.map((o) => `- ${o}`),
      ].join('\n')
    : ''

  // الإصلاحات تُطبَّق على الملفات المطابقة بالاسم، والأصناف المقترحة تُنشأ فقط إن لم يوجد ملف بالاسم نفسه حتى لا يُستبدل عمل المستخدم
  const fixable = review?.fixedFiles.filter((fx) => files.some((f) => f.name === fx.name && f.content !== fx.content)) ?? []
  const renames = review?.renamedFiles.filter((r) => files.some((f) => f.name === r.from) && !files.some((f) => f.name === r.to)) ?? []
  const newClassFiles =
    review?.suggestedFiles.filter((s, i, all) => !files.some((f) => f.name === s.name) && all.findIndex((x) => x.name === s.name) === i) ?? []

  // الإصلاح يطابق الملفات بأسمائها الحالية، ثم يعيد تسمية ما طلب الذكاء الاصطناعي تسميته
  const applyFix = () => {
    setFiles(
      files.map((f) => {
        const to = renames.find((r) => r.from === f.name)?.to
        const content = fixable.find((fx) => fx.name === f.name)?.content ?? f.content
        return to ? { ...f, content, name: to, language: languageOf(to, f.language) } : { ...f, content }
      })
    )
    notify(wc.toasts.fixApplied, 'success')
  }

  const createSuggestedFiles = () => {
    const created = newClassFiles.map((s) => ({ id: newId(), name: s.name, language: languageOf(s.name, language), content: s.content }))
    setFiles([...files, ...created])
    setActiveId(created[0].id)
    notify(wc.toasts.classFilesCreated(created.length), 'success')
  }

  // دالة فحص كل ملفات المشروع عبر Gemini API
  const analyzeCode = async (): Promise<void> => {
    if (!hasCode) return
    if (!user && freeLeft === 0) {
      openAuth('signin', 'limit')
      return
    }

    setReview(null)
    if (!API_KEY) {
      setError({ key: 'noKey' })
      return
    }

    setLoading(true)
    setError(null)

    const project = files
      .map((f) => `File: ${f.name} (${LANGUAGES.find((l) => l.id === f.language)?.label ?? f.language})\n\`\`\`\n${f.content}\n\`\`\``)
      .join('\n\n')

    const promptText = `You are an expert code reviewer. Below is a project of ${files.length} file(s): ${files.map((f) => f.name).join(', ')}.
Analyze the whole project together, including how the files interact (e.g. a main method using classes from other files), for syntax errors, logical bugs and object-oriented structure problems.
Return:
- "ar" and "en": the same review written in Arabic ("ar") and in English ("en"), each with:
  - "bugs": each error found, naming the file it is in (empty if none)
  - "rootCause": why the errors happen
  - "fixes": how to fix each one
  - "optimizations": performance, readability, OOP structure and best-practice suggestions
- "fixedFiles": for each existing file that needs changes, its exact existing file name and full corrected content (empty if nothing needs fixing)
- "renamedFiles": files whose name must change, as {"from": exact existing name, "to": new name}. When a file name does not match the class it declares (e.g. "main.java" declaring "public class Main"), rename the file to match the class; never rename the class in code just to match its file name (empty if none)
- "suggestedFiles": when the code uses classes that no file defines, or one file holds several classes that belong in separate files (e.g. Java requires one public class per file), one entry per class, named after the class with the right extension (e.g. "VIP.java"), with its full code. Never include a file name that already exists. If you move a class out of a file, also return that file without it in "fixedFiles" (empty if none)
Keep code identifiers unchanged in both languages.

${project}`

    let lastError: { key: ErrorKey; detail?: string } = { key: 'network' }
    try {
      for (const model of GEMINI_MODELS) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': API_KEY },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptText }] }],
              generationConfig: { responseMimeType: 'application/json', responseSchema: REVIEW_SCHEMA },
            }),
            signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
          })

          const data: GeminiResponse = await response.json()
          if (response.ok) {
            const parsed = parseReview(data.candidates?.[0]?.content?.parts?.[0]?.text ?? '')
            if (parsed) {
              setReview(parsed)
              setLastModel(model)
              setTab('bugs')
              // تُحتسب التجربة المجانية فقط عند نجاح الفحص
              if (!user) {
                setFreeUsed(freeUsed + 1)
              }
              return
            }
            lastError = { key: 'badResponse' }
            continue
          }
          lastError = { key: 'request', detail: `(${response.status}) ${data.error?.message ?? ''}` }
          // خطأ في المفتاح أو الطلب لن يُحل بتجربة نموذج آخر
          if ([400, 401, 403].includes(response.status)) break
        } catch (err) {
          console.error(model, err)
          lastError = { key: 'network' }
        }
      }
      setError(lastError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-svh bg-page text-ink selection:bg-accent/30">
      {/* الهيدر الثابت: الشعار وحالة الـ API والوضع واللغة والحساب */}
      <header className="fixed inset-x-0 top-0 z-40 h-20 bg-page/80 backdrop-blur">
        <div className="mx-auto flex h-full max-w-[1280px] items-center gap-3 px-4 md:px-8">
          <button onClick={() => lenis?.scrollTo(0)} className="flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-accent font-mono text-xs font-bold text-white" aria-hidden="true">
              {'{}'}
            </span>
            <span className="hidden text-xl font-medium sm:inline">{tr.brand}</span>
          </button>
          <div className="ms-auto flex items-center gap-2">
            <span className="me-1 hidden items-center gap-1.5 text-sm text-ink-2 lg:flex" title={lastModel || undefined}>
              <span className={`size-2 rounded-full ${STATUS_STYLES[apiStatus]}`} aria-hidden="true" />
              {tr.status[apiStatus]}
            </span>
            {/* المسجّل يغيّر اللغة من التفضيلات؛ الزائر ليس له تفضيلات فيبقى الزر له */}
            {accountLoaded && !user && (
              <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} aria-label={tr.toggleLabel} className={outlineButton}>
                {tr.toggle}
              </button>
            )}
            {!accountLoaded ? null : user ? (
              <AccountMenu
                account={user}
                copy={ac}
                onManage={() => setAccountTab('profile')}
                onPreferences={() => setAccountTab('preferences')}
                onSignOut={signOut}
              />
            ) : (
              <>
                <button onClick={() => openAuth('signin')} className={`${outlineButton} hidden sm:block`}>
                  {tr.auth.login}
                </button>
                <button onClick={() => openAuth('signup')} className={accentButton}>
                  {tr.auth.signupButton}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* الواجهة الرئيسية: العنوان وصندوق المحرر واللغات */}
        <section
          id="top"
          className="relative flex min-h-svh flex-col items-center justify-center px-4 pb-20 pt-28"
          style={{ backgroundImage: 'radial-gradient(ellipse 45% 35% at 50% 55%, color-mix(in oklab, var(--accent) 12%, transparent), transparent)' }}
        >
          <div ref={heroRef} className="flex w-full flex-col items-center gap-5">
            <div className="text-center">
              <SplitText
                text={tr.title}
                tag="h1"
                splitType="words"
                className={`text-5xl md:text-[64px] ${lang === 'en' ? 'leading-none tracking-[-0.06em]' : 'leading-[1.4]'}`}
                trigger="load"
              />
              <p className="mt-3 text-[15px] text-ink-2">{tr.subtitle}</p>
            </div>

            <div className={`grid w-full gap-4 transition-[max-width] duration-500 ${panelOpen ? 'max-w-6xl lg:grid-cols-2' : 'max-w-[740px]'}`}>
              {/* صندوق المحرر بتصميم صندوق الإدخال */}
              <div className="flex flex-col overflow-hidden rounded-2xl border border-accent-soft bg-surface-2 shadow-sm">
                {/* شريط أوامر الملفات فوق التبويبات؛ LTR مثل التبويبات والمحرر حتى يبقى على اليسار وبالترتيب نفسه في العربية */}
                <div dir="ltr" className="flex flex-wrap items-center gap-1 px-2 pt-2">
                  <input
                    ref={importRef}
                    type="file"
                    multiple
                    accept={IMPORT_ACCEPT}
                    onChange={(e) => {
                      importFiles(e.target.files)
                      // يسمح باستيراد الملف نفسه مرة أخرى
                      e.target.value = ''
                    }}
                    hidden
                  />
                  <button onClick={() => needsAccount() || newFile()} className={labelButton}>
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M12 12v6M9 15h6" />
                    </svg>
                    {tr.files.new}
                    {!user && <LockIcon />}
                  </button>
                  <button onClick={() => needsAccount() || importRef.current?.click()} className={labelButton}>
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
                    </svg>
                    {tr.files.import}
                    {!user && <LockIcon />}
                  </button>
                  <button onClick={() => needsAccount() || exportFile()} disabled={!code} className={labelButton}>
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M12 3v12M7 10l5 5 5-5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
                    </svg>
                    {tr.files.export}
                    {!user && <LockIcon />}
                  </button>
                  <button onClick={() => setRenamingId(active.id)} className={labelButton}>
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />
                    </svg>
                    {tr.files.renameAction}
                  </button>
                  <button onClick={() => setRecentOpen(true)} className={labelButton}>
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
                    </svg>
                    {wc.recent}
                    {history.length > 0 && <span className="tabular-nums text-ink-2/70">{history.length}</span>}
                  </button>
                </div>

                {/* تبويبات ملفات المشروع: تبديل، إعادة تسمية (نقر مزدوج أو F2) وإغلاق */}
                {/* pb يحجز مساحة لشريط التمرير الأفقي تحت التبويبات بدل أن يغطيها */}
                <div
                  dir="ltr"
                  role="tablist"
                  aria-label={tr.files.label}
                  className="tab-scrollbar mx-2 mt-1 flex items-center gap-1 overflow-x-auto scroll-smooth pb-3"
                >
                  {files.map((f) => (
                    <div
                      key={f.id}
                      className={`flex shrink-0 items-center rounded-lg font-mono text-[13px] transition-colors ${
                        f.id === active.id ? 'bg-page text-ink' : 'text-ink-2 hover:bg-surface hover:text-ink'
                      }`}
                    >
                      {renamingId === f.id ? (
                        <input
                          autoFocus
                          defaultValue={f.name}
                          aria-label={tr.files.rename}
                          onFocus={(e) => e.target.select()}
                          onBlur={(e) => renameFile(f, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') e.currentTarget.value = f.name
                            if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
                          }}
                          className="w-40 bg-transparent px-4 py-2 outline-none"
                        />
                      ) : (
                        <button
                          role="tab"
                          aria-selected={f.id === active.id}
                          onClick={() => setActiveId(f.id)}
                          onDoubleClick={() => setRenamingId(f.id)}
                          onKeyDown={(e) => e.key === 'F2' && setRenamingId(f.id)}
                          title={tr.files.renameHint}
                          className="px-4 py-2"
                        >
                          {f.name}
                        </button>
                      )}
                      {files.length > 1 && (
                        <button
                          onClick={() => closeFile(f)}
                          aria-label={`${tr.files.close} ${f.name}`}
                          title={tr.files.close}
                          className="-ms-2 me-2 grid size-6 shrink-0 place-items-center rounded text-xs text-ink-2 hover:bg-line hover:text-ink"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* محرر Monaco يبقى LTR دائماً، ويستقبل عجلة الفأرة بدل التمرير السلس */}
                {/* الحشوة بلون خلفية vs-dark تجعل الزوايا المستديرة تقص الحشوة لا أشرطة التمرير */}
                <div
                  dir="ltr"
                  data-lenis-prevent
                  className={`mx-2 overflow-hidden rounded-xl bg-[#1e1e1e] p-1.5 ${panelOpen ? 'h-[50vh]' : 'h-[30vh]'}`}
                >
                  {/* path يعطي كل ملف نموذجاً مستقلاً في Monaco فلا يختلط سجل التراجع بين الملفات */}
                  <Editor
                    height="100%"
                    path={active.id}
                    language={language}
                    onMount={(_, monaco) => {
                      monacoRef.current = monaco
                      applyTabSize()
                    }}
                    theme="vs-dark"
                    value={code}
                    onChange={(value) => setCode(value || '')}
                    options={{
                      fontSize: editorSettings.fontSize,
                      tabSize: editorSettings.tabSize,
                      insertSpaces: true,
                      detectIndentation: false,
                      wordWrap: editorSettings.wordWrap ? 'on' : 'off',
                      lineNumbers: editorSettings.lineNumbers ? 'on' : 'off',
                      automaticLayout: true,
                      minimap: { enabled: editorSettings.minimap },
                      scrollBeyondLastLine: false,
                      padding: { top: 12, bottom: 24 },
                      scrollbar: {
                        vertical: 'visible',
                        horizontal: 'visible',
                        verticalScrollbarSize: 10,
                        horizontalScrollbarSize: 10,
                        useShadows: false,
                        verticalHasArrows: false,
                        horizontalHasArrows: false,
                      },
                    }}
                  />
                </div>

                <div className="mt-2 flex items-center gap-1 border-t border-line p-2">
                  {/* تبديل اللغة يحمّل مثالها النظيف كعرض تجريبي، ويسأل أولاً إن كان في الملف كود كتبه المستخدم.
                      dir="ltr" حتى لا تنقلب C# و C++ إلى #C و ++C في الصفحة العربية */}
                  <select
                    dir="ltr"
                    value={language}
                    onChange={(e) => {
                      // القائمة مربوطة بلغة الملف، فرفض الاختيار يُبقيها على اللغة الحالية تلقائياً
                      if (lockedLanguage(e.target.value) && needsAccount()) return
                      const untouched = !code.trim() || current.examples.includes(code)
                      selectLanguage(e.target.value, untouched || window.confirm(tr.replaceCode) ? CLEAN_EXAMPLE : undefined)
                    }}
                    aria-label={tr.language}
                    className="rounded-lg bg-transparent px-2 py-1.5 text-sm text-ink hover:bg-surface"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.id} value={l.id}>
                        {lockedLanguage(l.id) ? `${l.label} 🔒` : l.label}
                      </option>
                    ))}
                  </select>
                  <span className="hidden px-2 text-xs text-ink-2 sm:inline">
                    {code.split('\n').length} {tr.lines} · {code.length} {tr.chars}
                  </span>
                  <div className="ms-auto flex items-center gap-1">
                    <button onClick={() => copy(code, 'code')} disabled={!code} aria-label={tr.copyCode} title={tr.copyCode} className={iconButton}>
                      {copied === 'code' ? (
                        '✓'
                      ) : (
                        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <rect x="9" y="9" width="12" height="12" rx="2" />
                          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                        </svg>
                      )}
                    </button>
                    <button onClick={() => setCode('')} disabled={!code} aria-label={tr.clear} title={tr.clear} className={iconButton}>
                      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                      </svg>
                    </button>
                    <button
                      onClick={analyzeCode}
                      disabled={loading || !hasCode}
                      aria-label={loading ? tr.analyzing : tr.analyze}
                      title={tr.analyze}
                      className="ms-1 grid size-9 place-items-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                    >
                      {loading ? (
                        <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />
                      ) : (
                        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* لوحة مراجعة الذكاء الاصطناعي */}
              {panelOpen && (
                <div
                  ref={resultRef}
                  className="flex h-[60vh] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm lg:h-0 lg:min-h-full"
                >
                  <div className="flex shrink-0 items-center border-b border-line">
                    <div role="tablist" className="flex min-w-0 flex-1 overflow-x-auto">
                      {review &&
                        (Object.keys(tr.tabs) as Tab[]).map((key) => (
                          <button
                            key={key}
                            role="tab"
                            aria-selected={tab === key}
                            onClick={() => setTab(key)}
                            className={`shrink-0 border-b-2 px-4 py-3 text-xs font-medium transition-colors ${
                              tab === key ? 'border-accent text-ink' : 'border-transparent text-ink-2 hover:text-ink'
                            }`}
                          >
                            {tr.tabs[key]}
                          </button>
                        ))}
                    </div>
                    <button onClick={closePanel} disabled={loading} className="shrink-0 px-4 py-3 text-xs font-medium text-ink-2 hover:text-ink disabled:opacity-40">
                      {tr.newReview}
                    </button>
                  </div>

                  <div aria-live="polite" data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto p-4 leading-relaxed text-ink">
                    {loading && <p className="animate-pulse text-ink-2">{tr.analyzing}</p>}

                    {error && (
                      <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-300">
                        {tr.errors[error.key]} {error.detail && <span dir="ltr">{error.detail}</span>}
                      </p>
                    )}

                    {review && tab === 'bugs' && (
                      <div role="tabpanel" className="space-y-4">
                        {review[lang].bugs.length ? (
                          <ul className="list-disc space-y-1 whitespace-pre-wrap ps-5">
                            {review[lang].bugs.map((bug, i) => (
                              <li key={i}>{bug}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-ink-2">{tr.noBugs}</p>
                        )}
                        {review[lang].rootCause && (
                          <div className="rounded-lg border border-line bg-page p-4">
                            <h3 className="mb-1 text-sm font-semibold text-accent">{tr.rootCause}</h3>
                            <p className="whitespace-pre-wrap">{review[lang].rootCause}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {review && tab === 'fix' && (
                      <div role="tabpanel" className="space-y-4">
                        {review[lang].fixes.length ? (
                          <ul className="list-disc space-y-1 whitespace-pre-wrap ps-5">
                            {review[lang].fixes.map((fix, i) => (
                              <li key={i}>{fix}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-ink-2">{tr.noFix}</p>
                        )}
                        {review.renamedFiles.map((r, i) => (
                          <p key={i} dir="ltr" className="text-start font-mono text-sm text-accent">
                            {r.from} → {r.to}
                          </p>
                        ))}
                        {review.fixedFiles.map((f, i) => (
                          <div key={i}>
                            <h3 dir="ltr" className="mb-1 text-start font-mono text-sm text-accent">{f.name}</h3>
                            <pre dir="ltr" className="overflow-x-auto rounded-lg border border-line bg-page p-4 text-left font-mono text-sm">
                              <code>{f.content}</code>
                            </pre>
                          </div>
                        ))}
                        {review.suggestedFiles.length > 0 && (
                          <>
                            <h3 className="border-t border-line pt-4 text-sm font-semibold">{tr.suggestedFiles}</h3>
                            {review.suggestedFiles.map((f, i) => (
                              <div key={i}>
                                <h4 dir="ltr" className="mb-1 text-start font-mono text-sm text-accent">+ {f.name}</h4>
                                <pre dir="ltr" className="overflow-x-auto rounded-lg border border-line bg-page p-4 text-left font-mono text-sm">
                                  <code>{f.content}</code>
                                </pre>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}

                    {review && tab === 'optimize' && (
                      <div role="tabpanel">
                        {review[lang].optimizations.length ? (
                          <ul className="list-disc space-y-1 whitespace-pre-wrap ps-5">
                            {review[lang].optimizations.map((tip, i) => (
                              <li key={i}>{tip}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-ink-2">{tr.noOptimizations}</p>
                        )}
                      </div>
                    )}
                  </div>

                  {review && (
                    <div className="flex shrink-0 flex-wrap gap-2 border-t border-line p-2">
                      <button
                        onClick={() => needsAccount() || applyFix()}
                        disabled={!fixable.length && !renames.length}
                        className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                      >
                        {tr.applyFix}
                        {!user && <LockIcon />}
                      </button>
                      {review.suggestedFiles.length > 0 && (
                        <button
                          onClick={() => needsAccount() || createSuggestedFiles()}
                          disabled={!newClassFiles.length}
                          className={`${chip} flex items-center gap-1.5 disabled:opacity-40`}
                        >
                          {tr.createFiles} ({newClassFiles.length})
                          {!user && <LockIcon />}
                        </button>
                      )}
                      <button onClick={() => copy(explanationText, 'explanation')} className={chip}>
                        {copied === 'explanation' ? tr.copied : tr.copyExplanation}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* تنبيه التجربة المجانية للزائر */}
            {!user && (
              <button onClick={() => openAuth('signup')} className="text-xs text-ink-2 underline-offset-4 hover:text-accent hover:underline">
                {freeLeft > 0 ? tr.freeLeft : tr.freeUsed}
              </button>
            )}

            {/* أمثلة اللغة المختارة — تظهر في واجهة البداية فقط، واللغة تُختار من قائمة المحرر */}
            {!panelOpen && (
              <div className="flex flex-col items-center gap-3">
                <span className="text-[13px] text-ink-2">
                  {tr.tryExample} · {current.label}
                </span>
                <div className="flex flex-wrap justify-center gap-2">
                  {current.examples.map((example, i) => (
                    <button key={i} onClick={() => setCode(example)} className={chip}>
                      {tr.exampleNames[i]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => lenis?.scrollTo('#meet', { offset: -80 })}
            aria-label={tr.scrollDown}
            className="mt-10 grid size-8 place-items-center rounded-full border border-ink-2 text-ink-2 transition-colors hover:border-ink hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 5v14M6 13l6 6 6-6" />
            </svg>
          </button>
        </section>

        <LandingSections lang={lang} exampleNames={tr.exampleNames} onSignup={() => openAuth('signup')} />
      </main>

      {/* نافذة تسجيل الدخول وإنشاء الحساب — تفتح من الهيدر أو عند انتهاء التجربة المجانية */}
      <dialog
        ref={authRef}
        onClose={() => {
          setAuthAlert(null)
          auth.endRecovery()
        }}
        aria-labelledby="auth-title"
        data-lenis-prevent
        className="m-auto w-[min(26rem,calc(100%-2rem))] rounded-2xl border border-line bg-surface p-6 text-ink shadow-2xl backdrop:bg-black/60 backdrop:backdrop-blur-sm"
      >
        {(!user || authMode === 'newPassword') && (
          <form onSubmit={submitAuth} className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <h2 id="auth-title" className="text-xl font-semibold">
                {{ signin: tr.auth.signinTitle, signup: tr.auth.signupTitle, reset: tr.auth.resetTitle, newPassword: tr.auth.newPasswordTitle }[authMode]}
              </h2>
              <button type="button" onClick={closeAuth} aria-label={tr.auth.close} className={iconButton}>
                ✕
              </button>
            </div>
            {authNotice && (
              <p className="rounded-lg border border-accent/40 bg-accent-soft/50 p-3 text-sm">
                {authNotice === 'limit' ? tr.auth.limitNotice : tr.auth.featureNotice}
              </p>
            )}
            {authMode === 'signup' && (
              <label className="block text-sm">
                {tr.auth.name}
                <input name="name" required autoComplete="name" className={input} />
              </label>
            )}
            {authMode !== 'newPassword' && (
              <label className="block text-sm">
                {tr.auth.email}
                <input name="email" type="email" required autoComplete="email" dir="ltr" className={input} />
              </label>
            )}
            {authMode !== 'reset' && (
              <label className="block text-sm">
                {tr.auth.password}
                <input
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                  dir="ltr"
                  className={input}
                />
              </label>
            )}
            {authMode === 'signin' && (
              <button type="button" onClick={() => switchAuth('reset')} className="text-sm text-ink-2 hover:text-accent hover:underline">
                {tr.auth.forgot}
              </button>
            )}
            {authAlert && (
              <p role={authAlert.error ? 'alert' : 'status'} className={`text-sm ${authAlert.error ? 'text-red-400' : 'text-ink-2'}`}>
                {authAlert.text}
              </p>
            )}
            <button type="submit" disabled={authBusy} aria-busy={authBusy} className={`${accentButton} h-10 w-full`}>
              {{ signin: tr.auth.signin, signup: tr.auth.signup, reset: tr.auth.sendReset, newPassword: tr.auth.savePassword }[authMode]}
            </button>
            {authMode === 'reset' ? (
              <p className="text-center text-sm">
                <button type="button" onClick={() => switchAuth('signin')} className="font-semibold text-accent hover:underline">
                  {tr.auth.backToSignin}
                </button>
              </p>
            ) : (
              authMode !== 'newPassword' && (
                <p className="text-center text-sm text-ink-2">
                  {authMode === 'signin' ? tr.auth.noAccount : tr.auth.haveAccount}{' '}
                  <button
                    type="button"
                    onClick={() => switchAuth(authMode === 'signin' ? 'signup' : 'signin')}
                    className="font-semibold text-accent hover:underline"
                  >
                    {authMode === 'signin' ? tr.auth.toSignup : tr.auth.toSignin}
                  </button>
                </p>
              )
            )}
          </form>
        )}
      </dialog>

      {user && (
        <AccountDialog
          tab={accountTab}
          onTab={setAccountTab}
          account={user}
          copy={ac}
          lang={lang}
          onLang={changeLang}
          onSave={save}
          onDelete={deleteAccount}
          notify={notify}
          editor={editorSettings}
          onEditor={saveEditor}
        />
      )}
      <RecentDialog
        open={recentOpen}
        onClose={() => setRecentOpen(false)}
        entries={history}
        lang={lang}
        copy={wc}
        onOpen={openRecent}
        onRemove={removeRecent}
        onClear={clearRecent}
      />
      <Toast message={toast} onDone={clearToast} />
    </div>
  )
}

export default App
