import { useEffect, useState } from 'react'
import { useAuth } from '@/account/useAuth'
import { projectService, type Project } from '@/services/projectService'

export type { Project }

const DEFAULT_NAME = 'My project'

// مشاريع المستخدم المسجّل؛ إذا لم يكن له مشروع يُنشأ له واحد افتراضي
export function useProjects() {
  const { user } = useAuth()
  const userId = user?.id
  const [state, setState] = useState<{ userId: string; projects: Project[] } | null>(null)
  // معرّف المستخدم الذي فشل تحميل مشاريعه، حتى تعرض الواجهة بديلاً بدل الانتظار للأبد
  const [failedFor, setFailedFor] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    let alive = true
    const load = async () => {
      let list = await projectService.listProjects()
      if (!list.error && !list.data.length) {
        await projectService.ensureDefaultProject(userId, DEFAULT_NAME)
        list = await projectService.listProjects()
      }
      if (!alive) return
      if (list.error) {
        console.error(list.error)
        return setFailedFor(userId)
      }
      setState({ userId, projects: list.data })
    }
    load()
    return () => {
      alive = false
    }
  }, [userId])

  const projects = userId && state?.userId === userId ? state.projects : null

  // كل عملية تعيد null أو false إذا رفضها الخادم، والقائمة لا تتغير حينها
  const create = async (name: string, description: string | null = null): Promise<Project | null> => {
    const { data, error } = await projectService.createProject(name, description)
    if (error) return null
    setState((s) => s && { ...s, projects: [...s.projects, data] })
    return data
  }

  const update = async (id: string, patch: Partial<Pick<Project, 'name' | 'description'>>): Promise<Project | null> => {
    const { data, error } = await projectService.updateProject(id, patch)
    if (error) return null
    setState((s) => s && { ...s, projects: s.projects.map((p) => (p.id === id ? data : p)) })
    return data
  }

  const remove = async (id: string): Promise<boolean> => {
    const { error } = await projectService.deleteProject(id)
    if (error) return false
    setState((s) => s && { ...s, projects: s.projects.filter((p) => p.id !== id) })
    return true
  }

  return { projects, failed: Boolean(userId) && failedFor === userId, create, update, remove }
}
