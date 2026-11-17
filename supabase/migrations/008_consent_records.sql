create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (owner_id, terms_version, privacy_version)
);
create index consent_records_owner_created_idx on public.consent_records(owner_id, created_at desc);
alter table public.consent_records enable row level security;
create policy "Users can read their own consent records" on public.consent_records
  for select to authenticated using ((select auth.uid()) = owner_id);
grant select on public.consent_records to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  terms_version text := new.raw_user_meta_data ->> 'terms_version';
  privacy_version text := new.raw_user_meta_data ->> 'privacy_version';
  accepted_at timestamptz;
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  insert into public.user_preferences (user_id)
  values (new.id);

  begin
    accepted_at := nullif(new.raw_user_meta_data ->> 'terms_accepted_at', '')::timestamptz;
  exception when others then
    accepted_at := null;
  end;
  if terms_version ~ '^[0-9]{4}-[0-9]{2}$'
    and privacy_version ~ '^[0-9]{4}-[0-9]{2}$'
    and accepted_at is not null
    and accepted_at <= now()
  then
    insert into public.consent_records (owner_id, terms_version, privacy_version, accepted_at)
    values (new.id, terms_version, privacy_version, accepted_at);
  end if;

  return new;
end;
$$;
