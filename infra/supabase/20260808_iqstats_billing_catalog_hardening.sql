begin;

create or replace function public.get_billing_catalog()
returns table(
  code text,
  name text,
  billing_mode text,
  billing_interval text,
  access_duration_days integer,
  currency text,
  unit_amount bigint,
  feature_code text,
  feature_description text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.code,
    p.name,
    p.billing_mode,
    p.billing_interval,
    p.access_duration_days,
    p.currency,
    p.unit_amount,
    f.code as feature_code,
    f.description as feature_description
  from public.plans p
  left join public.plan_features pf on pf.plan_code = p.code
  left join public.features f
    on f.code = pf.feature_code
    and f.active
  where p.active
    and (pf.feature_code is null or f.code is not null)
  order by p.code, f.code;
$$;

revoke all on function public.get_billing_catalog()
  from public, anon, authenticated, service_role;
grant execute on function public.get_billing_catalog() to authenticated;

revoke select on public.plans from authenticated;

commit;
