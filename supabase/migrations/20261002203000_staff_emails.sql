-- Staff access belongs to an email address, so it survives an account being deleted and re-created.
create table public.staff_emails (
  email text primary key check (email = lower(email)),
  added_by text,
  created_at timestamptz not null default now()
);

alter table public.staff_emails enable row level security;
-- No policies: only the server (secret key) reads or changes this list.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, phone, email, is_admin)
  values (
    new.id,
    nullif(right(regexp_replace(coalesce(new.phone, ''), '\D', '', 'g'), 10), ''),
    lower(new.email),
    exists (select 1 from public.staff_emails s where s.email = lower(new.email))
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Accounts created before email sign-in had no email on their profile.
update public.profiles p set email = lower(u.email) from auth.users u where u.id = p.id and p.email is null and u.email is not null;
create index if not exists profiles_email_idx on public.profiles (email);
