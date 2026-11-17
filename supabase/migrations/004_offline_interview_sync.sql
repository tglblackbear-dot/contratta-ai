alter table public.interview_messages
  add column client_operation_id uuid;

create unique index interview_messages_operation_unique_idx
  on public.interview_messages(session_id, client_operation_id, role)
  where client_operation_id is not null;

create or replace function public.commit_interview_operation(
  p_session_id uuid,
  p_owner_id uuid,
  p_operation_id uuid,
  p_expected_version integer,
  p_user_message text,
  p_assistant_content text,
  p_fields jsonb,
  p_missing_fields jsonb,
  p_progress integer,
  p_state text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  current_session public.interview_sessions%rowtype;
  existing_content text;
begin
  if auth.uid() is distinct from p_owner_id then
    raise exception 'User does not own this interview' using errcode = '42501';
  end if;
  if p_session_id is null
    or p_operation_id is null
    or p_expected_version is null
    or p_expected_version < 1
    or p_progress is null
    or p_progress not between 0 and 100
    or p_state is null
    or p_state not in ('COLLECTING_CONDITIONS', 'READY_TO_GENERATE')
    or jsonb_typeof(p_fields) is distinct from 'object'
    or jsonb_typeof(p_missing_fields) is distinct from 'array'
    or p_user_message is null
    or length(p_user_message) not between 1 and 4000
    or p_assistant_content is null
    or length(p_assistant_content) > 12000
  then
    raise exception 'Invalid interview operation' using errcode = '22023';
  end if;

  select * into current_session
  from public.interview_sessions
  where id = p_session_id and owner_id = p_owner_id
  for update;
  if not found then
    raise exception 'Interview not found' using errcode = 'P0002';
  end if;

  select content into existing_content
  from public.interview_messages
  where session_id = p_session_id
    and owner_id = p_owner_id
    and client_operation_id = p_operation_id
    and role = 'assistant';
  if found then
    return jsonb_build_object(
      'status', 'completed',
      'assistant_content', existing_content,
      'session_version', current_session.version
    );
  end if;

  if current_session.version <> p_expected_version then
    return jsonb_build_object(
      'status', 'conflict',
      'session_version', current_session.version
    );
  end if;

  insert into public.interview_messages (
    session_id, owner_id, role, content, client_operation_id
  ) values (
    p_session_id, p_owner_id, 'user', p_user_message, p_operation_id
  );
  insert into public.interview_messages (
    session_id, owner_id, role, content, client_operation_id
  ) values (
    p_session_id, p_owner_id, 'assistant', p_assistant_content, p_operation_id
  );
  update public.interview_sessions
  set fields = p_fields,
      missing_fields = p_missing_fields,
      progress = p_progress,
      version = current_session.version + 1,
      state = p_state
  where id = p_session_id and owner_id = p_owner_id;
  update public.contracts
  set interview_data = p_fields
  where id = current_session.contract_id and owner_id = p_owner_id;
  if not found then
    raise exception 'Contract not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'status', 'completed',
    'assistant_content', p_assistant_content,
    'session_version', current_session.version + 1
  );
end;
$$;

revoke all on function public.commit_interview_operation(
  uuid, uuid, uuid, integer, text, text, jsonb, jsonb, integer, text
) from public, anon;
grant execute on function public.commit_interview_operation(
  uuid, uuid, uuid, integer, text, text, jsonb, jsonb, integer, text
) to authenticated;
