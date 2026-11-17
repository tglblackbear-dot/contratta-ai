create unique index payment_receipts_installment_unique_idx
  on public.payment_receipts (installment_id)
  where installment_id is not null;
