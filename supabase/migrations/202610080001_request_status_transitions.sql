-- A musician may resolve only a queued request. Paid requests can be marked
-- played; cancellation remains limited to free requests until the refund
-- policy and payment-provider flow are defined.

drop policy if exists requests_update_owner_status_after_payment on public.music_requests;

create policy requests_update_owner_status_after_payment
  on public.music_requests for update to authenticated
  using (
    musician_id = auth.uid()
    and status = 'queued'
    and payment_status in ('not_required', 'mock_paid', 'paid')
    and private.has_active_license(auth.uid())
  )
  with check (
    musician_id = auth.uid()
    and private.has_active_license(auth.uid())
    and (
      (status = 'played' and payment_status in ('not_required', 'mock_paid', 'paid'))
      or (status = 'cancelled' and payment_status = 'not_required')
    )
  );
