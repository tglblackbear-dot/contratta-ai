create extension if not exists pgcrypto with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  document text,
  rg text,
  marital_status text,
  profession text,
  phone text,
  address text,
  logo_path text,
  consent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'Dados de perfil protegidos por RLS. Integridade de autoria: Deus acima de tudo, familia em primeiro lugar.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  insert into public.user_preferences (user_id)
  values (new.id);
  return new;
end;
$$;

create table public.frequent_parties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  document text,
  rg text,
  email text,
  phone text,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index frequent_parties_owner_name_idx on public.frequent_parties(owner_id, name);

create table public.contract_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.contract_types (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.contract_categories(id) on delete restrict,
  slug text not null unique,
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.contract_clauses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  body text not null,
  version integer not null default 1 check (version > 0),
  legal_references text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.contract_clauses is 'Cláusulas versionadas. Referências jurídicas devem ser revisadas antes de publicação.';

create table public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.contract_categories(id) on delete restrict,
  contract_type_id uuid references public.contract_types(id) on delete restrict,
  category text not null default 'other',
  slug text not null,
  name text not null,
  description text not null default '',
  purpose text not null default '',
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  clauses jsonb not null default '[]'::jsonb check (jsonb_typeof(clauses) = 'array'),
  conditional_rules jsonb not null default '[]'::jsonb check (jsonb_typeof(conditional_rules) = 'array'),
  legal_references text[] not null default '{}',
  version integer not null default 1 check (version > 0),
  reviewed_at date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug, version)
);
comment on table public.contract_templates is 'Modelos públicos, versionados e sem referências jurídicas não revisadas.';

create table public.contract_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.contract_templates(id) on delete cascade,
  version integer not null check (version > 0),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (template_id, version)
);

create table public.contract_template_clauses (
  template_id uuid not null references public.contract_templates(id) on delete cascade,
  clause_id uuid not null references public.contract_clauses(id) on delete restrict,
  position integer not null default 0,
  required boolean not null default true,
  primary key (template_id, clause_id)
);

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid references public.contract_templates(id) on delete set null,
  title text not null,
  contract_type text not null,
  status text not null default 'in_progress' check (status in ('draft', 'in_progress', 'awaiting_signature', 'completed', 'cancelled')),
  interview_data jsonb not null default '{}'::jsonb,
  content text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contracts_owner_updated_idx on public.contracts(owner_id, updated_at desc);
create index contracts_owner_status_idx on public.contracts(owner_id, status);
comment on table public.contracts is 'Documentos privados. O conteúdo é um rascunho até revisão explícita das partes.';

create table public.contract_parties (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  frequent_party_id uuid references public.frequent_parties(id) on delete set null,
  role text not null,
  data_snapshot jsonb not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index contract_parties_contract_idx on public.contract_parties(contract_id);

create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  contract_id uuid not null unique references public.contracts(id) on delete cascade,
  state text not null default 'INITIAL',
  fields jsonb not null default '{}'::jsonb,
  missing_fields jsonb not null default '[]'::jsonb,
  progress integer not null default 0 check (progress between 0 and 100),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.interview_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null check (length(content) <= 12000),
  created_at timestamptz not null default now()
);
create index interview_messages_session_created_idx on public.interview_messages(session_id, created_at);

create table public.contract_answers (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  field_key text not null,
  value jsonb not null,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (contract_id, field_key)
);

create table public.contract_attachments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 10485760),
  created_at timestamptz not null default now()
);

create table public.contract_versions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  version integer not null check (version > 0),
  rendered_content text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  file_path text,
  created_at timestamptz not null default now(),
  unique (contract_id, version)
);
comment on table public.contract_versions is 'Cada versão do PDF é imutável; o hash identifica o arquivo gerado.';

create table public.contract_signatures (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  contract_version_id uuid not null references public.contract_versions(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete cascade,
  participant_name text not null,
  participant_email text,
  participant_role text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  consent_text text,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.signature_tokens (
  id uuid primary key default gen_random_uuid(),
  signature_id uuid not null unique references public.contract_signatures(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.signature_tokens is 'Hash de token de uso único. Sem políticas para acesso direto por clientes.';

create or replace function public.create_signature_token(
  p_contract_id uuid,
  p_version_id uuid,
  p_owner_id uuid,
  p_participant_name text,
  p_participant_email text,
  p_participant_role text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  signature_id uuid;
begin
  if not exists (
    select 1 from public.contracts contract
    where contract.id = p_contract_id and contract.owner_id = p_owner_id
  ) then
    raise exception 'Contract not found' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.contract_versions version
    where version.id = p_version_id and version.contract_id = p_contract_id
  ) then
    raise exception 'Document version not found' using errcode = 'P0001';
  end if;

  insert into public.contract_signatures (
    contract_id, contract_version_id, owner_id, participant_name, participant_email, participant_role
  ) values (
    p_contract_id, p_version_id, p_owner_id, p_participant_name, p_participant_email, p_participant_role
  ) returning id into signature_id;

  insert into public.signature_tokens (signature_id, token_hash, expires_at)
  values (signature_id, p_token_hash, p_expires_at);

  update public.contracts set status = 'awaiting_signature', updated_at = now()
  where id = p_contract_id and owner_id = p_owner_id;

  insert into public.contract_audit_logs (contract_id, owner_id, actor_id, event_type, metadata)
  values (p_contract_id, p_owner_id, p_owner_id, 'signature_link_created', jsonb_build_object(
    'signature_id', signature_id,
    'version_id', p_version_id,
    'expires_at', p_expires_at
  ));

  return jsonb_build_object('signature_id', signature_id, 'expires_at', p_expires_at);
end;
$$;
revoke all on function public.create_signature_token(uuid, uuid, uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.create_signature_token(uuid, uuid, uuid, text, text, text, text, timestamptz) to service_role;

create or replace function public.register_signature_acceptance(p_token_hash text, p_consent_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_row record;
  pending_signatures boolean;
begin
  select
    token.id as token_id,
    token.expires_at,
    token.used_at,
    signature.id as signature_id,
    signature.contract_id,
    signature.owner_id,
    signature.participant_name,
    signature.participant_role
  into token_row
  from public.signature_tokens token
  join public.contract_signatures signature on signature.id = token.signature_id
  where token.token_hash = p_token_hash
  for update of token;

  if not found or token_row.used_at is not null or token_row.expires_at <= now() then
    raise exception 'Signature link is expired or already used' using errcode = 'P0001';
  end if;

  update public.signature_tokens set used_at = now() where id = token_row.token_id;
  update public.contract_signatures
    set status = 'accepted', consent_text = p_consent_text, accepted_at = now(), updated_at = now()
    where id = token_row.signature_id and status = 'pending';

  if not found then
    raise exception 'Signature is no longer pending' using errcode = 'P0001';
  end if;

  insert into public.contract_audit_logs (
    contract_id, owner_id, actor_id, event_type, metadata
  ) values (
    token_row.contract_id,
    token_row.owner_id,
    null,
    'electronic_acceptance_recorded',
    jsonb_build_object(
      'participant_role', token_row.participant_role,
      'accepted_at', now()
    )
  );

  select exists (
    select 1 from public.contract_signatures signature
    where signature.contract_id = token_row.contract_id and signature.status <> 'accepted'
  ) into pending_signatures;

  if not pending_signatures then
    update public.contracts set status = 'completed', updated_at = now()
    where id = token_row.contract_id;
  end if;

  return jsonb_build_object(
    'signature_id', token_row.signature_id,
    'contract_id', token_row.contract_id,
    'participant_name', token_row.participant_name,
    'accepted_at', now()
  );
end;
$$;
revoke all on function public.register_signature_acceptance(text, text) from public, anon, authenticated;
grant execute on function public.register_signature_acceptance(text, text) to service_role;

create table public.contract_audit_logs (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid references public.contracts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index contract_audit_contract_created_idx on public.contract_audit_logs(contract_id, created_at desc);

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  number integer not null check (number > 0),
  amount numeric(14,2) not null check (amount > 0),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'partial', 'overdue', 'cancelled')),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, number)
);

create table public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  installment_id uuid references public.installments(id) on delete set null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  receipt_number text not null,
  payer_name text not null,
  receiver_name text not null,
  amount numeric(14,2) not null check (amount > 0),
  paid_on date not null,
  description text not null,
  file_path text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (owner_id, receipt_number)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  scheduled_for timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_owner_created_idx on public.notifications(owner_id, created_at desc);

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_notifications boolean not null default true,
  push_notifications boolean not null default false,
  retention_days integer not null default 365 check (retention_days between 30 and 3650),
  updated_at timestamptz not null default now()
);

create table public.sync_operations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  operation_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'conflict')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key)
);

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'frequent_parties', 'contract_clauses', 'contract_templates',
    'contracts', 'interview_sessions', 'contract_answers', 'contract_signatures',
    'installments', 'user_preferences', 'sync_operations'
  ]
  loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute procedure public.set_updated_at()', table_name);
  end loop;
end;
$$;

alter table public.profiles enable row level security;
alter table public.frequent_parties enable row level security;
alter table public.contract_categories enable row level security;
alter table public.contract_types enable row level security;
alter table public.contract_clauses enable row level security;
alter table public.contract_templates enable row level security;
alter table public.contract_template_versions enable row level security;
alter table public.contract_template_clauses enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_parties enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.interview_messages enable row level security;
alter table public.contract_answers enable row level security;
alter table public.contract_attachments enable row level security;
alter table public.contract_versions enable row level security;
alter table public.contract_signatures enable row level security;
alter table public.signature_tokens enable row level security;
alter table public.contract_audit_logs enable row level security;
alter table public.installments enable row level security;
alter table public.payment_receipts enable row level security;
alter table public.notifications enable row level security;
alter table public.user_preferences enable row level security;
alter table public.sync_operations enable row level security;

create policy "Profiles are private to their owner" on public.profiles
  for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "Users manage their frequent parties" on public.frequent_parties
  for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Authenticated users can read active categories" on public.contract_categories
  for select to authenticated using (is_active);
create policy "Authenticated users can read active contract types" on public.contract_types
  for select to authenticated using (is_active);
create policy "Authenticated users can read active clauses" on public.contract_clauses
  for select to authenticated using (is_active);
create policy "Authenticated users can read active templates" on public.contract_templates
  for select to authenticated using (is_active);
create policy "Authenticated users can read template versions" on public.contract_template_versions
  for select to authenticated using (
    exists (select 1 from public.contract_templates t where t.id = template_id and t.is_active)
  );
create policy "Authenticated users can read template clause links" on public.contract_template_clauses
  for select to authenticated using (
    exists (select 1 from public.contract_templates t where t.id = template_id and t.is_active)
  );
create policy "Users manage their contracts" on public.contracts
  for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Contract parties follow contract ownership" on public.contract_parties
  for all to authenticated using (
    owner_id = (select auth.uid()) and exists (select 1 from public.contracts c where c.id = contract_id and c.owner_id = (select auth.uid()))
  ) with check (
    owner_id = (select auth.uid()) and exists (select 1 from public.contracts c where c.id = contract_id and c.owner_id = (select auth.uid()))
  );
create policy "Users manage their interview sessions" on public.interview_sessions
  for all to authenticated using ((select auth.uid()) = owner_id) with check (
    (select auth.uid()) = owner_id and exists (select 1 from public.contracts c where c.id = contract_id and c.owner_id = (select auth.uid()))
  );
create policy "Users manage their interview messages" on public.interview_messages
  for all to authenticated using (
    owner_id = (select auth.uid()) and exists (select 1 from public.interview_sessions s where s.id = session_id and s.owner_id = (select auth.uid()))
  ) with check (
    owner_id = (select auth.uid()) and exists (select 1 from public.interview_sessions s where s.id = session_id and s.owner_id = (select auth.uid()))
  );
create policy "Users manage their contract answers" on public.contract_answers
  for all to authenticated using (
    owner_id = (select auth.uid()) and exists (select 1 from public.contracts c where c.id = contract_id and c.owner_id = (select auth.uid()))
  ) with check (
    owner_id = (select auth.uid()) and exists (select 1 from public.contracts c where c.id = contract_id and c.owner_id = (select auth.uid()))
  );
create policy "Users manage their contract attachments" on public.contract_attachments
  for all to authenticated using (
    owner_id = (select auth.uid()) and exists (select 1 from public.contracts c where c.id = contract_id and c.owner_id = (select auth.uid()))
  ) with check (
    owner_id = (select auth.uid()) and exists (select 1 from public.contracts c where c.id = contract_id and c.owner_id = (select auth.uid()))
  );
create policy "Users read their contract versions" on public.contract_versions
  for select to authenticated using (
    exists (select 1 from public.contracts c where c.id = contract_id and c.owner_id = (select auth.uid()))
  );
create policy "Users create their contract versions" on public.contract_versions
  for insert to authenticated with check (
    exists (select 1 from public.contracts c where c.id = contract_id and c.owner_id = (select auth.uid()))
  );
create policy "Users read their contract signatures" on public.contract_signatures
  for select to authenticated using (
    owner_id = (select auth.uid()) and exists (select 1 from public.contracts c where c.id = contract_id and c.owner_id = (select auth.uid()))
  );
create policy "Users create their contract signatures" on public.contract_signatures
  for insert to authenticated with check (
    owner_id = (select auth.uid()) and exists (select 1 from public.contracts c where c.id = contract_id and c.owner_id = (select auth.uid()))
  );
create policy "Users read audit events" on public.contract_audit_logs
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "Users create own audit events" on public.contract_audit_logs
  for insert to authenticated with check (owner_id = (select auth.uid()) and (actor_id is null or actor_id = (select auth.uid())));
create policy "Users manage their installments" on public.installments
  for all to authenticated using (
    owner_id = (select auth.uid()) and exists (select 1 from public.contracts c where c.id = contract_id and c.owner_id = (select auth.uid()))
  ) with check (
    owner_id = (select auth.uid()) and exists (select 1 from public.contracts c where c.id = contract_id and c.owner_id = (select auth.uid()))
  );
create policy "Users manage their receipts" on public.payment_receipts
  for all to authenticated using (
    owner_id = (select auth.uid()) and exists (select 1 from public.contracts c where c.id = contract_id and c.owner_id = (select auth.uid()))
  ) with check (
    owner_id = (select auth.uid()) and exists (select 1 from public.contracts c where c.id = contract_id and c.owner_id = (select auth.uid()))
  );
create policy "Users manage their notifications" on public.notifications
  for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Users manage their preferences" on public.user_preferences
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage their sync operations" on public.sync_operations
  for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on
  public.profiles,
  public.frequent_parties,
  public.contracts,
  public.contract_parties,
  public.interview_sessions,
  public.interview_messages,
  public.contract_answers,
  public.contract_attachments,
  public.installments,
  public.payment_receipts,
  public.notifications,
  public.user_preferences,
  public.sync_operations
to authenticated;
grant select on
  public.contract_categories,
  public.contract_types,
  public.contract_clauses,
  public.contract_templates,
  public.contract_template_versions,
  public.contract_template_clauses,
  public.contract_versions,
  public.contract_signatures,
  public.contract_audit_logs
to authenticated;
grant insert on public.contract_versions, public.contract_signatures, public.contract_audit_logs to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('contract-documents', 'contract-documents', false, 10485760, array['application/pdf']),
  ('contract-attachments', 'contract-attachments', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('ocr-private', 'ocr-private', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Users manage files in their own folder" on storage.objects
  for all to authenticated using (
    bucket_id in ('contract-documents', 'contract-attachments', 'ocr-private')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  ) with check (
    bucket_id in ('contract-documents', 'contract-attachments', 'ocr-private')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

comment on column public.contract_versions.sha256 is 'SHA-256 do PDF individual desta versão; frase de autoria: Deus acima de tudo, familia em primeiro lugar.';
