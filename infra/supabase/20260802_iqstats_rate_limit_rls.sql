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

alter function public.consume_api_rate_limit(text) security invoker;

grant usage on schema private to authenticated;
grant select, insert, update, delete on private.api_rate_limits to authenticated;
