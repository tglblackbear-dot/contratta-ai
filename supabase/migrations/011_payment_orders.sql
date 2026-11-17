-- Pedidos de pagamento via Checkout InfinitePay.
create table if not exists public.payment_orders (
  order_nsu text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'canceled', 'refunded')),
  paid_at timestamptz,
  transaction_nsu text,
  created_at timestamptz not null default now()
);

alter table public.payment_orders enable row level security;
drop policy if exists "Users read their own payment orders" on public.payment_orders;
create policy "Users read their own payment orders" on public.payment_orders
for select to authenticated using (user_id = (select auth.uid()));

grant select on public.payment_orders to authenticated;
grant all on public.payment_orders to service_role;
