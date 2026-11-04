import { useCallback, useEffect, useRef, useState, type SubmitEvent } from 'react'
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react'
import { useLenis } from 'lenis/react'
import { GitHubIcon, GoogleIcon, LockIcon } from '@/components/Icons'
import LandingSections from '@/components/LandingSections'
import SplitText from '@/components/SplitText'
import { gsap, ScrollTrigger, useGSAP } from '@/lib/gsap'
import { LANGUAGES } from '@/lib/languages'
import { accentButton, iconButton, input, labelButton, outlineButton } from '@/lib/ui'
import { KEYS } from '@/services/storage'
import { useStored } from '@/services/useStored'
import { AIGenerator } from '@/workspace/AIGenerator'
import { workspaceCopy } from '@/workspace/copy'
import { DEFAULT_EDITOR_SETTINGS, parseEditorSettings, type EditorSettings } from '@/workspace/editorSettings'
import { ShortcutsDialog } from '@/workspace/ShortcutsDialog'
import { SplitLayout } from '@/workspace/SplitLayout'
import { OutputPanel } from '@/workspace/OutputPanel'
import { ACCEPTS_INPUT, BROWSER_RUN, prepareInput, readsInput, SERVER_RUN } from '@/workspace/run'
import { VersionsDialog } from '@/workspace/VersionsDialog'
import { localDb, type Snapshot } from '@/services/localDb'
import { AccountDialog, type AccountTab } from '@/account/AccountDialog'
import { AccountMenu } from '@/account/AccountMenu'
import { accountCopy } from '@/account/copy'
import { Toast, type ToastMessage } from '@/account/Toast'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useConfirm } from '@/lib/useConfirm'
import { useAccount } from '@/account/useAccount'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useFiles } from '@/workspace/useFiles'
import { useProjects } from '@/workspace/useProjects'
import { useAuth } from '@/account/useAuth'

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

// uuid لأن معرّف الملف هو مفتاحه في جدول files
const newId = () => crypto.randomUUID()

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
// أول ما يراه الزائر: خطأ منطقي يبدو سليماً ولا يلتقطه تلوين المحرر، فيُظهر قيمة الفحص بالذكاء الاصطناعي
const LOGIC_BUG_EXAMPLE = 1

const FIRST_FILE: ProjectFile = {
  // معرّف جديد في كل جلسة: السجل يحدّث لقطات الملفات بمعرّفها، ومعرّف ثابت كان سيكتب فوق ملف الجلسة السابقة
  id: newId(),
  name: `main.${LANGUAGES[0].ext}`,
  language: LANGUAGES[0].id,
  content: LANGUAGES[0].examples[LOGIC_BUG_EXAMPLE],
}

// رقم متزايد لكل رسالة، فتظهر الرسالة نفسها من جديد إذا تكررت
let toastCount = 0

// نسخة السجل تُحفظ بعد توقف الكتابة بهذه المدة، لا مع كل حرف
const HISTORY_DELAY_MS = 1500
// الملفات تُرفع لحساب المسجّل بعد توقف الكتابة بهذه المدة
const SYNC_DELAY_MS = 1000

const parseLang = (v: unknown): Lang | null => (v === 'ar' || v === 'en' ? v : null)
// لغة الزيارة الأولى من لغة الجهاز (المتصفح): عربي لأي لهجة عربية، وإلا إنجليزي. اختيار المستخدم المحفوظ يغلبها
const DEVICE_LANG: Lang = (navigator.languages?.[0] ?? navigator.language ?? '').toLowerCase().startsWith('ar') ? 'ar' : 'en'
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
    tryExample: 'جرّب مثالاً',
    exampleNames: ['خطأ نحوي', 'خطأ منطقي', 'كود نظيف'],
    copyCode: 'نسخ الكود',
    clear: 'مسح المحرر',
    copied: 'تم النسخ ✓',
    analyze: 'فحص الكود بالذكاء الاصطناعي',
    analyzing: 'جاري الفحص واستخراج الأخطاء...',
    stopAnalyze: 'إيقاف الفحص',
    reviewStopped: 'أُوقف الفحص.',
    closeReview: 'إغلاق المراجعة',
    signinToAnalyze: 'سجّل الدخول أو أنشئ حساباً مجانياً لفحص الكود بالذكاء الاصطناعي',
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
      import: 'استيراد',
      export: 'حفظ',
      importSkipped: 'لم تُستورد هذه الملفات لأنها ليست نصية أو أكبر من 1 ميغابايت:',
    },
    applyFix: 'تطبيق إصلاح الذكاء الاصطناعي',
    copyExplanation: 'نسخ الشرح',
    lines: 'سطر',
    chars: 'حرف',
    status: { checking: 'جاري الفحص', error: 'خطأ في الاتصال', online: 'متصل', ready: 'جاهز' },
    auth: {
      login: 'تسجيل الدخول',
      signupButton: 'إنشاء حساب',
      signinTitle: 'تسجيل الدخول',
      signupTitle: 'إنشاء حساب',
      featureNotice: 'هذه الميزة متاحة بحساب مجاني. أنشئ حساباً أو سجّل الدخول لاستخدامها.',
      sessionNotice: 'انتهت جلستك (ربما سجّلت الخروج من جهاز آخر). سجّل الدخول من جديد ثم أعد الفحص.',
      name: 'الاسم',
      email: 'البريد الإلكتروني',
      emailOrUsername: 'البريد الإلكتروني أو اسم المستخدم',
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
      // ⁦…⁩ يعزل اسم المزوّد اللاتيني داخل الجملة العربية
      continueWith: (provider: string) => `المتابعة عبر ⁦${provider}⁩`,
      or: 'أو',
    },
    errors: {
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
    tryExample: 'Try an example',
    exampleNames: ['Syntax Error', 'Logic Bug', 'Clean Code'],
    copyCode: 'Copy Code',
    clear: 'Clear Editor',
    copied: 'Copied ✓',
    analyze: 'Analyze code with AI',
    analyzing: 'Analyzing and extracting errors...',
    stopAnalyze: 'Stop review',
    reviewStopped: 'Review stopped.',
    closeReview: 'Close review',
    signinToAnalyze: 'Log in or create a free account to review code with AI',
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
      import: 'Import',
      export: 'Save',
      importSkipped: 'These files were not imported because they are not text or are over 1 MB:',
    },
    applyFix: 'Apply AI Fix',
    copyExplanation: 'Copy Explanation',
    lines: 'lines',
    chars: 'chars',
    status: { checking: 'Analyzing', error: 'Connection error', online: 'Online', ready: 'Ready' },
    auth: {
      login: 'Log in',
      signupButton: 'Sign up',
      signinTitle: 'Log in',
      signupTitle: 'Create account',
      featureNotice: 'This feature comes with a free account. Create one or log in to use it.',
      sessionNotice: 'Your session has ended (maybe you signed out on another device). Log in again, then run the review.',
      name: 'Name',
      email: 'Email',
      emailOrUsername: 'Email or username',
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
      continueWith: (provider: string) => `Continue with ${provider}`,
      or: 'or',
    },
    errors: {
      request: 'Could not get a result.',
      badResponse: 'The AI returned a response that could not be read. Please try again.',
      network: 'The AI request timed out or the connection dropped. Please try again.',
    },
  },
}

type ErrorKey = keyof (typeof t)['en']['errors']

const STATUS_STYLES = {
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

const chip = 'h-8 rounded-md bg-surface-2 px-2.5 text-[13px] text-ink transition-colors hover:bg-line'

function App() {
  const heroRef = useRef<HTMLDivElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const authRef = useRef<HTMLDialogElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const lenis = useLenis()

  // حالات الواجهة والمحرر والذكاء الاصطناعي
  const [lang, setLang] = useStored<Lang>(KEYS.lang, DEVICE_LANG, parseLang)
  const [editorSettings, setEditorSettings] = useStored(KEYS.editor, DEFAULT_EDITOR_SETTINGS, parseEditorSettings)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  // لقطة الكود وقت الضغط على "المخرجات"؛ run يتغير مع كل تشغيل فيُعاد تحميل الإطار وتُمسح المخرجات السابقة
  const [output, setOutput] = useState<{ fileId: string; name: string; language: string; code: string; stdin: string; waiting: boolean; fresh: boolean; run: number } | null>(null)
  // مدخلات البرنامج لكل ملف؛ ref لا state حتى لا تعيد الكتابة فيها رسم المحرر
  const programInput = useRef<Record<string, string>>({})
  const programInputBox = useRef<HTMLTextAreaElement>(null)
  // نسخ الملف النشط المحفوظة على هذا الجهاز؛ النافذة مفتوحة ما دامت ليست null
  const [versions, setVersions] = useState<Snapshot[] | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [files, setFiles] = useState<ProjectFile[]>([FIRST_FILE])
  const [activeId, setActiveId] = useState<string>(FIRST_FILE.id)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [review, setReview] = useState<Review | null>(null)
  const [error, setError] = useState<{ key: ErrorKey; detail?: string } | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [lastModel, setLastModel] = useState<string>('')
  const [tab, setTab] = useState<Tab>('bugs')
  const [copied, setCopied] = useState<'code' | 'explanation' | null>(null)

  // حالات الحساب؛ الفحص بالذكاء الاصطناعي للمسجّلين فقط لأن دالة الخادم ترفض غيرهم
  const auth = useAuth()
  const { account: user, loaded: accountLoaded, settings: accountSettings, save, saveSettings, remove } = useAccount()
  const { confirm, pending: pendingConfirm, settle: settleConfirm } = useConfirm()
  const [accountTab, setAccountTab] = useState<AccountTab | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode>('signin')
  // سبب فتح نافذة الدخول (ميزة للمسجّلين)، ويظهر كتنبيه فوق النموذج
  const [authNotice, setAuthNotice] = useState<'feature' | 'session' | null>(null)
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
  // HTML و JavaScript تعمل في المتصفح؛ بايثون وجافا وغيرهما على الخادم، فتحتاج حساباً مثل الفحص
  const runnable = BROWSER_RUN.includes(language) || SERVER_RUN.includes(language)
  // fresh: يتجاهل النتيجة المحفوظة لهذا الكود ويشغّله فعلاً
  // force: يشغّل بمربع مدخلات فارغ، فكشف قراءة المدخلات من نص الكود قد يخطئ
  const runOutput = (fresh = false, force = false) => {
    if (SERVER_RUN.includes(language) && needsAccount()) return
    const stdin = programInput.current[active.id] ?? ''
    const waiting = !force && !stdin.trim() && readsInput(language, code)
    if (waiting) programInputBox.current?.focus()
    setOutput({ fileId: active.id, name: active.name, language, code, stdin: prepareInput(language, code, stdin), waiting, fresh, run: (output?.run ?? 0) + 1 })
  }
  const outputOpen = output?.fileId === active.id && output.language === language
  const apiStatus = loading ? 'checking' : error ? 'error' : lastModel ? 'online' : 'ready'
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

  const openAuth = (mode: AuthMode, notice: 'feature' | 'session' | null = null) => {
    // المسجّل لا يحتاج نافذة الدخول؛ أزرار "أنشئ حساباً" تفتح له إدارة الحساب. 'session' تأتي بعد خروج لم يصل بعد لحالة user
    if (user && notice !== 'session') return setAccountTab('profile')
    setAuthMode(mode)
    setAuthNotice(notice)
    setAuthAlert(null)
    const dialog = authRef.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    gsap.fromTo(dialog, { scale: 0.95, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'power2.out' })
  }

  const closeAuth = () => authRef.current?.close()

  // الفحص بالذكاء الاصطناعي وحده يحتاج حساباً (دالة الخادم ترفض غيره)؛ يفتح للزائر نافذة إنشاء حساب مع السبب
  const needsAccount = () => {
    if (user) return false
    openAuth('signup', 'feature')
    return true
  }

  // 401: الرمز انتهى أو أُلغيت جلسته على الخادم. نجدده، وإن تعذّر التجديد فالجلسة انتهت فعلاً: خروج ثم دخول من جديد
  const renewSession = async () => {
    const { error } = await supabase.auth.refreshSession()
    if (!error) return true
    await auth.signOut()
    openAuth('signin', 'session')
    return false
  }

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

  // الدخول عبر Google أو GitHub: عند النجاح يغادر المتصفح للمزوّد، فلا يبقى إلا عرض الخطأ إن وُجد
  const signInWithProvider = async (provider: 'google' | 'github') => {
    setAuthBusy(true)
    setAuthAlert(null)
    const { error } = await auth.signInWithProvider(provider)
    if (!error) return
    setAuthBusy(false)
    setAuthAlert({ text: error.message, error: true })
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

  // آخر قيمة للغة ولدالة الحفظ، لقراءتهما عند تحميل الحساب دون إعادة الحفظ مع كل تبديل
  const langSync = useRef({ lang, saveSettings })
  useEffect(() => {
    langSync.current = { lang, saveSettings }
  })

  // عند تحميل حساب المسجّل: إعدادات المحرر المحفوظة فيه تُطبَّق، أما اللغة فتبقى كما يراها على الشاشة (لا تقلب الواجهة عند الدخول)
  // وتُحفظ في حسابه إن اختلفت، فيبقى الحساب على آخر لغة اختارها
  useEffect(() => {
    if (!accountSettings) return
    if (accountSettings.editor) setEditorSettings(accountSettings.editor)
    const { lang: shown, saveSettings: saveToAccount } = langSync.current
    if (accountSettings.lang !== shown) void saveToAccount({ lang: shown })
  }, [accountSettings, setEditorSettings])

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

  // سجل النسخ في IndexedDB: نسخة لكل دقيقة تعديل من الملف النشط، بعد توقف الكتابة
  useEffect(() => {
    if (!active.content.trim() || isExample(active.content)) return
    const file = { id: active.id, name: active.name, language: active.language, content: active.content }
    // shortcut: فشل حفظ النسخة (IndexedDB محظور) لا يُعرض؛ تظهر النافذة فارغة عندها
    const timer = setTimeout(() => localDb.addSnapshot(file).catch(console.error), HISTORY_DELAY_MS)
    return () => clearTimeout(timer)
  }, [active.id, active.name, active.language, active.content])

  const openVersions = () =>
    localDb.listSnapshots(active.id).then(setVersions, (e) => {
      console.error(e)
      setVersions([])
    })

  // يثبّت المحتوى الحالي نسخةً في السجل قبل أي فعل يستبدله (استعادة، مسح، مثال لغة)، فيمكن الرجوع إليه
  const keepVersion = (content = active.content) =>
    localDb.addSnapshot({ id: active.id, name: active.name, language: active.language, content }, true).catch(console.error)

  const clearEditor = async () => {
    if (!(await confirm({ ...wc.confirms.clearEditor(active.name), cancel: wc.cancel, danger: true }))) return
    await keepVersion()
    setCode('')
  }

  // بعد الحذف تُقرأ القائمة من جديد، فتعكس ما في التخزين فعلاً ولو فشل الحذف
  const deleteVersion = (snapshot: Snapshot) => localDb.deleteSnapshot(snapshot).catch(console.error).then(openVersions)
  const clearVersions = () => localDb.clearSnapshots(active.id).catch(console.error).then(openVersions)

  // المحتوى الحالي يُثبَّت نسخةً قبل الاستعادة فيمكن الرجوع إليه، ثم تنتقل النسخة المستعادة للأعلى؛
  // فيجدها الحفظ التلقائي بعد الاستعادة أحدث نسخة ولا يكررها
  const restoreVersion = async (snapshot: Snapshot) => {
    await keepVersion()
    await localDb.addSnapshot({ id: active.id, name: active.name, language: active.language, content: snapshot.content }, true).catch(console.error)
    setCode(snapshot.content)
    setVersions(null)
    notify(wc.toasts.versionRestored, 'success')
  }

  // عودة الاتصال تعيد المزامنة فوراً بدل انتظار التعديل التالي
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  // مسودات المسجّل التي لم تصل لحسابه (انقطاع الشبكة)؛ تُقرأ قبل ملفات الحساب لأنها أحدث منها
  const userId = auth.user?.id ?? null
  const [drafts, setDrafts] = useState<{ owner: string; files: ProjectFile[] | null } | null>(null)
  useEffect(() => {
    if (!userId) return
    let alive = true
    const done = (files: ProjectFile[] | null) => alive && setDrafts({ owner: userId, files })
    localDb.loadDrafts(userId).then(done, (e) => {
      console.error(e)
      done(null)
    })
    return () => {
      alive = false
    }
  }, [userId])

  // ملفات المسجّل في مشروعه على Supabase؛ التبويبات المفتوحة هي المشروع
  const { projects, failed: projectsFailed } = useProjects()
  // عند تحميل المشروع تحل ملفاته (أو مسوداته) محل التبويبات، ويُضاف إليها ما كتبه الزائر قبل تسجيل الدخول حتى لا يضيع.
  // التحميل ينتظر قراءة المسودات، حتى لا تبدأ مزامنة تحذف من الحساب ملفات لم تُدمج بعد
  const projectId = drafts?.owner === userId ? (projects?.[0]?.id ?? null) : null
  const { files: cloudFiles, failed: filesFailed, sync: syncFiles } = useFiles(projectId, (loaded) => {
    const restored = drafts?.files
    const cloudFiles = restored ?? loaded
    if (restored) notify(wc.toasts.draftsRestored, 'success')
    const taken = cloudFiles.map((f) => f.name)
    const guestWork = files
      .filter((f) => f.content.trim() && !isExample(f.content) && !cloudFiles.some((c) => c.id === f.id))
      .map((f) => {
        const name = uniqueName(f.name, taken)
        taken.push(name)
        return { ...f, name }
      })
    const merged = [...cloudFiles, ...guestWork]
    // مشروع جديد فارغ يأخذ التبويبات الحالية كما هي، فتُرفع في المزامنة التالية
    if (!merged.length) return
    setFiles(merged)
    setActiveId((guestWork[0] ?? merged[0]).id)
  })

  // البديل عند فشل التحميل: المحرر يبقى يعمل محلياً بلا مزامنة (حتى لا تُحذف ملفات لم تُحمَّل)، ورسالة واحدة تشرح ذلك
  const cloudFailed = projectsFailed || filesFailed
  useEffect(() => {
    if (cloudFailed) notify(wc.toasts.loadFailed, 'error')
  }, [cloudFailed, wc.toasts.loadFailed])

  // كل تعديل أو إضافة أو إغلاق يُرفع بعد توقف الكتابة؛ رسالة الفشل تظهر مرة حتى تنجح مزامنة
  const syncFailed = useRef(false)
  // هل في التبويبات ما لم يصل للحساب؛ رقم آخر تعديل حتى لا تمسح نتيجة مزامنة قديمة حالة تعديل أحدث
  const unsynced = useRef(false)
  const syncRun = useRef(0)
  useEffect(() => {
    unsynced.current = Boolean(cloudFiles && userId)
    if (!cloudFiles || !userId) return
    const run = ++syncRun.current
    const timer = setTimeout(async () => {
      const ok = await syncFiles(files)
      // عند الفشل تُحفظ التبويبات على الجهاز، فتعود عند فتح الموقع ولو أُغلق قبل عودة الاتصال.
      // shortcut: المسودة تحل محل ملفات الحساب كلها، فتعديل من جهاز آخر أثناء الانقطاع يُكتب فوقه؛ قارن الأوقات إن لزم
      void (ok ? localDb.clearDrafts(userId) : localDb.saveDrafts(userId, files)).catch(console.error)
      if (!ok && !syncFailed.current) notify(wc.toasts.syncFailed, 'error')
      syncFailed.current = !ok
      if (run === syncRun.current) unsynced.current = !ok
    }, SYNC_DELAY_MS)
    return () => clearTimeout(timer)
    // online: عودة الاتصال تعيد تشغيل المزامنة
  }, [files, cloudFiles, userId, online, syncFiles, wc.toasts.syncFailed])

  // إغلاق الصفحة قبل وصول التعديلات للحساب يطلب تأكيداً من المتصفح
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (unsynced.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  // الخروج يعيد المحرر لملف بداية بمعرّف جديد، حتى لا تُرفع ملفات حساب إلى حساب آخر يدخل بعده
  const signedIn = Boolean(auth.user)
  const wasSignedIn = useRef(signedIn)
  useEffect(() => {
    if (wasSignedIn.current && !signedIn) {
      const starter = { ...FIRST_FILE, id: newId() }
      setFiles([starter])
      setActiveId(starter.id)
      setReview(null)
      setError(null)
      // تُقرأ المسودات من جديد عند الدخول التالي، لا تلك المقروءة في هذه الجلسة
      setDrafts(null)
    }
    wasSignedIn.current = signedIn
  }, [signedIn])

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
    if (next.id !== language) closeForLanguageChange()
    const taken = files.filter((f) => f.id !== active.id).map((f) => f.name)
    updateFile(active.id, {
      language: next.id,
      name: uniqueName(withExt(active.name, next.ext), taken),
      ...(exampleIndex !== undefined && { content: next.examples[exampleIndex] }),
    })
  }

  // Monaco يعيد استخدام نموذج الملف بلغته القديمة إذا تغيرت لغة الملف وهو غير نشط، فنزامنها عند كل تبديل
  const monacoRef = useRef<Monaco | null>(null)
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
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
    if (file.id === active.id && nextLanguage !== file.language) closeForLanguageChange()
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

  // الإغلاق فوري بلا تأكيد، بطلب المستخدم
  const closeFile = (file: ProjectFile) => {
    if (files.length === 1) return
    const rest = files.filter((f) => f.id !== file.id)
    setFiles(rest)
    if (file.id === active.id) setActiveId(rest[Math.max(0, files.indexOf(file) - 1)].id)
  }

  const closePanel = () => {
    setReview(null)
    setError(null)
  }

  // المخرجات والفحص كانا للكود بلغته السابقة، فيُغلقان عند تغيير لغة الملف النشط؛ فحص جارٍ يُلغى بهدوء بلا رسالة
  const closeForLanguageChange = () => {
    setOutput(null)
    analyzeAbort.current?.abort()
    analyzeAbort.current = null
    setLoading(false)
    closePanel()
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

  // يرسل ملفات المشروع لدالة gemini على Supabase، وهي التي تحمل مفتاح Gemini وتجرّب النماذج بالترتيب
  // الفحص الجاري، ليمكن إيقافه من زر الفحص أو من لوحة المراجعة
  const analyzeAbort = useRef<AbortController | null>(null)

  // يلغي الطلب في المتصفح ويغلق لوحة الانتظار. shortcut: الخادم قد يكمل طلب Gemini الجاري (ويُحسب من الحصة)؛ لإيقافه هناك يلزم إلغاء من جهة الدالة
  const stopAnalyze = () => {
    analyzeAbort.current?.abort()
    analyzeAbort.current = null
    setLoading(false)
    notify(tr.reviewStopped, 'success')
  }

  const analyzeCode = async (): Promise<void> => {
    if (!hasCode || needsAccount()) return
    const controller = new AbortController()
    analyzeAbort.current = controller
    setReview(null)
    setLoading(true)
    setError(null)
    try {
      const body = {
        files: files.map((f) => ({ name: f.name, language: LANGUAGES.find((l) => l.id === f.language)?.label ?? f.language, content: f.content })),
      }
      const invoke = () => supabase.functions.invoke<{ text: string; model: string }>('gemini', { body, signal: controller.signal })
      let { data, error } = await invoke()
      // أُوقف الفحص أثناء الانتظار: لا رسالة خطأ ولا نتيجة
      if (controller.signal.aborted) return
      if (error instanceof FunctionsHttpError && error.context.status === 401) {
        if (!(await renewSession())) return
        ;({ data, error } = await invoke())
        if (controller.signal.aborted) return
      }
      if (error) {
        // ردّ HTTP من غير دالتنا (مثل 404 دالة غير منشورة) يُعرض برقمه ورسالته؛ بلا ردّ إطلاقاً يعني انقطاع الاتصال
        if (!(error instanceof FunctionsHttpError)) return setError({ key: 'network' })
        const reply = await error.context.json().catch(() => null)
        if (reply?.error in tr.errors) return setError({ key: reply.error as ErrorKey, detail: reply.detail })
        return setError({ key: 'request', detail: `(${error.context.status}) ${reply?.message ?? ''}` })
      }
      // الرد قادم من الذكاء الاصطناعي عبر الخادم، فيُتحقق من شكله هنا أيضاً
      const parsed = data && parseReview(data.text)
      if (!data || !parsed) return setError({ key: 'badResponse' })
      setReview(parsed)
      setLastModel(data.model)
      setTab('bugs')
    } finally {
      // فحص أوقفه المستخدم أو حل محله فحص أحدث لا يغيّر حالة الانتظار
      if (analyzeAbort.current === controller) {
        analyzeAbort.current = null
        setLoading(false)
      }
    }
  }

  // اختصارات لوحة المفاتيح. مرحلة الالتقاط تسبق Monaco، فلا ينفّذ أمره الافتراضي (Ctrl+Enter عنده يضيف سطراً)
  const shortcutActions = useRef({ analyze: loading ? stopAnalyze : analyzeCode, save: () => code && exportFile() })
  useEffect(() => {
    shortcutActions.current = { analyze: loading ? stopAnalyze : analyzeCode, save: () => code && exportFile() }
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // داخل نافذة مفتوحة (الدخول، الحساب...) تبقى المفاتيح لها
      if (!(e.ctrlKey || e.metaKey) || e.altKey || document.querySelector('dialog[open]')) return
      const key = e.key.toLowerCase()
      const action =
        key === 'enter' && !e.shiftKey ? shortcutActions.current.analyze
        : key === 's' && !e.shiftKey ? shortcutActions.current.save
        : key === 'f' && e.shiftKey ? () => editorRef.current?.getAction('editor.action.formatDocument')?.run()
        : null
      if (!action) return
      e.preventDefault()
      e.stopPropagation()
      action()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

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
            {!accountLoaded ? (
              <span aria-hidden="true" className="h-9 w-28 animate-pulse rounded-lg bg-surface" />
            ) : user ? (
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

            <SplitLayout resizeLabel={wc.resizePanels} className={`transition-[max-width] duration-500 ${panelOpen ? 'max-w-6xl' : 'max-w-[740px]'}`}>
              {/* صندوق المحرر بتصميم صندوق الإدخال */}
              <div className="relative flex flex-col overflow-hidden rounded-2xl border border-accent-soft bg-surface-2 shadow-sm">
                {/* شريط أوامر الملفات فوق التبويبات؛ LTR مثل التبويبات والمحرر حتى يبقى على اليسار وبالترتيب نفسه في العربية */}
                <div dir="ltr" className="flex items-center gap-1 px-2 pt-2">
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
                  <button onClick={newFile} aria-label={tr.files.new} title={tr.files.new} className={labelButton}>
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M12 12v6M9 15h6" />
                    </svg>
                    <span className="hidden sm:inline">{tr.files.new}</span>
                  </button>
                  <button onClick={() => importRef.current?.click()} aria-label={tr.files.import} title={tr.files.import} className={labelButton}>
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
                    </svg>
                    <span className="hidden sm:inline">{tr.files.import}</span>
                  </button>
                  <button onClick={exportFile} disabled={!code} aria-label={tr.files.export} title={tr.files.export} className={labelButton}>
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M12 3v12M7 10l5 5 5-5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
                    </svg>
                    <span className="hidden sm:inline">{tr.files.export}</span>
                  </button>
                  <button onClick={() => setRenamingId(active.id)} aria-label={tr.files.renameAction} title={tr.files.renameAction} className={labelButton}>
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />
                    </svg>
                    <span className="hidden sm:inline">{tr.files.renameAction}</span>
                  </button>
                  <button onClick={openVersions} aria-label={wc.versions} title={wc.versions} className={labelButton}>
                    <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
                    </svg>
                    <span className="hidden sm:inline">{wc.versions}</span>
                  </button>
                  <AIGenerator
                    editorRef={editorRef}
                    language={current.label}
                    needsAccount={needsAccount}
                    renewSession={renewSession}
                    keepVersion={keepVersion}
                    copy={wc}
                  />
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
                    onMount={(editor, monaco) => {
                      editorRef.current = editor
                      monacoRef.current = monaco
                      applyTabSize()
                    }}
                    theme="vs-dark"
                    loading={
                      <div aria-hidden="true" className="w-full space-y-2.5 self-start p-4">
                        {[55, 40, 70, 35, 60, 25].map((w, i) => (
                          <div key={i} className="h-3 animate-pulse rounded bg-white/10" style={{ width: `${w}%` }} />
                        ))}
                      </div>
                    }
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

                {/* المخرجات للملف ولغته؛ تغيير اللغة بإعادة التسمية (main.js ← main.py) يخفيها أيضاً */}
                {ACCEPTS_INPUT.includes(language) && (outputOpen || readsInput(language, code)) && (
                  <div className="mx-2 mt-2 flex items-end gap-2 rounded-xl border border-line bg-page p-2">
                    <label className="min-w-0 flex-1 text-xs text-ink-2">
                      {wc.programInput}
                      <textarea
                        key={active.id}
                        ref={programInputBox}
                        dir="auto"
                        rows={4}
                        data-lenis-prevent
                        // يُقرأ مرة عند التركيب، و key يعيد التركيب عند تبديل الملف، فلا قيمة قديمة
                        // oxlint-disable-next-line react/refs
                        defaultValue={programInput.current[active.id] ?? ''}
                        maxLength={100_000}
                        placeholder={wc.programInputHint}
                        onChange={(e) => {
                          programInput.current[active.id] = e.target.value
                        }}
                        className={`${input} block max-h-40 resize-none field-sizing-content font-mono text-xs`}
                      />
                    </label>
                    <button type="button" onClick={() => runOutput(false, true)} disabled={!code.trim()} className={`${outlineButton} shrink-0`}>
                      {wc.runProgram}
                    </button>
                  </div>
                )}
                {outputOpen && (
                  <OutputPanel
                    key={output.run}
                    name={output.name}
                    language={output.language}
                    code={output.code}
                    stdin={output.stdin}
                    waiting={output.waiting}
                    fresh={output.fresh}
                    onRerun={() => runOutput(false, true)}
                    onRunFresh={() => runOutput(true, true)}
                    onClose={() => setOutput(null)}
                    copy={wc}
                  />
                )}

                <div className="mt-2 flex items-center gap-1 border-t border-line p-2">
                  {/* تبديل اللغة يحمّل مثالها النظيف كعرض تجريبي، إلا إن كان في الملف كود كتبه المستخدم فيبقى كما هو.
                      dir="ltr" حتى لا تنقلب C# و C++ إلى #C و ++C في الصفحة العربية */}
                  <select
                    dir="ltr"
                    value={language}
                    onChange={(e) => {
                      // بلا نافذة تأكيد بطلب المستخدم: كود كتبه يبقى وتتغير اللغة فقط، والمثال يُحمَّل للمحرر الفارغ أو الذي فيه مثال
                      const untouched = !code.trim() || current.examples.includes(code)
                      selectLanguage(e.target.value, untouched ? CLEAN_EXAMPLE : undefined)
                    }}
                    aria-label={tr.language}
                    className="rounded-lg bg-transparent px-2 py-1.5 text-sm text-ink hover:bg-surface"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                  <span className="hidden px-2 text-xs text-ink-2 sm:inline">
                    {code.split('\n').length} {tr.lines} · {code.length} {tr.chars}
                  </span>
                  <div className="ms-auto flex items-center gap-1">
                    {runnable && (
                      <button onClick={() => runOutput()} disabled={!code.trim()} title={wc.runOutput} className={labelButton}>
                        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        {wc.output}
                      </button>
                    )}
                    {/* الاختصارات للوحة مفاتيح: يُخفى الزر على شاشات اللمس (جوال وتابلت) ويظهر مع الفأرة */}
                    <button onClick={() => setShortcutsOpen(true)} aria-label={wc.shortcuts} title={wc.shortcuts} className={`${iconButton} hidden pointer-fine:grid`}>
                      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <rect x="2" y="6" width="20" height="12" rx="2" />
                        <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
                      </svg>
                    </button>
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
                    <button onClick={clearEditor} disabled={!code} aria-label={tr.clear} title={tr.clear} className={iconButton}>
                      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                      </svg>
                    </button>
                    <button
                      onClick={loading ? stopAnalyze : analyzeCode}
                      disabled={!loading && !hasCode}
                      aria-label={loading ? tr.stopAnalyze : user ? tr.analyze : tr.signinToAnalyze}
                      title={loading ? tr.stopAnalyze : user ? tr.analyze : tr.signinToAnalyze}
                      className="relative ms-1 grid size-9 place-items-center rounded-full bg-accent text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
                    >
                      {loading ? (
                        // أثناء الفحص يصير الزر زر إيقاف: مربع وسط حلقة دوّارة
                        <>
                          <span className="absolute inset-1 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
                          <svg viewBox="0 0 24 24" className="size-3" fill="currentColor" aria-hidden="true">
                            <rect x="5" y="5" width="14" height="14" rx="2" />
                          </svg>
                        </>
                      ) : !user ? (
                        <LockIcon className="size-4" />
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
                    {/* يغلق اللوحة ويمسح النتيجة؛ أثناء الفحص يحل محله زر "إيقاف الفحص" */}
                    {!loading && (
                      <button onClick={closePanel} aria-label={tr.closeReview} title={tr.closeReview} className={`${iconButton} me-2 shrink-0`}>
                        ✕
                      </button>
                    )}
                  </div>

                  <div aria-live="polite" data-lenis-prevent className="min-h-0 flex-1 overflow-y-auto p-4 leading-relaxed text-ink">
                    {loading && (
                      <div role="status" className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-ink-2">{tr.analyzing}</p>
                          <button type="button" onClick={stopAnalyze} className={`${outlineButton} flex items-center gap-1.5`}>
                            <svg viewBox="0 0 24 24" className="size-3" fill="currentColor" aria-hidden="true">
                              <rect x="5" y="5" width="14" height="14" rx="2" />
                            </svg>
                            {tr.stopAnalyze}
                          </button>
                        </div>
                        {[90, 75, 85, 60, 70].map((w, i) => (
                          <div key={i} aria-hidden="true" className="h-3 animate-pulse rounded bg-surface-2" style={{ width: `${w}%` }} />
                        ))}
                      </div>
                    )}

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
                        onClick={applyFix}
                        disabled={!fixable.length && !renames.length}
                        className="flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
                      >
                        {tr.applyFix}
                      </button>
                      {review.suggestedFiles.length > 0 && (
                        <button
                          onClick={createSuggestedFiles}
                          disabled={!newClassFiles.length}
                          className={`${chip} flex items-center gap-1.5 disabled:opacity-40`}
                        >
                          {tr.createFiles} ({newClassFiles.length})
                        </button>
                      )}
                      <button onClick={() => copy(explanationText, 'explanation')} className={chip}>
                        {copied === 'explanation' ? tr.copied : tr.copyExplanation}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </SplitLayout>

            {/* تنبيه الزائر: الفحص يحتاج حساباً */}
            {!user && (
              <button onClick={() => openAuth('signup')} className="text-xs text-ink-2 underline-offset-4 hover:text-accent hover:underline">
                {tr.signinToAnalyze}
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

        <LandingSections lang={lang} exampleNames={tr.exampleNames} onSignup={() => openAuth('signup')} onSignin={() => openAuth('signin')} showSignup={accountLoaded && !user} />
      </main>

      {/* نافذة تسجيل الدخول وإنشاء الحساب — تفتح من الهيدر أو عند محاولة الزائر استخدام ميزة للمسجّلين */}
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
                {authNotice === 'session' ? tr.auth.sessionNotice : tr.auth.featureNotice}
              </p>
            )}
            {(authMode === 'signin' || authMode === 'signup') && (
              <>
                <div className="grid gap-2">
                  {(['google', 'github'] as const).map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      onClick={() => signInWithProvider(provider)}
                      disabled={authBusy}
                      className={`${outlineButton} flex h-10 w-full items-center justify-center gap-2`}
                    >
                      {provider === 'google' ? <GoogleIcon /> : <GitHubIcon />}
                      {tr.auth.continueWith(provider === 'google' ? 'Google' : 'GitHub')}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-3 text-xs text-ink-2">
                  <span className="h-px flex-1 bg-line" />
                  {tr.auth.or}
                  <span className="h-px flex-1 bg-line" />
                </div>
              </>
            )}
            {authMode === 'signup' && (
              <label className="block text-sm">
                {tr.auth.name}
                <input name="name" required autoComplete="name" className={input} />
              </label>
            )}
            {authMode !== 'newPassword' && (
              <label className="block text-sm">
                {authMode === 'signin' ? tr.auth.emailOrUsername : tr.auth.email}
                {/* الدخول يقبل اسم المستخدم أيضاً، فالحقل نصي فيه؛ الإنشاء والاستعادة يحتاجان بريداً */}
                <input
                  key={authMode === 'signin' ? 'identifier' : 'email'}
                  name="email"
                  type={authMode === 'signin' ? 'text' : 'email'}
                  required
                  autoComplete={authMode === 'signin' ? 'username' : 'email'}
                  spellCheck={false}
                  dir="ltr"
                  className={input}
                />
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
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} copy={wc} />
      <VersionsDialog
        versions={versions}
        fileName={active.name}
        current={code}
        onClose={() => setVersions(null)}
        onRestore={restoreVersion}
        onDelete={deleteVersion}
        onClear={clearVersions}
        confirm={confirm}
        lang={lang}
        copy={wc}
      />
      <ConfirmDialog pending={pendingConfirm} onSettle={settleConfirm} />
      <Toast message={toast} onDone={clearToast} />
    </div>
  )
}

export default App
