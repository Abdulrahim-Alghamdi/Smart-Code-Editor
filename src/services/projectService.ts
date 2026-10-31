// استعلامات جدولي projects و files في مكان واحد؛ كل دالة ترجع { data, error } كما يرجعها Supabase والقرار عند المستدعي.
// الأمان في سياسات RLS على الخادم، فالمستخدم لا يرى ولا يعدّل إلا صفوفه مهما أُرسل من هنا
import { supabase } from '@/lib/supabase'

export interface Project {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface CloudFile {
  id: string
  name: string
  language: string
  content: string
}

const PROJECT_COLUMNS = 'id, name, description, created_at, updated_at'
const FILE_COLUMNS = 'id, name, language, content'

export const projectService = {
  listProjects: () => supabase.from('projects').select(PROJECT_COLUMNS).order('created_at').returns<Project[]>(),

  // معرّف المشروع الافتراضي هو معرّف المستخدم، فطلبان متزامنان (StrictMode أو تبويبان) لا ينشئان مشروعين
  ensureDefaultProject: (userId: string, name: string) =>
    supabase.from('projects').upsert({ id: userId, name }, { onConflict: 'id', ignoreDuplicates: true }),

  createProject: (name: string, description: string | null) =>
    supabase.from('projects').insert({ name, description }).select(PROJECT_COLUMNS).single<Project>(),

  updateProject: (id: string, patch: Partial<Pick<Project, 'name' | 'description'>>) =>
    supabase.from('projects').update(patch).eq('id', id).select(PROJECT_COLUMNS).single<Project>(),

  // ملفات المشروع تُحذف معه (on delete cascade)
  deleteProject: (id: string) => supabase.from('projects').delete().eq('id', id),

  listFiles: (projectId: string) =>
    supabase.from('files').select(FILE_COLUMNS).eq('project_id', projectId).order('created_at').returns<CloudFile[]>(),

  upsertFiles: (projectId: string, files: CloudFile[]) =>
    supabase.from('files').upsert(files.map(({ id, name, language, content }) => ({ id, name, language, content, project_id: projectId }))),

  deleteFiles: (ids: string[]) => supabase.from('files').delete().in('id', ids),
}
