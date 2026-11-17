alter table public.contract_attachments
  add column ocr_status text not null default 'not_requested'
    check (ocr_status in ('not_requested', 'pending', 'processing', 'completed', 'failed')),
  add column ocr_result jsonb,
  add column ocr_processed_at timestamptz;

create index contract_attachments_owner_created_idx
  on public.contract_attachments(owner_id, created_at desc);
