import { useRef } from 'react'
import { useLenis } from 'lenis/react'
import { ArrowIcon, CheckIcon } from '@/components/Icons'
import SplitText from '@/components/SplitText'
import { gsap, ScrollTrigger, useGSAP } from '@/lib/gsap'
import { LANGUAGES } from '@/lib/languages'

type Lang = 'ar' | 'en'

interface Props {
  lang: Lang
  exampleNames: string[]
  onSignup: () => void
  onSignin: () => void
  // الخطط ودعوة التسجيل للزائر فقط؛ المسجّل لا يحتاجها
  showSignup: boolean
}

// نصوص أقسام الصفحة بالعربية والإنجليزية
const copy = {
  ar: {
    meetTitle: 'تعرّف على المحرر الذكي',
    meetSub: `اكتشف أخطاء كودك في ${LANGUAGES.length} لغة، واقرأ شرحها بالعربية أو الإنجليزية، ثم أصلحها بنقرة واحدة.`,
    free: { title: 'سجّل الدخول وابدأ', body: 'الفحص بالذكاء الاصطناعي يحتاج حساباً مجانياً بالبريد، وملفاتك تُحفظ فيه.' },
    bilingual: {
     
      title: 'شرح بلغتك',
      body: 'اختر العربية أو الإنجليزية ويصلك التحليل بنفس اللغة.',
      ask: 'لماذا تُرجع الدالة NaN؟',
      // ⁦…⁩ يعزلان الرموز حتى لا تنعكس < و <= داخل الجملة العربية
      answer: 'الحلقة تتجاوز آخر عنصر في المصفوفة: استخدم ⁦<⁩ بدل ⁦<=⁩.',
    },
    langs: { title: 'محرر واحد لكل اللغات', body: 'من JavaScript إلى Rust وSQL، مع تلوين الكود لكل لغة.' },
    fix: { title: 'طبّق الإصلاح فوراً', body: 'زر واحد يستبدل الكود بالنسخة المصححة.' },
    tryNow: 'ابدأ الآن',
    howLink: 'كيف يعمل؟',
    howTitle: 'كيف يعمل المحرر',
    steps: [
      { title: 'الصق الكود.', body: `أو اختر مثالاً جاهزاً من ${LANGUAGES.length} لغة.` },
      { title: 'اختر اللغة.', body: 'تلوين وتدقيق حسب لغة البرمجة.' },
      { title: 'يحلل الذكاء الاصطناعي.', body: 'يقوم المساعد الذكي باكتشاف الأخطاء النحوية والمنطقية ويشرح الحل.' },
      { title: 'طبّق الإصلاح.', body: 'انسخ الشرح أو طبّق الكود المصحح بنقرة.' },
    ],
    plansTitle: 'حساب مجاني، فحص بلا حدود',
    plansSub: 'فحص الكود بالذكاء الاصطناعي متاح بعد تسجيل الدخول فقط. أنشئ حسابك بالبريد مجاناً.',
    plan: { name: 'حساب', price: 'مجاني', note: 'بالبريد الإلكتروني', features: ['فحص بالذكاء الاصطناعي بلا حدود', 'الشرح بالعربية والإنجليزية', 'ملفاتك محفوظة في حسابك', 'تطبيق الإصلاح بنقرة'], cta: 'أنشئ حساباً', badge: 'موصى به' },
    // خطوات البدء بجانب بطاقة الحساب: ما يفعله الزائر ليصل للفحص
    signupSteps: {
      name: 'ابدأ في دقيقة',
      steps: [
        ['أنشئ حساباً بالبريد', 'الاسم والبريد وكلمة المرور فقط.'],
        ['أكّد بريدك', 'رابط واحد يصلك فوراً.'],
        ['افحص كودك', 'بلا حدود، وملفاتك محفوظة في حسابك.'],
      ],
      // زر بطاقة الحساب ينشئ حساباً، فهذا لمن عنده حساب حتى لا يتكرر الزر نفسه
      cta: 'لديك حساب؟ سجّل الدخول',
    },
    about: 'محرر أكواد يكتشف الأخطاء ويشرح حلها بالعربية والإنجليزية باستخدام الذكاء الاصطناعي.',
    footerTitle: 'المنتج',
    footerLinks: [
      ['المحرر', '#top'],
      ['كيف يعمل', '#how'],
      ['الخطط', '#plans'],
    ],
    rights: '© 2026 محرر الأكواد الذكي',
  },
  en: {
    meetTitle: 'Meet Smart Code Editor',
    meetSub: `Find bugs in ${LANGUAGES.length} languages, read why in Arabic or English, and fix them in one click.`,
    free: { title: 'Log in to start', body: 'AI reviews need a free email account, and your files are saved to it.' },
    bilingual: {
     
      title: 'Explained in your language',
      body: 'Pick Arabic or English and the analysis comes back in it.',
      ask: 'Why does my function return NaN?',
      answer: 'The loop reads past the last item: use < instead of <=.',
    },
    langs: { title: 'One editor, every language', body: 'From JavaScript to Rust and SQL, with highlighting for each.' },
    fix: { title: 'Apply the fix instantly', body: 'One button swaps your code for the corrected version.' },
    tryNow: 'Get started',
    howLink: 'How it works',
    howTitle: 'How the editor works',
    steps: [
      { title: 'Paste your code.', body: `Or pick a ready example in ${LANGUAGES.length} languages.` },
      { title: 'Pick the language.', body: 'Highlighting and checks per language.' },
      { title: 'AI reviews it.', body: 'The AI Assistant detects syntax and logic errors and explains the solution.' },
      { title: 'Apply the fix.', body: 'Copy the explanation or apply the fix in one click.' },
    ],
    plansTitle: 'Free account. Unlimited reviews.',
    plansSub: 'AI code reviews are for signed-in users only. Create your account with your email, free.',
    plan: { name: 'Account', price: 'Free', note: 'With your email', features: ['Unlimited AI reviews', 'Arabic & English explanations', 'Files saved to your account', 'One-click fixes'], cta: 'Create account', badge: 'Recommended' },
    signupSteps: {
      name: 'Get started in a minute',
      steps: [
        ['Create an account', 'Just your name, email and a password.'],
        ['Confirm your email', 'One link, sent right away.'],
        ['Review your code', 'No limits, and your files are saved to your account.'],
      ],
      cta: 'Have an account? Log in',
    },
    about: 'A code editor that finds bugs and explains the fix in Arabic and English using AI.',
    footerTitle: 'Product',
    footerLinks: [
      ['Editor', '#top'],
      ['How it works', '#how'],
      ['Plans', '#plans'],
    ],
    rights: '© 2026 Smart Code Editor',
  },
}

const STEP_STYLES = ['bg-surface', 'bg-surface-2', 'bg-accent-soft', 'bg-accent text-on-accent']

// المتصفحات لا تلتزم دائماً بعلامات العزل ⁦…⁩ داخل النص، فتنقلب < و <= في الجملة العربية؛ عنصر bdi يعزلها فعلاً
const isolate = (text: string) => text.split(/⁦(.*?)⁩/).map((part, i) => (i % 2 ? <bdi key={i} dir="ltr">{part}</bdi> : part))

// ضغطة الأزرار: انكماش خفيف مع انتقال اللون
const press = 'transition-[color,background-color,transform] duration-150 active:scale-[0.96]'

export default function LandingSections({ lang, exampleNames, onSignup, onSignin, showSignup }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const lenis = useLenis()
  const c = copy[lang]
  const isEn = lang === 'en'
  // تقليص المسافة بين الحروف يناسب الإنجليزية فقط؛ في العربية يقطع اتصال الحروف
  const tight = isEn ? 'tracking-[-0.05em]' : ''
  // ذيول الحروف العربية (ي ج ح) تنزل تحت السطر؛ 1.1 يقصها داخل صندوق حركة العنوان
  const lead = isEn ? 'leading-[1.1]' : 'leading-[1.4]'
  const cardTitle = `text-3xl leading-tight ${isEn ? 'tracking-[-0.03em]' : ''}`

  const go = (target: string) => (lenis ? lenis.scrollTo(target, { offset: -80 }) : document.querySelector(target)?.scrollIntoView())

  // حركات الظهور عند التمرير، تتوقف إذا طلب المستخدم تقليل الحركة
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const root = rootRef.current
        gsap.utils.toArray<HTMLElement>('[data-reveal]', root).forEach((el) => {
          gsap.from(el, { y: 32, opacity: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } })
        })
        const cards = gsap.utils.toArray<HTMLElement>('[data-card]', root)
        gsap.set(cards, { y: 56, opacity: 0 })
        ScrollTrigger.batch(cards, {
          start: 'top 92%',
          once: true,
          onEnter: (els) => gsap.to(els, { y: 0, opacity: 1, duration: 0.8, stagger: 0.08, ease: 'power3.out' }),
        })
        gsap.utils.toArray<HTMLElement>('[data-parallax]', root).forEach((el) => {
          gsap.fromTo(
            el,
            { yPercent: 14 },
            { yPercent: -14, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } }
          )
        })
      })
    },
    { scope: rootRef, dependencies: [showSignup], revertOnUpdate: true }
  )

  return (
    <div ref={rootRef}>
      {/* تعرّف على المحرر: شبكة بطاقات بأربع مزايا */}
      <section id="meet" className="mx-auto max-w-[1280px] px-4 py-16 md:px-8 md:py-24">
        <div className="text-center">
          <SplitText text={c.meetTitle} tag="h2" splitType="words" className={`text-4xl ${lead} md:text-7xl ${tight}`} />
          <p data-reveal className="mt-3 text-ink-2">
            {c.meetSub}
          </p>
        </div>

        <div className="mt-10 grid gap-3 md:grid-cols-2">
          <article data-card className="relative flex min-h-72 overflow-hidden rounded-2xl bg-accent-soft p-6 md:p-8">
            <div className="max-w-56">
              <h3 className={cardTitle}>{c.free.title}</h3>
              <p className="mt-3 text-sm text-ink-2">{c.free.body}</p>
            </div>
            <div data-parallax className="ms-auto flex flex-col justify-center gap-3">
              {/* المميَّز هو الخطأ المنطقي، المثال نفسه الذي يفتح عليه المحرر */}
              {exampleNames.map((name, i) => (
                <span
                  key={name}
                  className={`whitespace-nowrap rounded-s-xl px-4 py-1.5 text-lg lg:px-5 lg:py-2 lg:text-2xl ${i === 1 ? 'bg-accent text-on-accent' : 'text-ink/60'}`}
                >
                  {name}
                </span>
              ))}
            </div>
          </article>

          <article
            data-card
            className="relative flex min-h-72 flex-col overflow-hidden rounded-2xl bg-page-2 p-6 md:p-8"
          >
            <h3 className={cardTitle}>{c.bilingual.title}</h3>
            <p className="mt-3 max-w-64 text-sm text-ink-2">{c.bilingual.body}</p>
            <div data-parallax className="mt-auto flex w-full max-w-xs flex-col gap-2 self-end pt-6">
              <span dir="auto" className="self-end rounded-xl bg-surface-2 px-3 py-2 text-xs">{c.bilingual.ask}</span>
              <span dir="auto" className="rounded-xl bg-accent px-3 py-2 text-xs text-on-accent">{isolate(c.bilingual.answer)}</span>
            </div>
          </article>

          <article data-card className="relative flex min-h-72 flex-col overflow-hidden rounded-2xl bg-surface-2 p-6 md:p-8">
            <h3 className={cardTitle}>{c.langs.title}</h3>
            <p className="mt-3 max-w-72 text-sm text-ink-2">{c.langs.body}</p>
            <div data-parallax dir="ltr" className="mt-auto grid w-full max-w-72 grid-cols-4 gap-2 self-end pt-6">
              {LANGUAGES.slice(0, 8).map((l) => (
                <span key={l.id} className="grid aspect-square place-items-center rounded-lg bg-surface text-xs font-medium">
                  {l.glyph}
                </span>
              ))}
            </div>
          </article>

          <article data-card className="relative flex min-h-72 flex-col overflow-hidden rounded-2xl bg-accent p-6 text-on-accent md:p-8">
            <h3 className={cardTitle}>{c.fix.title}</h3>
            <p className="mt-3 max-w-64 text-sm text-on-accent/80">{c.fix.body}</p>
            <div data-parallax className="mt-auto self-end pt-6">
              <pre dir="ltr" className="overflow-x-auto rounded-xl bg-page p-4 text-left font-mono text-xs leading-6">
                <span className="block text-red-200">- for (let i = 0; i &lt;= arr.length; i++)</span>
                <span className="block text-emerald-200">+ for (let i = 0; i &lt; arr.length; i++)</span>
              </pre>
            </div>
          </article>
        </div>

        <div data-reveal className="mt-8 flex items-center justify-center gap-6">
          <button
            onClick={() => go('#top')}
            className={`inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover ${press}`}
          >
            {c.tryNow} <ArrowIcon />
          </button>
          <button onClick={() => go('#how')} className="text-sm text-ink-2 hover:text-ink">
            {c.howLink}
          </button>
        </div>
      </section>

      {/* كيف يعمل: أربع خطوات بتدرج لوني */}
      <section id="how" className="mx-auto max-w-[1280px] px-4 py-16 md:px-8 md:py-24">
        <SplitText text={c.howTitle} tag="h2" splitType="words" className={`w-full text-4xl ${lead} md:text-5xl ${tight}`} />
        <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {c.steps.map((step, i) => (
            <li key={step.title} data-card className={`flex min-h-40 flex-col justify-end sm:min-h-56 rounded-2xl p-6 ${STEP_STYLES[i]}`}>
              <h3 className={cardTitle}>{step.title}</h3>
              <p className="mt-3">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {showSignup && (
        <>
          {/* الخطط: الحساب المجاني، وبجانبه خطوات البدء */}
          <section id="plans" className="mx-auto max-w-[1280px] px-4 py-16 md:px-8 md:py-24">
            <SplitText
              text={c.plansTitle}
              tag="h2"
              splitType="words"
              className={`w-full text-4xl ${lead} md:text-[64px] ${tight}`}
            />
            <p data-reveal className="mx-auto mt-4 max-w-md text-center text-ink-2">
              {c.plansSub}
            </p>
            <div className="mt-10 grid gap-3 md:grid-cols-2">
              <article data-card className="flex flex-col rounded-2xl bg-surface p-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-ink-2">{c.plan.name}</p>
                  <p className="text-sm text-accent">{c.plan.badge}</p>
                </div>
                {/* line-height 1 من text-5xl يقص ذيل الجيم والياء في "مجاني" فيدخل في السطر الذي تحته */}
                <p className={`mt-4 text-5xl ${isEn ? tight : 'leading-[1.4]'}`}>{c.plan.price}</p>
                <p className="mt-3 text-sm text-ink-2">{c.plan.note}</p>
                <ul className="mt-6 flex-1 space-y-2 text-sm">
                  {c.plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2">
                      <CheckIcon className="size-4 shrink-0 text-accent" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={onSignup}
                  className={`mt-8 h-10 rounded-lg bg-accent text-sm font-medium text-on-accent hover:bg-accent-hover ${press}`}
                >
                  {c.plan.cta}
                </button>
              </article>

              <article data-card className="flex flex-col rounded-2xl bg-surface p-6">
                <p className="text-sm text-ink-2">{c.signupSteps.name}</p>
                <ol className="mt-6 flex-1 space-y-6">
                  {c.signupSteps.steps.map(([title, body], i) => (
                    <li key={title} className="flex gap-4">
                      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-lg font-medium text-accent">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-lg font-medium">{title}</p>
                        <p className="mt-1 text-sm text-ink-2">{body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <button onClick={onSignin} className={`mt-8 h-10 rounded-lg bg-surface-2 text-sm font-medium text-ink hover:bg-line ${press}`}>
                  {c.signupSteps.cta}
                </button>
              </article>
            </div>
          </section>
        </>
      )}

      <footer className="bg-page-2">
        <div className="mx-auto grid max-w-[1280px] gap-10 px-4 py-16 md:grid-cols-[2fr_1fr] md:px-8">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-md bg-accent text-xs font-bold text-on-accent" aria-hidden="true">
                {'{}'}
              </span>
              <span className="text-xl font-medium">{isEn ? 'Smart Code Editor' : 'محرر الأكواد الذكي'}</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-2">{c.about}</p>
          </div>
          <nav aria-label={c.footerTitle}>
            <h2 className="text-sm font-semibold">{c.footerTitle}</h2>
            <ul className="mt-4 space-y-2 text-sm text-ink-2">
              {c.footerLinks.filter(([, target]) => showSignup || target !== '#plans').map(([label, target]) => (
                <li key={target}>
                  <button onClick={() => go(target)} className="hover:text-ink">
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <p className="mx-auto max-w-[1280px] px-4 pb-8 text-xs text-ink-2 md:px-8">{c.rights}</p>
      </footer>
    </div>
  )
}
