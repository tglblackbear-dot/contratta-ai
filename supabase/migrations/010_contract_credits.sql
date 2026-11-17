-- Cobrança avulsa: cada contrato gerado consome 1 crédito.
create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credits integer not null default 0 check (credits >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.activation_codes (
  code_hash text primary key,
  credits integer not null default 1 check (credits > 0),
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.user_credits enable row level security;
alter table public.activation_codes enable row level security;

drop policy if exists "Users read their own credits" on public.user_credits;
create policy "Users read their own credits" on public.user_credits
for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.redeem_contract_code(p_code text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_code public.activation_codes%rowtype;
  v_balance integer;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.';
  end if;
  v_hash := encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex');
  select * into v_code from public.activation_codes where code_hash = v_hash for update;
  if not found then
    raise exception 'Código inválido.';
  end if;
  if v_code.redeemed_at is not null then
    raise exception 'Código já utilizado.';
  end if;
  update public.activation_codes
    set redeemed_by = auth.uid(), redeemed_at = now()
    where code_hash = v_hash;
  insert into public.user_credits (user_id, credits)
    values (auth.uid(), v_code.credits)
    on conflict (user_id) do update set credits = public.user_credits.credits + excluded.credits, updated_at = now();
  select credits into v_balance from public.user_credits where user_id = auth.uid();
  return v_balance;
end;
$$;

create or replace function public.consume_contract_credit()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  if auth.uid() is null then
    return false;
  end if;
  update public.user_credits
    set credits = credits - 1, updated_at = now()
    where user_id = auth.uid() and credits > 0;
  v_ok := found;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.redeem_contract_code(text) from public;
revoke all on function public.consume_contract_credit() from public;
grant execute on function public.redeem_contract_code(text) to authenticated;
grant execute on function public.consume_contract_credit() to authenticated;
grant select on public.user_credits to authenticated;
