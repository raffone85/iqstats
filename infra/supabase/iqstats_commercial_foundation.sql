do $$
declare
  v_count bigint;
  v_table text;
begin
  select count(*) into v_count from auth.users;
  if v_count <> 0 then
    raise exception 'Legacy cleanup refused: auth.users contains % rows', v_count;
  end if;

  foreach v_table in array array[
    'public.profiles',
    'public.subscriptions',
    'public.data_cache',
    'public.provider_endpoint_catalog'
  ] loop
    if to_regclass(v_table) is not null then
      execute format('select count(*) from %s', v_table) into v_count;
      if v_count <> 0 then
        raise exception 'Legacy cleanup refused: % contains % rows', v_table, v_count;
      end if;
    end if;
  end loop;
end;
$$;

drop trigger if exists lineax_create_profile_on_signup on auth.users;
drop function if exists lineax_internal.create_profile_for_new_user();
drop table if exists public.data_cache;
drop table if exists public.provider_endpoint_catalog;
drop table if exists public.subscriptions;
drop table if exists public.profiles;
drop schema if exists lineax_internal;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (
    display_name is null or char_length(display_name) between 1 and 80
  )
);

create table public.plans (
  code text primary key,
  name text not null,
  billing_mode text not null,
  billing_interval text,
  access_duration_days integer,
  currency text not null,
  unit_amount bigint not null,
  active boolean not null default true,
  stripe_product_id text unique,
  stripe_price_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_code_format check (code ~ '^[a-z0-9_]+$'),
  constraint plans_name_not_blank check (btrim(name) <> ''),
  constraint plans_billing_mode check (billing_mode in ('one_time', 'subscription')),
  constraint plans_billing_interval check (
    (billing_mode = 'one_time' and billing_interval is null) or
    (billing_mode = 'subscription' and billing_interval in ('month', 'year'))
  ),
  constraint plans_access_duration check (
    (billing_mode = 'one_time' and access_duration_days is not null and access_duration_days > 0) or
    (billing_mode = 'subscription' and access_duration_days is null)
  ),
  constraint plans_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint plans_unit_amount_nonnegative check (unit_amount >= 0)
);

create table public.features (
  code text primary key,
  description text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint features_code_format check (code ~ '^[a-z][a-z0-9_.]+$'),
  constraint features_description_not_blank check (btrim(description) <> '')
);

create table public.plan_features (
  plan_code text not null references public.plans(code) on delete cascade,
  feature_code text not null references public.features(code) on delete restrict,
  limit_value bigint,
  limit_unit text,
  matrix_version integer not null default 1,
  created_at timestamptz not null default now(),
  primary key (plan_code, feature_code),
  constraint plan_features_limit_pair check (
    (limit_value is null and limit_unit is null) or
    (limit_value is not null and limit_value > 0 and limit_unit is not null and btrim(limit_unit) <> '')
  ),
  constraint plan_features_matrix_version_positive check (matrix_version > 0)
);

create index plan_features_feature_code_idx
  on public.plan_features(feature_code);

create table public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_customers_stripe_id_format check (stripe_customer_id ~ '^cus_')
);

create table public.subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_code text not null references public.plans(code) on delete restrict,
  external_key text not null unique,
  stripe_customer_id text not null,
  stripe_subscription_id text unique,
  stripe_checkout_session_id text unique,
  stripe_price_id text not null,
  status text not null,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  ended_at timestamptz,
  last_stripe_event_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_external_key_format check (
    external_key ~ '^(subscription:sub_|checkout:cs_)'
  ),
  constraint subscriptions_customer_format check (stripe_customer_id ~ '^cus_'),
  constraint subscriptions_subscription_format check (
    stripe_subscription_id is null or stripe_subscription_id ~ '^sub_'
  ),
  constraint subscriptions_checkout_format check (
    stripe_checkout_session_id is null or stripe_checkout_session_id ~ '^cs_'
  ),
  constraint subscriptions_price_format check (stripe_price_id ~ '^price_'),
  constraint subscriptions_status check (
    status in (
      'pending', 'trialing', 'active', 'past_due', 'unpaid', 'canceled',
      'incomplete', 'incomplete_expired', 'paused', 'expired'
    )
  ),
  constraint subscriptions_period_order check (current_period_end > current_period_start),
  constraint subscriptions_external_identity check (
    (stripe_subscription_id is not null and stripe_checkout_session_id is null and external_key = 'subscription:' || stripe_subscription_id) or
    (stripe_subscription_id is null and stripe_checkout_session_id is not null and external_key = 'checkout:' || stripe_checkout_session_id)
  )
);

create index subscriptions_user_id_idx on public.subscriptions(user_id);
create index subscriptions_plan_code_idx on public.subscriptions(plan_code);
create index subscriptions_user_access_idx
  on public.subscriptions(user_id, current_period_end desc)
  where status in ('trialing', 'active');

create table public.entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_code text not null references public.features(code) on delete restrict,
  source_subscription_id bigint not null references public.subscriptions(id) on delete cascade,
  plan_code text not null references public.plans(code) on delete restrict,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, feature_code, source_subscription_id),
  constraint entitlements_validity_order check (valid_until > valid_from)
);

create index entitlements_user_feature_valid_idx
  on public.entitlements(user_id, feature_code, valid_until desc);
create index entitlements_subscription_idx
  on public.entitlements(source_subscription_id);
create index entitlements_feature_code_idx
  on public.entitlements(feature_code);
create index entitlements_plan_code_idx
  on public.entitlements(plan_code);

create table public.billing_events (
  stripe_event_id text primary key,
  event_type text not null,
  object_id text not null,
  event_created_at timestamptz not null,
  livemode boolean not null,
  processing_status text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint billing_events_id_format check (stripe_event_id ~ '^evt_'),
  constraint billing_events_type_not_blank check (btrim(event_type) <> ''),
  constraint billing_events_object_not_blank check (btrim(object_id) <> ''),
  constraint billing_events_status check (processing_status in ('processed', 'ignored')),
  constraint billing_events_processed_at check (processed_at is not null)
);

create index billing_events_created_idx on public.billing_events(event_created_at desc);

create table private.api_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  request_count integer not null,
  primary key (user_id, bucket, window_start),
  constraint api_rate_limits_bucket_format check (bucket ~ '^[a-z][a-z0-9_.]+$'),
  constraint api_rate_limits_count_positive check (request_count > 0)
);

alter table private.api_rate_limits enable row level security;

create policy api_rate_limits_select_own on private.api_rate_limits
for select to authenticated
using ((select auth.uid()) = user_id);

create policy api_rate_limits_insert_own on private.api_rate_limits
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy api_rate_limits_update_own on private.api_rate_limits
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy api_rate_limits_delete_own on private.api_rate_limits
for delete to authenticated
using ((select auth.uid()) = user_id);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger plans_set_updated_at
before update on public.plans
for each row execute function private.set_updated_at();

create trigger features_set_updated_at
before update on public.features
for each row execute function private.set_updated_at();

create trigger billing_customers_set_updated_at
before update on public.billing_customers
for each row execute function private.set_updated_at();

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function private.set_updated_at();

create or replace function private.prevent_subscription_owner_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'Subscription ownership cannot be changed'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_subscription_owner_change() from public;

create trigger subscriptions_owner_immutable
before update of user_id on public.subscriptions
for each row execute function private.prevent_subscription_owner_change();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger iqstats_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function public.has_active_entitlement(p_feature_code text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.entitlements e
    where e.user_id = (select auth.uid())
      and e.feature_code = p_feature_code
      and e.valid_from <= now()
      and e.valid_until > now()
  );
$$;

create or replace function public.apply_stripe_billing_state(
  p_event_id text,
  p_event_type text,
  p_event_created_at timestamptz,
  p_livemode boolean,
  p_user_id uuid,
  p_external_key text,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_checkout_session_id text,
  p_stripe_price_id text,
  p_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_canceled_at timestamptz,
  p_ended_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_code text;
  v_subscription_id bigint;
begin
  if p_livemode then
    raise exception 'Stripe live mode is not enabled for IQstatS'
      using errcode = '22023';
  end if;

  select p.code into v_plan_code
  from public.plans p
  where p.stripe_price_id = p_stripe_price_id
    and p.active;

  if v_plan_code is null then
    raise exception 'Unknown or inactive Stripe price'
      using errcode = '22023';
  end if;

  insert into public.billing_events(
    stripe_event_id,
    event_type,
    object_id,
    event_created_at,
    livemode,
    processing_status,
    processed_at
  ) values (
    p_event_id,
    p_event_type,
    p_external_key,
    p_event_created_at,
    p_livemode,
    'processed',
    now()
  )
  on conflict (stripe_event_id) do nothing;

  if not found then
    return 'duplicate';
  end if;

  insert into public.billing_customers(user_id, stripe_customer_id)
  values (p_user_id, p_stripe_customer_id)
  on conflict (user_id) do update
    set stripe_customer_id = excluded.stripe_customer_id;

  insert into public.subscriptions(
    user_id,
    plan_code,
    external_key,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_checkout_session_id,
    stripe_price_id,
    status,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    canceled_at,
    ended_at,
    last_stripe_event_created_at
  ) values (
    p_user_id,
    v_plan_code,
    p_external_key,
    p_stripe_customer_id,
    p_stripe_subscription_id,
    p_stripe_checkout_session_id,
    p_stripe_price_id,
    p_status,
    p_current_period_start,
    p_current_period_end,
    p_cancel_at_period_end,
    p_canceled_at,
    p_ended_at,
    p_event_created_at
  )
  on conflict (external_key) do update set
    user_id = excluded.user_id,
    plan_code = excluded.plan_code,
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    stripe_checkout_session_id = excluded.stripe_checkout_session_id,
    stripe_price_id = excluded.stripe_price_id,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    canceled_at = excluded.canceled_at,
    ended_at = excluded.ended_at,
    last_stripe_event_created_at = excluded.last_stripe_event_created_at
  where excluded.last_stripe_event_created_at >= public.subscriptions.last_stripe_event_created_at
  returning id into v_subscription_id;

  if v_subscription_id is null then
    update public.billing_events
    set processing_status = 'ignored'
    where stripe_event_id = p_event_id;
    return 'stale';
  end if;

  delete from public.entitlements
  where source_subscription_id = v_subscription_id;

  if p_status in ('trialing', 'active') and p_current_period_end > now() then
    insert into public.entitlements(
      user_id,
      feature_code,
      source_subscription_id,
      plan_code,
      valid_from,
      valid_until
    )
    select
      p_user_id,
      pf.feature_code,
      v_subscription_id,
      v_plan_code,
      p_current_period_start,
      p_current_period_end
    from public.plan_features pf
    where pf.plan_code = v_plan_code;
  end if;

  return 'processed';
end;
$$;

create or replace function public.consume_api_rate_limit(p_bucket text)
returns table(allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer;
  v_window_start timestamptz := date_trunc('minute', now());
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_limit := case p_bucket
    when 'matches.list.read' then 60
    when 'matches.detail.read' then 120
    when 'method.provenance.read' then 120
    when 'odds.snapshot.read' then 60
    when 'match.history.read' then 90
    when 'match.statistics.read' then 90
    when 'match.context.read' then 90
    else null
  end;
  if v_limit is null then
    raise exception 'Unknown rate-limit bucket' using errcode = '22023';
  end if;

  delete from private.api_rate_limits
  where user_id = v_user_id
    and window_start < v_window_start - interval '1 day';

  insert into private.api_rate_limits(user_id, bucket, window_start, request_count)
  values (v_user_id, p_bucket, v_window_start, 1)
  on conflict (user_id, bucket, window_start) do update
    set request_count = private.api_rate_limits.request_count + 1
  returning request_count into v_count;

  allowed := v_count <= v_limit;
  remaining := greatest(v_limit - v_count, 0);
  retry_after_seconds := greatest(
    1,
    ceil(extract(epoch from (v_window_start + interval '1 minute' - now())))::integer
  );
  return next;
end;
$$;

insert into public.plans(
  code, name, billing_mode, billing_interval, access_duration_days, currency, unit_amount
) values
  ('trial_8_days', 'Trial 8 giorni', 'one_time', null, 8, 'EUR', 100),
  ('insight_monthly', 'Insight mensile', 'subscription', 'month', null, 'EUR', 690),
  ('pro_monthly', 'Pro mensile', 'subscription', 'month', null, 'EUR', 1290),
  ('pro_annual', 'Pro annuale', 'subscription', 'year', null, 'EUR', 10990);

insert into public.features(code, description) values
  ('matches.list.read', 'Consultazione della dashboard partite supportate'),
  ('matches.detail.read', 'Consultazione del riepilogo del dossier gara'),
  ('method.provenance.read', 'Consultazione di fonte, freschezza, copertura e limiti'),
  ('odds.snapshot.read', 'Consultazione di quote correnti, precedente e movimento'),
  ('match.history.read', 'Consultazione di forma compatta, classifica e H2H'),
  ('match.statistics.read', 'Consultazione delle statistiche gara osservate'),
  ('match.context.read', 'Consultazione del contesto squadra quando disponibile');

insert into public.plan_features(plan_code, feature_code)
select 'trial_8_days', code from public.features
union all
select 'insight_monthly', code from public.features
where code in (
  'matches.list.read', 'matches.detail.read', 'method.provenance.read',
  'odds.snapshot.read', 'match.history.read'
)
union all
select 'pro_monthly', code from public.features
union all
select 'pro_annual', code from public.features;

alter table public.profiles enable row level security;
alter table public.plans enable row level security;
alter table public.features enable row level security;
alter table public.plan_features enable row level security;
alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.entitlements enable row level security;
alter table public.billing_events enable row level security;

create policy profiles_select_own on public.profiles
for select to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy plans_select_authenticated on public.plans
for select to authenticated using (true);

create policy features_select_authenticated on public.features
for select to authenticated using (true);

create policy plan_features_select_authenticated on public.plan_features
for select to authenticated using (true);

create policy billing_customers_select_own on public.billing_customers
for select to authenticated
using ((select auth.uid()) = user_id);

create policy subscriptions_select_own on public.subscriptions
for select to authenticated
using ((select auth.uid()) = user_id);

create policy entitlements_select_own on public.entitlements
for select to authenticated
using ((select auth.uid()) = user_id);

create policy billing_events_deny_authenticated on public.billing_events
for select to authenticated using (false);

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated, service_role;

grant usage on schema public to authenticated, service_role;
grant usage on schema private to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.plans, public.features, public.plan_features to authenticated;
grant select on public.billing_customers, public.subscriptions, public.entitlements to authenticated;
grant select, insert, update, delete on private.api_rate_limits to authenticated;

grant all on public.profiles, public.plans, public.features, public.plan_features,
  public.billing_customers, public.subscriptions, public.entitlements,
  public.billing_events to service_role;
grant usage, select on all sequences in schema public to service_role;

grant execute on function public.has_active_entitlement(text) to authenticated, service_role;
grant execute on function public.consume_api_rate_limit(text) to authenticated;
grant execute on function public.apply_stripe_billing_state(
  text, text, timestamptz, boolean, uuid, text, text, text, text, text, text,
  timestamptz, timestamptz, boolean, timestamptz, timestamptz
) to service_role;
