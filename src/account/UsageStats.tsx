import { useEffect, useState } from 'react'
import { LANGUAGES } from '@/lib/languages'
import { supabase } from '@/lib/supabase'
import type { AccountCopy } from './copy'

// Same number as daily_limit in supabase/migrations/20261117000000_ai_usage.sql
export const AI_DAILY_LIMIT = 50

interface Stats {
  today: number
  total: number
  files: number
  languages: string[]
}

// What the signed-in user has used: AI requests (ai_usage) and the files in their account. RLS limits both to their own rows
async function loadStats(): Promise<Stats> {
  const today = new Date().toISOString().slice(0, 10)
  const [usage, files] = await Promise.all([supabase.from('ai_usage').select('day, count'), supabase.from('files').select('language')])
  if (usage.error) throw usage.error
  if (files.error) throw files.error
  const ids = [...new Set(files.data.map((f) => f.language as string))]
  return {
    today: usage.data.find((u) => u.day === today)?.count ?? 0,
    total: usage.data.reduce((n, u) => n + u.count, 0),
    files: files.data.length,
    languages: ids.map((id) => LANGUAGES.find((l) => l.id === id)?.label ?? id),
  }
}

export function UsageStats({ copy }: { copy: AccountCopy }) {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    let alive = true
    // shortcut: a failed load just hides the card; show an error if users ask where it went
    loadStats().then((s) => alive && setStats(s), console.error)
    return () => {
      alive = false
    }
  }, [])

  if (!stats) return null
  const u = copy.usage
  const cell = (label: string, value: string) => (
    <div className="rounded-lg bg-page p-3">
      <p className="text-xs text-ink-2">{label}</p>
      <p dir="ltr" className="mt-1 text-start text-lg font-semibold tabular-nums">
        {value}
      </p>
    </div>
  )
  return (
    <section aria-label={u.title} className="space-y-2">
      <h3 className="text-sm font-medium">{u.title}</h3>
      <div className="grid grid-cols-3 gap-2">
        {cell(u.today, `${stats.today} / ${AI_DAILY_LIMIT}`)}
        {cell(u.total, String(stats.total))}
        {cell(u.files, String(stats.files))}
      </div>
      {stats.languages.length > 0 && (
        <p className="text-xs text-ink-2">
          {u.languages}: <bdi dir="ltr">{stats.languages.join(', ')}</bdi>
        </p>
      )}
      {/* the bar turns accent-hover once three quarters are used */}
      <div className="h-1.5 overflow-hidden rounded-full bg-page" aria-hidden="true">
        <div
          className={`h-full rounded-full ${stats.today >= AI_DAILY_LIMIT * 0.75 ? 'bg-accent-hover' : 'bg-accent'}`}
          style={{ width: `${Math.min(100, (stats.today / AI_DAILY_LIMIT) * 100)}%` }}
        />
      </div>
    </section>
  )
}
