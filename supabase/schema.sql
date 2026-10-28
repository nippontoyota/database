-- Run this whole file once in Supabase: SQL Editor -> New query -> Run.

-- 1. Table ---------------------------------------------------------------
create table if not exists public.vehicles (
  id               bigint generated always as identity primary key,
  registration_no  text     not null unique,
  registration_date date    not null,
  reg_year         smallint not null,
  owner_name       text,
  owner_mobile     text,
  maker            text     not null,
  model            text,
  rto_code         text     not null,
  district         text,
  pincode          text,
  address          text
);

create index if not exists vehicles_reg_year_idx on public.vehicles (reg_year);
create index if not exists vehicles_maker_idx    on public.vehicles (maker);
create index if not exists vehicles_model_idx    on public.vehicles (model);
create index if not exists vehicles_rto_idx      on public.vehicles (rto_code);

-- 2. Security: only signed-in users can read; nobody can write from the app ---
alter table public.vehicles enable row level security;

drop policy if exists "signed-in users can read vehicles" on public.vehicles;
create policy "signed-in users can read vehicles"
  on public.vehicles for select
  to authenticated
  using (true);

-- 3. Filter dropdown values ------------------------------------------------------
create or replace function public.get_filter_options()
returns json
language sql
stable
security invoker
as $$
  select json_build_object(
    'years', (
      select coalesce(json_agg(y order by y), '[]'::json)
      from (select distinct reg_year as y from public.vehicles) t
    ),
    'makers', (
      select coalesce(json_agg(maker order by maker), '[]'::json)
      from (select distinct maker from public.vehicles) t
    ),
    'models', (
      select coalesce(json_agg(json_build_object('maker', maker, 'model', model) order by maker, model), '[]'::json)
      from (select distinct maker, model from public.vehicles where model is not null and model <> '') t
    ),
    -- RTO label = the district most records with that RTO code live in
    'rtos', (
      select coalesce(json_agg(json_build_object('code', rto_code, 'district', d) order by rto_code), '[]'::json)
      from (
        select rto_code, mode() within group (order by district) as d
        from public.vehicles
        group by rto_code
      ) t
    )
  );
$$;

-- 4. Search + count. A NULL array means "no filter on that field". --------------
-- Arrays go in the request body (RPC), so selecting thousands of models never
-- hits URL-length limits.
create or replace function public.count_vehicles(
  p_years  int[]  default null,
  p_makers text[] default null,
  p_models text[] default null,
  p_rtos   text[] default null
)
returns bigint
language sql
stable
security invoker
as $$
  select count(*)
  from public.vehicles v
  where (p_years  is null or v.reg_year = any(p_years))
    and (p_makers is null or v.maker    = any(p_makers))
    and (p_models is null or v.model    = any(p_models))
    and (p_rtos   is null or v.rto_code = any(p_rtos));
$$;

create or replace function public.search_vehicles(
  p_years  int[]  default null,
  p_makers text[] default null,
  p_models text[] default null,
  p_rtos   text[] default null,
  p_after  bigint default 0,
  p_limit  int    default 1000
)
returns setof public.vehicles
language sql
stable
security invoker
as $$
  select v.*
  from public.vehicles v
  where v.id > p_after
    and (p_years  is null or v.reg_year = any(p_years))
    and (p_makers is null or v.maker    = any(p_makers))
    and (p_models is null or v.model    = any(p_models))
    and (p_rtos   is null or v.rto_code = any(p_rtos))
  order by v.id
  limit p_limit;
$$;

-- 5. Monthly counts for the admin dashboard chart. Groups by calendar month
-- (1-12) across whichever years are selected, not by a specific year-month pair.
create or replace function public.monthly_counts(
  p_years  int[]  default null,
  p_makers text[] default null,
  p_models text[] default null,
  p_rtos   text[] default null
)
returns table(month smallint, count bigint)
language sql
stable
security invoker
as $$
  select extract(month from v.registration_date)::smallint as month, count(*) as count
  from public.vehicles v
  where (p_years  is null or v.reg_year = any(p_years))
    and (p_makers is null or v.maker    = any(p_makers))
    and (p_models is null or v.model    = any(p_models))
    and (p_rtos   is null or v.rto_code = any(p_rtos))
  group by month
  order by month;
$$;

grant execute on function public.get_filter_options() to authenticated;
grant execute on function public.count_vehicles(int[], text[], text[], text[]) to authenticated;
grant execute on function public.search_vehicles(int[], text[], text[], text[], bigint, int) to authenticated;
grant execute on function public.monthly_counts(int[], text[], text[], text[]) to authenticated;

-- 6. Profile database: RTO/firm business contacts. Separate from vehicles;
-- admin-only upload, same no-client-write security model. -----------------
create table if not exists public.rto_profiles (
  id              bigint generated always as identity primary key,
  rto_no          text,
  district        text,
  firm_name       text,
  contact_person  text,
  mobile          text,
  email           text,
  address         text,
  city            text,
  pincode         text,
  profile         text,
  state_orig      text,
  phone2          text
);

create index if not exists rto_profiles_rto_no_idx on public.rto_profiles (rto_no);
create index if not exists rto_profiles_district_idx on public.rto_profiles (district);

alter table public.rto_profiles enable row level security;

drop policy if exists "signed-in users can read rto_profiles" on public.rto_profiles;
create policy "signed-in users can read rto_profiles"
  on public.rto_profiles for select
  to authenticated
  using (true);

-- 7. Filter options + search/count for the profile database, filtered by
-- "profile" (category) and rto_no. Same NULL-means-everything convention.
create or replace function public.get_profile_filter_options()
returns json
language sql
stable
security invoker
as $$
  select json_build_object(
    'profiles', (
      select coalesce(json_agg(p order by p), '[]'::json)
      from (select distinct profile as p from public.rto_profiles where profile is not null and profile <> '') t
    ),
    'rtos', (
      select coalesce(json_agg(r order by r), '[]'::json)
      from (select distinct rto_no as r from public.rto_profiles where rto_no is not null and rto_no <> '') t
    )
  );
$$;

create or replace function public.count_profiles(
  p_profiles text[] default null,
  p_rtos     text[] default null
)
returns bigint
language sql
stable
security invoker
as $$
  select count(*)
  from public.rto_profiles p
  where (p_profiles is null or p.profile = any(p_profiles))
    and (p_rtos     is null or p.rto_no  = any(p_rtos));
$$;

create or replace function public.search_profiles(
  p_profiles text[] default null,
  p_rtos     text[] default null,
  p_after    bigint default 0,
  p_limit    int    default 1000
)
returns setof public.rto_profiles
language sql
stable
security invoker
as $$
  select p.*
  from public.rto_profiles p
  where p.id > p_after
    and (p_profiles is null or p.profile = any(p_profiles))
    and (p_rtos     is null or p.rto_no  = any(p_rtos))
  order by p.id
  limit p_limit;
$$;

grant execute on function public.get_profile_filter_options() to authenticated;
grant execute on function public.count_profiles(text[], text[]) to authenticated;
grant execute on function public.search_profiles(text[], text[], bigint, int) to authenticated;
