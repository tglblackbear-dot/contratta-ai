create or replace function public.start_interview_session(
  p_template_id uuid,
  p_title text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_template public.contract_templates%rowtype;
  new_contract_id uuid;
  missing_fields jsonb;
  contract_title text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_template_id is null or (p_title is not null and length(btrim(p_title)) > 200) then
    raise exception 'Invalid interview details' using errcode = '22023';
  end if;

  select * into selected_template
  from public.contract_templates
  where id = p_template_id and is_active;
  if not found then
    raise exception 'Active template not found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(field ->> 'key'), '[]'::jsonb)
  into missing_fields
  from jsonb_array_elements(selected_template.fields) as field
  where field ->> 'required' = 'true'
    and nullif(field ->> 'key', '') is not null;

  contract_title := coalesce(nullif(btrim(p_title), ''), selected_template.name);

  insert into public.contracts (
    owner_id, template_id, title, contract_type, status, interview_data
  ) values (
    current_user_id,
    selected_template.id,
    contract_title,
    selected_template.slug,
    'in_progress',
    '{}'::jsonb
  )
  returning id into new_contract_id;

  insert into public.interview_sessions (
    id, owner_id, contract_id, state, fields, missing_fields, progress, version
  ) values (
    new_contract_id,
    current_user_id,
    new_contract_id,
    'INITIAL',
    '{}'::jsonb,
    missing_fields,
    0,
    1
  );

  insert into public.interview_messages (session_id, owner_id, role, content)
  values (
    new_contract_id,
    current_user_id,
    'assistant',
    format(
      'Vamos preparar %s. Conte, com suas palavras, o que você já sabe sobre este acordo. Você pode incluir várias informações na mesma mensagem.',
      lower(selected_template.name)
    )
  );

  return new_contract_id;
end;
$$;

revoke all on function public.start_interview_session(uuid, text) from public, anon;
grant execute on function public.start_interview_session(uuid, text) to authenticated;
