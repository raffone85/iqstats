create table private.api_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  request_count integer not null,
  primary key (user_id, bucket, window_start),
  constraint api_rate_limits_bucket_format check (bucket ~ '^[a-z][a-z0-9_.]+$'),
  constraint api_rate_limits_count_positive check (request_count > 0)
);

create or replace function public.consume_api_rate_limit(p_bucket text)
returns table(allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
volatile
security definer
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

revoke all on function public.consume_api_rate_limit(text)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_api_rate_limit(text) to authenticated;
