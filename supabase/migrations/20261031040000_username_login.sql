-- Username login: every user gets a unique username, so the login Edge Function can find their account by it.
-- Run after the earlier migrations.

-- 1) Usernames that are already shared: the most recently updated profile keeps it, the others get a fresh one in step 3.
update public.profiles p
set username = null
where p.username is not null
  and exists (
    select 1 from public.profiles q
    where q.username = p.username and (q.updated_at, q.id) > (p.updated_at, p.id)
  );

-- 2) A free username made from the email, with the same cleanup as usernameFromEmail in the app; a number is added if taken.
create function public.unique_username(email text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  base text := lower(split_part(coalesce(email, ''), '@', 1));
  candidate text;
  n int := 1;
begin
  base := regexp_replace(base, '[^a-z0-9_.]', '_', 'g');
  base := regexp_replace(base, '\.{2,}', '.', 'g');
  base := regexp_replace(left(base, 20), '^\.+|\.+$', '', 'g');
  if char_length(base) < 3 then
    base := left(base || '_user', 20);
  end if;
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := regexp_replace(left(base, 20 - char_length(n::text)), '\.+$', '') || n;
  end loop;
  return candidate;
end;
$$;

revoke execute on function public.unique_username(text) from public, anon, authenticated;

-- 3) Give a username to every user without one, and a profile row to users who signed up before profiles existed.
--    One statement per user, so each new username is visible to the uniqueness check of the next.
do $$
declare
  u record;
begin
  for u in
    select a.id, a.email, p.id as profile_id
    from auth.users a
    left join public.profiles p on p.id = a.id
    where p.id is null or p.username is null
  loop
    if u.profile_id is null then
      insert into public.profiles (id, username) values (u.id, public.unique_username(u.email));
    else
      update public.profiles set username = public.unique_username(u.email) where id = u.id;
    end if;
  end loop;
end;
$$;

-- 4) From now on no two users can share a username (the check constraint already keeps them lowercase).
alter table public.profiles add constraint profiles_username_key unique (username);

-- 5) New sign-ups get a username straight away. create or replace keeps the revoked EXECUTE privileges.
-- shortcut: two sign-ups racing for the same new username make the second fail with a unique error; retry or add a suffix loop on conflict if that shows up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}');
begin
  -- Email sign-up sends name; Google sends full_name; GitHub may leave name empty but always sends user_name (its handle),
  -- which also becomes the username. unique_username takes the part before any '@', so a bare handle works too.
  insert into public.profiles (id, name, username)
  values (
    new.id,
    left(coalesce(nullif(trim(meta ->> 'name'), ''), nullif(trim(meta ->> 'full_name'), ''), nullif(trim(meta ->> 'user_name'), '')), 60),
    public.unique_username(coalesce(nullif(meta ->> 'user_name', ''), new.email))
  );
  return new;
end;
$$;

-- Verify: both numbers should be 0.
select
  (select count(*) from auth.users a left join public.profiles p on p.id = a.id where p.username is null) as users_without_username,
  (select count(*) - count(distinct username) from public.profiles) as duplicate_usernames;
