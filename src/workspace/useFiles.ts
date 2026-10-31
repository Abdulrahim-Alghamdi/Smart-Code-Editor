import { useCallback, useEffect, useRef, useState } from 'react'
import { projectService, type CloudFile } from '@/services/projectService'

export type { CloudFile }

// ما يُقارن لمعرفة هل تغيّر الملف منذ آخر حفظ
const fingerprint = (f: CloudFile) => JSON.stringify([f.name, f.language, f.content])

// ملفات مشروع واحد: تُحمَّل مرة وتُسلَّم لـ onLoad، ثم sync يرسل الفرق فقط بين التبويبات المفتوحة وآخر نسخة محفوظة
export function useFiles(projectId: string | null, onLoad: (files: CloudFile[]) => void) {
  const [state, setState] = useState<{ projectId: string; files: CloudFile[] } | null>(null)
  // المشروع الذي فشل تحميل ملفاته، حتى تعرض الواجهة بديلاً؛ لا مزامنة له لأنها قد تحذف ملفات لم تُحمَّل
  const [failedFor, setFailedFor] = useState<string | null>(null)
  // أحدث onLoad دائماً، دون إعادة التحميل كلما تغيّرت الدالة
  const onLoadRef = useRef(onLoad)
  useEffect(() => {
    onLoadRef.current = onLoad
  })
  // آخر نسخة محفوظة على الخادم لكل ملف، بمعرّفه
  const saved = useRef(new Map<string, string>())
  // الطلبات تُرسل بالترتيب، حتى لا يكتب طلب قديم بطيء فوق تعديل أحدث منه
  const queue = useRef(Promise.resolve(true))

  useEffect(() => {
    if (!projectId) return
    let alive = true
    projectService.listFiles(projectId).then(({ data, error }) => {
      if (!alive) return
      if (error) {
        console.error(error)
        return setFailedFor(projectId)
      }
      saved.current = new Map(data.map((f) => [f.id, fingerprint(f)]))
      setState({ projectId, files: data })
      onLoadRef.current(data)
    })
    return () => {
      alive = false
    }
  }, [projectId])

  // يرفع الملفات الجديدة أو المعدّلة ويحذف ما أُغلق؛ يعيد false إذا رفض الخادم شيئاً، فيُعاد في المزامنة التالية
  const sync = useCallback(
    (local: CloudFile[]): Promise<boolean> => {
      queue.current = queue.current.then(async () => {
        if (!projectId) return false
        const changed = local.filter((f) => saved.current.get(f.id) !== fingerprint(f))
        const ids = new Set(local.map((f) => f.id))
        const removed = [...saved.current.keys()].filter((id) => !ids.has(id))

        if (changed.length) {
          const { error } = await projectService.upsertFiles(projectId, changed)
          if (error) return false
          for (const f of changed) saved.current.set(f.id, fingerprint(f))
        }
        if (removed.length) {
          const { error } = await projectService.deleteFiles(removed)
          if (error) return false
          for (const id of removed) saved.current.delete(id)
        }
        return true
      })
      return queue.current
    },
    [projectId]
  )

  return {
    files: projectId && state?.projectId === projectId ? state.files : null,
    failed: Boolean(projectId) && failedFor === projectId,
    sync,
  }
}
