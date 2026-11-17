-- Daily AI quota per user: the review (supabase/functions/gemini) and the generator (api/generate.ts) both spend
-- the same Gemini key, so each signed-in user gets AI_DAILY_LIMIT calls a day between them. Safe to run more than once.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- UTC day, so the quota resets at the same moment for everyone
  day     date not null default (now() at time zone 'utc')::date,
  count   integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

-- Users can read their own usage (the account dialog shows it), never write it: only consume_ai_quota does.
alter table public.ai_usage enable row level security;
revoke all on table public.ai_usage from anon, authenticated;
grant select on table public.ai_usage to authenticated;
drop policy if exists "Users read their own AI usage" on public.ai_usage;
create policy "Users read their own AI usage"
  on public.ai_usage for select to authenticated
  using ((select auth.uid()) = user_id);

-- Counts one AI call for the caller and returns how many are left today, or -1 when the quota was already used up
-- (the call is then not counted). SECURITY DEFINER so it can write the table users can't; it only ever touches
-- auth.uid()'s row, so calling it yourself can only spend your own quota.
create or replace function public.consume_ai_quota()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  daily_limit constant integer := 50;
  used integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in required' using errcode = '28000';
  end if;
  insert into public.ai_usage as u (user_id, count)
  values (auth.uid(), 1)
  on conflict (user_id, day) do update set count = u.count + 1
  where u.count < daily_limit
  returning u.count into used;
  -- the where clause skipped the update: today's quota is used up
  if used is null then
    return -1;
  end if;
  return daily_limit - used;
end;
$$;

revoke execute on function public.consume_ai_quota() from public, anon;
grant execute on function public.consume_ai_quota() to authenticated;
