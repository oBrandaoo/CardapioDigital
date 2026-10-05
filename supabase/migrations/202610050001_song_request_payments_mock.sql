-- Requests use the repertoire price captured by the database.
-- Mock payment is for local development only and is never a real payment.

alter table public.music_requests
  drop constraint if exists music_requests_payment_status_check,
  drop constraint if exists music_requests_status_check;

alter table public.music_requests
  add constraint music_requests_payment_status_check
    check (payment_status in ('not_required', 'pending', 'mock_paid', 'paid', 'failed', 'refunded')),
  add constraint music_requests_status_check
    check (status in ('awaiting_payment', 'queued', 'played', 'cancelled'));

drop policy if exists requests_update_free_owner_status on public.music_requests;
drop policy if exists requests_update_owner_status_after_payment on public.music_requests;
create policy requests_update_owner_status_after_payment
  on public.music_requests for update to authenticated
  using (
    musician_id = auth.uid()
    and payment_status in ('not_required', 'mock_paid', 'paid')
    and private.has_active_license(auth.uid())
  )
  with check (
    musician_id = auth.uid()
    and payment_status in ('not_required', 'mock_paid', 'paid')
    and (payment_status = 'not_required' or status = 'played')
    and private.has_active_license(auth.uid())
  );

revoke all on function public.submit_free_request(uuid, uuid, text, uuid) from public, anon, authenticated, service_role;

create or replace function public.submit_song_request(
  p_performance_id uuid,
  p_song_id uuid,
  p_requester_name text,
  p_visitor_token uuid,
  p_mock_payment_enabled boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_musician_id uuid;
  target_price_cents integer;
  created_request_id uuid;
begin
  if p_visitor_token is null then
    raise exception using errcode = '22023', message = 'Invalid request';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_visitor_token::text, 0)
  );

  select performance.musician_id, repertoire.price_cents
    into target_musician_id, target_price_cents
  from public.performances as performance
  join public.musicians as musician
    on musician.id = performance.musician_id
  join public.musician_licenses as license
    on license.musician_id = musician.id
  join public.repertoire_items as repertoire
    on repertoire.musician_id = musician.id
   and repertoire.song_id = p_song_id
  join public.catalog_songs as song
    on song.id = repertoire.song_id
  where performance.id = p_performance_id
    and performance.status = 'active'
    and musician.profile_is_public
    and license.status = 'active'
    and license.starts_at <= pg_catalog.statement_timestamp()
    and license.ends_at > pg_catalog.statement_timestamp()
    and repertoire.is_enabled
    and song.rights_status = 'approved'
    and song.rights_reviewed_at is not null
    and (song.rights_valid_until is null or song.rights_valid_until >= current_date)
    and 'BR' = any(song.rights_territories)
  for share of performance, musician, license, repertoire, song;

  if target_musician_id is null or target_price_cents is null then
    raise exception using errcode = 'P0002', message = 'Request unavailable';
  end if;

  if target_price_cents < 0 or target_price_cents > 500 then
    raise exception using errcode = 'P0002', message = 'Request unavailable';
  end if;

  if target_price_cents > 0 and not coalesce(p_mock_payment_enabled, false) then
    raise exception using errcode = 'P0002', message = 'Paid requests are not enabled';
  end if;

  if (
    select pg_catalog.count(*)
    from public.music_requests as recent_request
    where recent_request.requester_token = p_visitor_token
      and recent_request.created_at > pg_catalog.statement_timestamp() - interval '10 minutes'
  ) >= 5 then
    raise exception using errcode = 'P0001', message = 'Request limit reached';
  end if;

  if exists (
    select 1
    from public.music_requests as duplicate_request
    where duplicate_request.requester_token = p_visitor_token
      and duplicate_request.performance_id = p_performance_id
      and duplicate_request.song_id = p_song_id
      and duplicate_request.created_at > pg_catalog.statement_timestamp() - interval '2 minutes'
  ) then
    raise exception using errcode = '23505', message = 'Duplicate request';
  end if;

  insert into public.music_requests (
    musician_id, performance_id, song_id, requester_name, requester_token,
    price_cents, payment_status, status
  ) values (
    target_musician_id,
    p_performance_id,
    p_song_id,
    nullif(pg_catalog.left(pg_catalog.btrim(p_requester_name), 60), ''),
    p_visitor_token,
    target_price_cents,
    case when target_price_cents = 0 then 'not_required' else 'pending' end,
    case when target_price_cents = 0 then 'queued' else 'awaiting_payment' end
  )
  returning id into created_request_id;

  return created_request_id;
end;
$$;

revoke all on function public.submit_song_request(uuid, uuid, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.submit_song_request(uuid, uuid, text, uuid, boolean) to service_role;

create or replace function public.confirm_mock_request(
  p_request_id uuid,
  p_visitor_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_request public.music_requests%rowtype;
begin
  if p_request_id is null or p_visitor_token is null then
    raise exception using errcode = '22023', message = 'Invalid request';
  end if;

  select * into target_request
  from public.music_requests as request
  where request.id = p_request_id
    and request.requester_token = p_visitor_token
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Request unavailable';
  end if;

  if target_request.payment_status = 'mock_paid'
    and target_request.status in ('queued', 'played', 'cancelled') then
    return true;
  end if;

  if target_request.payment_status <> 'pending'
    or target_request.status <> 'awaiting_payment'
    or target_request.price_cents not between 1 and 500 then
    raise exception using errcode = 'P0002', message = 'Request unavailable';
  end if;

  if not exists (
    select 1
    from public.performances as performance
    join public.musicians as musician
      on musician.id = performance.musician_id
    join public.musician_licenses as license
      on license.musician_id = musician.id
    join public.repertoire_items as repertoire
      on repertoire.musician_id = musician.id
     and repertoire.song_id = target_request.song_id
    join public.catalog_songs as song
      on song.id = repertoire.song_id
    where performance.id = target_request.performance_id
      and performance.musician_id = target_request.musician_id
      and performance.status = 'active'
      and musician.profile_is_public
      and license.status = 'active'
      and license.starts_at <= pg_catalog.statement_timestamp()
      and license.ends_at > pg_catalog.statement_timestamp()
      and repertoire.is_enabled
      and song.rights_status = 'approved'
      and song.rights_reviewed_at is not null
      and (song.rights_valid_until is null or song.rights_valid_until >= current_date)
      and 'BR' = any(song.rights_territories)
  ) then
    raise exception using errcode = 'P0002', message = 'Request unavailable';
  end if;

  update public.music_requests
  set payment_status = 'mock_paid', status = 'queued'
  where id = target_request.id
    and requester_token = p_visitor_token
    and payment_status = 'pending'
    and status = 'awaiting_payment';

  return found;
end;
$$;

revoke all on function public.confirm_mock_request(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_mock_request(uuid, uuid) to service_role;

comment on column public.music_requests.payment_status is
  'mock_paid is a local-development simulation only; it is not provider-confirmed payment.';
comment on table public.music_requests is
  'Public requests are created only through the server-side submit_song_request RPC.';
comment on column public.catalog_songs.chord_sheet is
  'Plain-text chord sheet content (TXT), stored with its central catalog song; publish only with approved rights.';
