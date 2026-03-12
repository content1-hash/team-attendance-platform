create extension if not exists pgcrypto;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null unique,
  pin text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz,
  total_break_seconds integer not null default 0,
  total_work_seconds integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists one_open_session_per_member
on public.attendance_sessions(member_id)
where clock_out_at is null;

create table if not exists public.break_entries (
  id uuid primary key default gen_random_uuid(),
  attendance_session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  break_type text not null check (break_type in ('first_break','second_break','third_break','extra_break')),
  break_start_at timestamptz not null default now(),
  break_end_at timestamptz,
  break_seconds integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists one_open_break_per_session
on public.break_entries(attendance_session_id)
where break_end_at is null;

alter table public.members enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.break_entries enable row level security;

create policy "Allow read members" on public.members
for select using (true);

create policy "Allow all members writes" on public.members
for all using (true) with check (true);

create policy "Allow read sessions" on public.attendance_sessions
for select using (true);

create policy "Allow insert sessions" on public.attendance_sessions
for insert with check (true);

create policy "Allow update sessions" on public.attendance_sessions
for update using (true) with check (true);

create policy "Allow read breaks" on public.break_entries
for select using (true);

create policy "Allow insert breaks" on public.break_entries
for insert with check (true);

create policy "Allow update breaks" on public.break_entries
for update using (true) with check (true);

create or replace function public.clock_in_member(p_member_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_session_id uuid;
begin
  select id into v_session_id
  from public.attendance_sessions
  where member_id = p_member_id and clock_out_at is null;

  if v_session_id is not null then
    raise exception 'An open shift already exists for this member.';
  end if;

  insert into public.attendance_sessions(member_id)
  values (p_member_id)
  returning id into v_session_id;

  return v_session_id;
end;
$$;

create or replace function public.start_break(p_session_id uuid, p_break_type text)
returns uuid
language plpgsql
as $$
declare
  v_break_id uuid;
  v_open_break uuid;
begin
  if not exists (
    select 1 from public.attendance_sessions
    where id = p_session_id and clock_out_at is null
  ) then
    raise exception 'No open shift was found.';
  end if;

  select id into v_open_break
  from public.break_entries
  where attendance_session_id = p_session_id and break_end_at is null;

  if v_open_break is not null then
    raise exception 'A break is already running.';
  end if;

  insert into public.break_entries(attendance_session_id, break_type)
  values (p_session_id, p_break_type)
  returning id into v_break_id;

  return v_break_id;
end;
$$;

create or replace function public.end_break(p_session_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_break_id uuid;
  v_break_start timestamptz;
  v_seconds integer;
begin
  select id, break_start_at
  into v_break_id, v_break_start
  from public.break_entries
  where attendance_session_id = p_session_id and break_end_at is null
  order by break_start_at desc
  limit 1;

  if v_break_id is null then
    raise exception 'No active break was found.';
  end if;

  v_seconds := greatest(0, floor(extract(epoch from (now() - v_break_start)))::integer);

  update public.break_entries
  set break_end_at = now(),
      break_seconds = v_seconds
  where id = v_break_id;

  update public.attendance_sessions
  set total_break_seconds = coalesce(total_break_seconds, 0) + v_seconds
  where id = p_session_id;

  return v_break_id;
end;
$$;

create or replace function public.clock_out_member(p_member_id uuid)
returns uuid
language plpgsql
as $$
declare
  v_session_id uuid;
  v_clock_in timestamptz;
  v_seconds integer;
begin
  select id, clock_in_at
  into v_session_id, v_clock_in
  from public.attendance_sessions
  where member_id = p_member_id and clock_out_at is null
  order by clock_in_at desc
  limit 1;

  if v_session_id is null then
    raise exception 'No open shift was found.';
  end if;

  if exists (
    select 1 from public.break_entries
    where attendance_session_id = v_session_id and break_end_at is null
  ) then
    raise exception 'End the active break before clocking out.';
  end if;

  v_seconds := greatest(0, floor(extract(epoch from (now() - v_clock_in)))::integer);

  update public.attendance_sessions
  set clock_out_at = now(),
      total_work_seconds = greatest(0, v_seconds - coalesce(total_break_seconds, 0))
  where id = v_session_id;

  return v_session_id;
end;
$$;

insert into public.members (full_name, pin)
values
  ('Member 01', '1111'),
  ('Member 02', '1112'),
  ('Member 03', '1113'),
  ('Member 04', '1114'),
  ('Member 05', '1115'),
  ('Member 06', '1116'),
  ('Member 07', '1117'),
  ('Member 08', '1118'),
  ('Member 09', '1119'),
  ('Member 10', '1120'),
  ('Member 11', '1121'),
  ('Member 12', '1122'),
  ('Member 13', '1123'),
  ('Member 14', '1124'),
  ('Member 15', '1125'),
  ('Member 16', '1126'),
  ('Member 17', '1127'),
  ('Member 18', '1128'),
  ('Member 19', '1129'),
  ('Member 20', '1130')
on conflict (full_name) do nothing;
