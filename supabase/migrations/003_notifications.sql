alter table public.notifications
  add column contract_id uuid references public.contracts(id) on delete cascade,
  add column source_type text,
  add column source_id uuid;

create unique index notifications_source_unique_idx
  on public.notifications(owner_id, source_type, source_id)
  where source_id is not null;

create index notifications_due_idx
  on public.notifications(scheduled_for)
  where read_at is null;

create or replace function public.notify_signature_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'accepted' and old.status is distinct from new.status then
    insert into public.notifications (
      owner_id, contract_id, source_type, source_id, type, title, body, scheduled_for
    ) values (
      new.owner_id,
      new.contract_id,
      'signature',
      new.id,
      'signature_accepted',
      'Aceite eletrônico registrado',
      new.participant_name || ' aceitou a versão vinculada ao convite.',
      now()
    )
    on conflict (owner_id, source_type, source_id) where source_id is not null
    do update set
      title = excluded.title,
      body = excluded.body,
      read_at = null,
      scheduled_for = excluded.scheduled_for;
  end if;
  return new;
end;
$$;

create trigger notify_signature_acceptance
  after update of status on public.contract_signatures
  for each row execute function public.notify_signature_acceptance();

create or replace function public.schedule_installment_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  contract_title text;
  notification_time timestamptz;
begin
  if new.status <> 'pending' then
    delete from public.notifications
    where source_type = 'installment_due' and source_id = new.id and owner_id = new.owner_id;
    return new;
  end if;

  select contract.title into contract_title
  from public.contracts contract
  where contract.id = new.contract_id and contract.owner_id = new.owner_id;

  notification_time := greatest(
    ((new.due_date - 1) + time '09:00') at time zone 'America/Sao_Paulo',
    now()
  );

  insert into public.notifications (
    owner_id, contract_id, source_type, source_id, type, title, body, scheduled_for
  ) values (
    new.owner_id,
    new.contract_id,
    'installment_due',
    new.id,
    'installment_due',
    'Parcela próxima do vencimento',
    format('A parcela %s de %s vence em %s.', new.number, coalesce(contract_title, 'seu contrato'), to_char(new.due_date, 'DD/MM/YYYY')),
    notification_time
  )
  on conflict (owner_id, source_type, source_id) where source_id is not null
  do update set
    contract_id = excluded.contract_id,
    title = excluded.title,
    body = excluded.body,
    scheduled_for = excluded.scheduled_for,
    read_at = null;
  return new;
end;
$$;

create trigger schedule_installment_notification
  after insert or update of due_date, status on public.installments
  for each row execute function public.schedule_installment_notification();

create or replace function public.clear_installment_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications
  where owner_id = old.owner_id
    and source_type = 'installment_due'
    and source_id = old.id;
  return old;
end;
$$;

create trigger clear_installment_notification
  after delete on public.installments
  for each row execute function public.clear_installment_notification();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'notifications'
    )
  then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
