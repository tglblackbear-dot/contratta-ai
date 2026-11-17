alter table public.notifications
  add column push_processed_at timestamptz;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) <= 2048),
  p256dh text not null check (length(p256dh) between 40 and 200),
  auth text not null check (length(auth) between 20 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_owner_idx on public.push_subscriptions(owner_id);
create trigger set_push_subscriptions_updated_at
  before update on public.push_subscriptions
  for each row execute procedure public.set_updated_at();

alter table public.push_subscriptions enable row level security;
create policy "Users manage their own push subscriptions" on public.push_subscriptions
  for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

grant select, insert, update, delete on public.push_subscriptions to authenticated;
