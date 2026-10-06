-- The catalog records authorization evidence and terms without separate
-- origin or territory columns. Historical source references become the
-- authorization reference and must be checked during review.

alter table public.catalog_songs
  add column if not exists authorization_reference text;

update public.catalog_songs
set authorization_reference = source_reference
where authorization_reference is null and source_reference is not null;

-- The old field accepted either provenance or a document reference. Do not
-- treat its contents as proof of authorization without a new review.
update public.catalog_songs
set rights_status = 'pending', rights_reviewed_at = null, rights_reviewed_by = null
where rights_status = 'approved';

drop policy if exists catalog_read_approved_rights on public.catalog_songs;
drop policy if exists repertoire_read_owner_or_public on public.repertoire_items;
drop policy if exists repertoire_insert_owner_approved_song on public.repertoire_items;
drop policy if exists repertoire_update_owner_approved_song on public.repertoire_items;
alter table public.catalog_songs drop constraint if exists approved_song_has_rights_record;

drop function if exists public.submit_free_request(uuid, uuid, text, uuid);

alter table public.catalog_songs
  drop column if exists source_reference,
  drop column if exists rights_territories;

alter table public.catalog_songs
  add constraint approved_song_has_rights_record check (
    rights_status <> 'approved'
    or (
      nullif(btrim(authorization_reference), '') is not null
      and nullif(btrim(rights_basis), '') is not null
      and rights_reviewed_at is not null
    )
  );

create policy catalog_read_approved_rights
  on public.catalog_songs for select to anon, authenticated
  using (
    rights_status = 'approved'
    and rights_reviewed_at is not null
    and (rights_valid_until is null or rights_valid_until >= current_date)
  );

create policy repertoire_read_owner_or_public
  on public.repertoire_items for select to anon, authenticated
  using (
    musician_id = auth.uid()
    or (
      is_enabled
      and private.has_active_license(musician_id)
      and exists (
        select 1 from public.musicians as musician
        where musician.id = repertoire_items.musician_id
          and musician.profile_is_public
      )
      and exists (
        select 1 from public.catalog_songs as song
        where song.id = repertoire_items.song_id
          and song.rights_status = 'approved'
          and song.rights_reviewed_at is not null
          and (song.rights_valid_until is null or song.rights_valid_until >= current_date)
      )
    )
  );

create policy repertoire_insert_owner_approved_song
  on public.repertoire_items for insert to authenticated
  with check (
    musician_id = auth.uid()
    and private.has_active_license(auth.uid())
    and exists (
      select 1 from public.catalog_songs as song
      where song.id = repertoire_items.song_id
        and song.rights_status = 'approved'
        and song.rights_reviewed_at is not null
        and (song.rights_valid_until is null or song.rights_valid_until >= current_date)
    )
  );

create policy repertoire_update_owner_approved_song
  on public.repertoire_items for update to authenticated
  using (musician_id = auth.uid() and private.has_active_license(auth.uid()))
  with check (
    musician_id = auth.uid()
    and private.has_active_license(auth.uid())
    and exists (
      select 1 from public.catalog_songs as song
      where song.id = repertoire_items.song_id
        and song.rights_status = 'approved'
        and song.rights_reviewed_at is not null
        and (song.rights_valid_until is null or song.rights_valid_until >= current_date)
    )
  );

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
  join public.musicians as musician on musician.id = performance.musician_id
  join public.musician_licenses as license on license.musician_id = musician.id
  join public.repertoire_items as repertoire
    on repertoire.musician_id = musician.id and repertoire.song_id = p_song_id
  join public.catalog_songs as song on song.id = repertoire.song_id
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
  for share of performance, musician, license, repertoire, song;

  if target_musician_id is null or target_price_cents is null
    or target_price_cents < 0 or target_price_cents > 500 then
    raise exception using errcode = 'P0002', message = 'Request unavailable';
  end if;
  if target_price_cents > 0 and not coalesce(p_mock_payment_enabled, false) then
    raise exception using errcode = 'P0002', message = 'Paid requests are not enabled';
  end if;

  if (
    select pg_catalog.count(*) from public.music_requests as recent_request
    where recent_request.requester_token = p_visitor_token
      and recent_request.created_at > pg_catalog.statement_timestamp() - interval '10 minutes'
  ) >= 5 then
    raise exception using errcode = 'P0001', message = 'Request limit reached';
  end if;

  if exists (
    select 1 from public.music_requests as duplicate_request
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
    target_musician_id, p_performance_id, p_song_id,
    nullif(pg_catalog.left(pg_catalog.btrim(p_requester_name), 60), ''),
    p_visitor_token, target_price_cents,
    case when target_price_cents = 0 then 'not_required' else 'pending' end,
    case when target_price_cents = 0 then 'queued' else 'awaiting_payment' end
  ) returning id into created_request_id;

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
  where request.id = p_request_id and request.requester_token = p_visitor_token
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
    join public.musicians as musician on musician.id = performance.musician_id
    join public.musician_licenses as license on license.musician_id = musician.id
    join public.repertoire_items as repertoire
      on repertoire.musician_id = musician.id and repertoire.song_id = target_request.song_id
    join public.catalog_songs as song on song.id = repertoire.song_id
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

comment on table public.catalog_songs is
  'Central catalog. Public reads are restricted to approved entries with a current authorization record.';
comment on column public.catalog_songs.authorization_reference is
  'Document or license reference supporting authorization; not the origin of the chord sheet.';
