-- Profiles: one row per auth user, holding the editable profile plus UI preferences.
-- Email is not stored here; it lives in auth.users and is read from the session.

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text check (char_length(name) <= 60),
  username   text check (username ~ '^(?!\.)(?!.*\.\.)(?!.*\.$)[a-z0-9_.]{3,20}$'),
  bio        text check (char_length(bio) <= 160),
  -- 128px WebP thumbnail as a data URL (a few KB); the cap stops the column being used as file storage
  avatar     text check (avatar like 'data:image/%' and char_length(avatar) <= 200000),
  lang       text check (lang in ('ar', 'en')),
  editor     jsonb check (jsonb_typeof(editor) = 'object'),
  updated_at timestamptz not null default now()
);

-- Row Level Security: each signed-in user can only see and change their own row.
alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;

create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No delete policy: rows go away only through on delete cascade when the auth user is deleted.

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create the profile row at sign-up, taking the display name the sign-up form sent as metadata.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, left(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), 60));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lets a signed-in user delete their own account (the anon key cannot touch auth.users directly).
create function public.delete_own_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;

revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
