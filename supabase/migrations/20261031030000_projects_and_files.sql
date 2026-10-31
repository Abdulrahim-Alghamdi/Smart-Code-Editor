-- Cloud projects and their code files. Needs 20261031000000_profiles.sql first (it reuses public.touch_updated_at).

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 100),
  description text check (char_length(description) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index projects_user_id_idx on public.projects (user_id);

create table public.files (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 255),
  -- the editor refuses imports over 1 MB, so this is the same cap on the server
  content    text not null default '' check (char_length(content) <= 1000000),
  language   text not null,
  path       text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index files_project_id_idx on public.files (project_id);
create index files_user_id_idx on public.files (user_id);

-- Row Level Security: full CRUD on your own rows only.
alter table public.projects enable row level security;
alter table public.files enable row level security;

revoke all on table public.projects, public.files from anon, authenticated;
grant select, insert, update, delete on table public.projects, public.files to authenticated;

create policy "Users manage their own projects"
  on public.projects for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- The project check stops a user filing rows under someone else's project id
create policy "Users manage their own files"
  on public.files for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid()))
  );

create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

create trigger files_touch_updated_at
  before update on public.files
  for each row execute function public.touch_updated_at();
