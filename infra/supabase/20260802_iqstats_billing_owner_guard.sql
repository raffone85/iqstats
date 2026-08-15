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

drop trigger if exists subscriptions_owner_immutable on public.subscriptions;
create trigger subscriptions_owner_immutable
before update of user_id on public.subscriptions
for each row execute function private.prevent_subscription_owner_change();
