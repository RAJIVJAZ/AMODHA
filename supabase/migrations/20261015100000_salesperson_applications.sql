-- Salesperson registration: a person applies to join the field sales team from /sales/register (signed in
-- with their own verified email); a sales manager approves or rejects. Applying never grants access:
-- approval creates the salesperson record and the Salesperson role through st_save_salesperson().

create table public.salesperson_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  email text not null,
  full_name text not null check (length(trim(full_name)) > 1),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  city text not null default 'Prayagraj',
  areas text,
  experience text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  salesperson_id uuid references public.salespeople on delete set null
);
create unique index salesperson_applications_one_pending on public.salesperson_applications (user_id) where status = 'pending';
create index salesperson_applications_status_idx on public.salesperson_applications (status, created_at desc);

-- Apply (the signed-in person, with the email their sign-in verified).
create function public.fs_apply(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
  aid uuid;
  ph text := public._b2b_clean_phone(p ->> 'phone');
begin
  if auth.uid() is null then
    raise exception 'Please sign in' using errcode = '42501';
  end if;
  select email, email_confirmed_at into u from auth.users where id = auth.uid();
  if u.email is null then
    raise exception 'Sign in with your email address to apply';
  end if;
  if exists (select 1 from public.salespeople where (user_id = auth.uid() or email = lower(u.email)) and is_active) then
    raise exception 'You are already registered as a salesperson. Open the Sales app.';
  end if;
  if exists (select 1 from public.salesperson_applications where user_id = auth.uid() and status = 'pending') then
    raise exception 'Your application is already with the sales manager';
  end if;
  if (select count(*) from public.salesperson_applications where user_id = auth.uid() and created_at > now() - interval '1 day') >= 3 then
    raise exception 'Too many applications today. Please contact the office.' using errcode = '54000';
  end if;
  if coalesce(trim(p ->> 'full_name'), '') = '' or length(trim(p ->> 'full_name')) < 2 then
    raise exception 'Enter your full name';
  end if;
  if ph is null or ph !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit mobile number';
  end if;
  insert into public.salesperson_applications (user_id, email, full_name, phone, city, areas, experience)
  values (auth.uid(), lower(u.email), trim(p ->> 'full_name'), ph, coalesce(nullif(trim(p ->> 'city'), ''), 'Prayagraj'),
    left(nullif(trim(coalesce(p ->> 'areas', '')), ''), 300), left(nullif(trim(coalesce(p ->> 'experience', '')), ''), 1000))
  returning id into aid;
  perform public.write_audit('salesperson.apply', 'salesperson_applications', aid::text, jsonb_build_object('email', lower(u.email), 'phone', ph));
  return jsonb_build_object('status', 'pending');
end;
$$;

-- The applicant's own state.
create function public.fs_my_application()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.salespeople s where s.user_id = auth.uid() and s.is_active) then jsonb_build_object('status', 'salesperson')
    else coalesce((select jsonb_build_object('status', a.status, 'created_at', a.created_at, 'decision_note', a.decision_note, 'full_name', a.full_name)
      from public.salesperson_applications a where a.user_id = auth.uid() order by a.created_at desc limit 1), jsonb_build_object('status', 'none'))
  end
$$;

-- Sales manager decides. Approval creates the salesperson (role, territories, code) in one step.
create function public.st_decide_application(p_application_id uuid, p_approve boolean, p_employee_code text default null,
  p_territories text[] default '{}', p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.salesperson_applications;
  sid uuid;
begin
  perform public.require_permission('sales_team', 'create');
  select * into a from public.salesperson_applications where id = p_application_id for update;
  if not found or a.status <> 'pending' then
    raise exception 'This application has already been decided';
  end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'Give a reason for rejecting';
  end if;
  if p_approve then
    if coalesce(trim(p_employee_code), '') = '' then
      raise exception 'Enter the employee code';
    end if;
    select id into sid from public.salespeople where email = a.email;
    if sid is not null then
      perform public.st_save_salesperson(jsonb_build_object('id', sid, 'full_name', a.full_name, 'employee_code', p_employee_code, 'phone', a.phone,
        'territories', to_jsonb(coalesce(p_territories, '{}')), 'is_active', true));
    else
      sid := public.st_save_salesperson(jsonb_build_object('email', a.email, 'full_name', a.full_name, 'employee_code', p_employee_code, 'phone', a.phone,
        'territories', to_jsonb(coalesce(p_territories, '{}'))));
    end if;
    update public.salespeople set user_id = coalesce(user_id, a.user_id) where id = sid;
    insert into public.ops_user_roles (user_id, role_key, granted_by) values (a.user_id, 'salesperson', auth.uid()) on conflict do nothing;
    update public.profiles set ops_active = true, job_title = coalesce(job_title, 'Salesperson'), full_name = coalesce(full_name, a.full_name) where id = a.user_id;
  end if;
  update public.salesperson_applications set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(),
    decision_note = nullif(trim(coalesce(p_note, '')), ''), salesperson_id = sid
  where id = a.id;
  perform public.write_audit(case when p_approve then 'salesperson.application_approve' else 'salesperson.application_reject' end,
    'salesperson_applications', a.id::text, jsonb_build_object('email', a.email, 'salesperson', sid, 'territories', p_territories), p_note);
  return sid;
end;
$$;

alter table public.salesperson_applications enable row level security;
revoke insert, update, delete, truncate on public.salesperson_applications from anon, authenticated;
revoke all on public.salesperson_applications from anon;
create policy "Sales managers and applicants read applications" on public.salesperson_applications for select to authenticated
  using (user_id = (select auth.uid()) or (select public.has_permission('sales_team', 'view')));

revoke execute on function public.fs_apply(jsonb) from public, anon;
revoke execute on function public.fs_my_application() from public, anon;
revoke execute on function public.st_decide_application(uuid, boolean, text, text[], text) from public, anon;
grant execute on function public.fs_apply(jsonb), public.fs_my_application(), public.st_decide_application(uuid, boolean, text, text[], text) to authenticated;
