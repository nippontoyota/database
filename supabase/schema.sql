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
