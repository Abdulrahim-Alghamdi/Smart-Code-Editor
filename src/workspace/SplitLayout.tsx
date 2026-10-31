import { useSyncExternalStore, type ReactNode } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'

// نقطة lg في Tailwind، حيث تصبح اللوحتان جنباً إلى جنب
const WIDE = '(min-width: 1024px)'
const subscribe = (onChange: () => void) => {
  const query = matchMedia(WIDE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const isWide = () => matchMedia(WIDE).matches

interface Props {
  // المحرر ثم لوحة المراجعة (false قبل أول فحص)
  children: [ReactNode, ReactNode]
  className: string
  resizeLabel: string
}

// على الشاشات العريضة: المحرر ولوحة المراجعة بفاصل يُسحب بالفأرة أو بالأسهم. على الهاتف فوق بعضهما.
// المجموعة تبقى معروضة قبل الفحص أيضاً، حتى لا يُعاد تركيب المحرر عند ظهور لوحة المراجعة
export function SplitLayout({ children: [editor, review], className, resizeLabel }: Props) {
  const wide = useSyncExternalStore(subscribe, isWide)
  if (!wide)
    return (
      <div className={`grid w-full gap-4 ${className}`}>
        {editor}
        {review}
      </div>
    )

  return (
    <Group orientation="horizontal" className={`w-full ${className}`}>
      <Panel id="editor" minSize="35%" className="flex flex-col">
        {editor}
      </Panel>
      {review && (
        <>
          <Separator aria-label={resizeLabel} className="group flex w-4 items-center justify-center outline-none">
            <div className="h-12 w-1 rounded-full bg-line transition-colors group-hover:bg-accent group-focus-visible:bg-accent group-data-[separator=active]:bg-accent" />
          </Separator>
          <Panel id="review" minSize="25%" className="flex flex-col">
            {review}
          </Panel>
        </>
      )}
    </Group>
  )
}
