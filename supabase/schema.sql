create extension if not exists pgcrypto;

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  pin text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  clock_in_time timestamptz not null default now(),
  clock_out_time timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists attendance_one_open_shift_per_member
on public.attendance_sessions(member_id)
where clock_out_time is null;

create table if not exists public.session_breaks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  break_type text not null,
  start_time timestamptz not null default now(),
  end_time timestamptz,
  duration_minutes integer generated always as (
    case
      when end_time is null then null
      else greatest(0, floor(extract(epoch from (end_time - start_time)) / 60))::int
    end
  ) stored,
  created_at timestamptz not null default now()
);

create unique index if not exists breaks_one_open_break_per_session
on public.session_breaks(session_id)
where end_time is null;

create or replace view public.admin_monthly_report as
select
  s.id as session_id,
  m.name as member_name,
  s.clock_in_time,
  s.clock_out_time,
  coalesce(sum(b.duration_minutes), 0) as total_break_minutes
from public.attendance_sessions s
join public.members m on m.id = s.member_id
left join public.session_breaks b on b.session_id = s.id
group by s.id, m.name, s.clock_in_time, s.clock_out_time;

alter table public.members enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.session_breaks enable row level security;

create policy if not exists "members_select_all" on public.members
for select using (true);
create policy if not exists "members_update_all" on public.members
for all using (true) with check (true);

create policy if not exists "sessions_select_all" on public.attendance_sessions
for select using (true);
create policy if not exists "sessions_write_all" on public.attendance_sessions
for all using (true) with check (true);

create policy if not exists "breaks_select_all" on public.session_breaks
for select using (true);
create policy if not exists "breaks_write_all" on public.session_breaks
for all using (true) with check (true);

insert into public.members (name, pin)
values
  ('Ali', '1234'),
  ('Ahmed', '2345'),
  ('Usman', '3456'),
  ('Ahsan', '4567'),
  ('Bilal', '5678')
on conflict (name) do nothing;
