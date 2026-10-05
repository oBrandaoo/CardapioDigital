-- Cardápio Musical: relational foundation.
-- No copyrighted catalog items or payment-provider records are seeded here.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated;

create table if not exists public.musicians (
  id uuid primary key references auth.users (id) on delete cascade,
  slug text not null unique check (slug = lower(slug) and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  stage_name text not null check (char_length(stage_name) between 1 and 80),
  bio text check (bio is null or char_length(bio) <= 500),
  city text check (city is null or char_length(city) <= 100),
  profile_is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.musician_licenses (
  musician_id uuid primary key references public.musicians (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'expired', 'suspended')),
  starts_at timestamptz,
  ends_at timestamptz,
  internal_note text check (internal_note is null or char_length(internal_note) <= 1000),
  granted_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint musician_license_period_check check (
    (starts_at is null and ends_at is null)
    or (starts_at is not null and ends_at is not null and ends_at > starts_at)
  )
);

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  musician_name text;
  base_slug text;
begin
  musician_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'stage_name'), ''),
    'Músico'
  );
  base_slug := btrim(
    regexp_replace(lower(musician_name), '[^a-z0-9]+', '-', 'g'),
    '-'
  );

  insert into public.musicians (id, slug, stage_name)
  values (
    new.id,
    coalesce(nullif(base_slug, ''), 'musico') || '-' || left(replace(new.id::text, '-', ''), 8),
    musician_name
  );

  insert into public.musician_licenses (musician_id, status)
  values (new.id, 'pending');

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public;

drop trigger if exists on_auth_user_created_cardapio on auth.users;
create trigger on_auth_user_created_cardapio
  after insert on auth.users
  for each row execute procedure private.handle_new_auth_user();

create table if not exists public.catalog_songs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  artist text not null check (char_length(artist) between 1 and 160),
  composers text[] not null default '{}',
  version_label text not null default 'Original',
  original_key text check (original_key is null or char_length(original_key) <= 8),
  chord_sheet text not null check (char_length(chord_sheet) between 1 and 40000),
  source_reference text,
  rights_basis text,
  rights_territories text[] not null default '{}',
  rights_valid_until date,
  rights_status text not null default 'pending'
    check (rights_status in ('pending', 'approved', 'rejected', 'expired', 'disputed')),
  rights_reviewed_at timestamptz,
  rights_reviewed_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approved_song_has_rights_record check (
    rights_status <> 'approved'
    or (
      nullif(btrim(source_reference), '') is not null
      and nullif(btrim(rights_basis), '') is not null
      and cardinality(rights_territories) > 0
      and rights_reviewed_at is not null
    )
  )
);

create table if not exists public.performances (
  id uuid primary key default gen_random_uuid(),
  musician_id uuid not null references public.musicians (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  status text not null default 'closed' check (status in ('active', 'closed')),
  starts_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists one_active_performance_per_musician
  on public.performances (musician_id)
  where status = 'active';

create table if not exists public.repertoire_items (
  id uuid primary key default gen_random_uuid(),
  musician_id uuid not null references public.musicians (id) on delete cascade,
  song_id uuid not null references public.catalog_songs (id) on delete restrict,
  price_cents integer not null default 0 check (price_cents between 0 and 500),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (musician_id, song_id)
);

create table if not exists public.music_requests (
  id uuid primary key default gen_random_uuid(),
  musician_id uuid not null references public.musicians (id) on delete cascade,
  performance_id uuid not null references public.performances (id) on delete cascade,
  song_id uuid not null references public.catalog_songs (id) on delete restrict,
  requester_name text check (requester_name is null or char_length(requester_name) <= 60),
  requester_token uuid not null,
  price_cents integer not null default 0 check (price_cents between 0 and 500),
  payment_status text not null default 'not_required'
    check (payment_status in ('not_required', 'pending', 'paid', 'failed', 'refunded')),
  status text not null default 'queued' check (status in ('queued', 'played', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint free_request_has_no_payment check (
    price_cents > 0 or payment_status = 'not_required'
  )
);

create index if not exists performances_musician_status_idx
  on public.performances (musician_id, status, starts_at desc);
create index if not exists repertoire_musician_enabled_idx
  on public.repertoire_items (musician_id, is_enabled, song_id);
create index if not exists music_requests_musician_queue_idx
  on public.music_requests (musician_id, status, created_at);
create index if not exists music_requests_performance_queue_idx
  on public.music_requests (performance_id, status, created_at);
create index if not exists music_requests_visitor_window_idx
  on public.music_requests (requester_token, created_at desc);
create index if not exists catalog_songs_search_idx
  on public.catalog_songs using gin (to_tsvector('simple', title || ' ' || artist));

-- This narrow helper exposes only a boolean; the license table itself stays private.
create or replace function private.has_active_license(target_musician_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.musician_licenses as license
    where license.musician_id = target_musician_id
      and license.status = 'active'
      and license.starts_at <= statement_timestamp()
      and license.ends_at > statement_timestamp()
  );
$$;

revoke all on function private.has_active_license(uuid) from public;
grant execute on function private.has_active_license(uuid) to anon, authenticated;

alter table public.musicians enable row level security;
alter table public.musician_licenses enable row level security;
alter table public.catalog_songs enable row level security;
alter table public.performances enable row level security;
alter table public.repertoire_items enable row level security;
alter table public.music_requests enable row level security;

revoke all on public.musicians from anon, authenticated;
revoke all on public.musician_licenses from anon, authenticated;
revoke all on public.catalog_songs from anon, authenticated;
revoke all on public.performances from anon, authenticated;
revoke all on public.repertoire_items from anon, authenticated;
revoke all on public.music_requests from anon, authenticated;

grant select on public.musicians to anon, authenticated;
grant insert, select, update on public.musicians to authenticated;
grant select on public.musician_licenses to authenticated;
grant insert, update, delete, select on public.musician_licenses to authenticated;
grant select (id, title, artist) on public.catalog_songs to anon;
grant select, insert, update, delete on public.catalog_songs to authenticated;
grant select on public.performances to anon, authenticated;
grant insert, update, delete on public.performances to authenticated;
grant select on public.repertoire_items to anon, authenticated;
grant insert, update, delete on public.repertoire_items to authenticated;
grant select on public.music_requests to authenticated;
grant update (status) on public.music_requests to authenticated;

create policy musicians_read_public_or_owner
  on public.musicians for select to anon, authenticated
  using (
    auth.uid() = id
    or coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
    or (profile_is_public and private.has_active_license(id))
  );

create policy musicians_insert_self
  on public.musicians for insert to authenticated
  with check (auth.uid() = id);

create policy musicians_update_self
  on public.musicians for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy licenses_read_owner_or_admin
  on public.musician_licenses for select to authenticated
  using (
    musician_id = auth.uid()
    or coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
  );

create policy licenses_admin_manage
  on public.musician_licenses for all to authenticated
  using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin')
  with check (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');

create policy catalog_read_approved_rights
  on public.catalog_songs for select to anon, authenticated
  using (
    rights_status = 'approved'
    and rights_reviewed_at is not null
    and (rights_valid_until is null or rights_valid_until >= current_date)
    and 'BR' = any(rights_territories)
  );

create policy catalog_admin_manage
  on public.catalog_songs for all to authenticated
  using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin')
  with check (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');

create policy performances_read_owner_or_public_active
  on public.performances for select to anon, authenticated
  using (
    musician_id = auth.uid()
    or (
      status = 'active'
      and exists (
        select 1
        from public.musicians as musician
        where musician.id = performances.musician_id
          and musician.profile_is_public
          and private.has_active_license(musician.id)
      )
    )
  );

create policy performances_insert_owner
  on public.performances for insert to authenticated
  with check (musician_id = auth.uid() and private.has_active_license(auth.uid()));

create policy performances_update_owner
  on public.performances for update to authenticated
  using (musician_id = auth.uid() and private.has_active_license(auth.uid()))
  with check (musician_id = auth.uid() and private.has_active_license(auth.uid()));

create policy performances_delete_owner
  on public.performances for delete to authenticated
  using (musician_id = auth.uid());

create policy repertoire_read_owner_or_public
  on public.repertoire_items for select to anon, authenticated
  using (
    musician_id = auth.uid()
    or (
      is_enabled
      and private.has_active_license(musician_id)
      and exists (
        select 1
        from public.musicians as musician
        where musician.id = repertoire_items.musician_id
          and musician.profile_is_public
      )
    )
  );

create policy repertoire_insert_owner_approved_song
  on public.repertoire_items for insert to authenticated
  with check (
    musician_id = auth.uid()
    and private.has_active_license(auth.uid())
    and exists (
      select 1
      from public.catalog_songs as song
      where song.id = repertoire_items.song_id
        and song.rights_status = 'approved'
        and (song.rights_valid_until is null or song.rights_valid_until >= current_date)
        and 'BR' = any(song.rights_territories)
    )
  );

create policy repertoire_update_owner_approved_song
  on public.repertoire_items for update to authenticated
  using (musician_id = auth.uid() and private.has_active_license(auth.uid()))
  with check (
    musician_id = auth.uid()
    and private.has_active_license(auth.uid())
    and exists (
      select 1
      from public.catalog_songs as song
      where song.id = repertoire_items.song_id
        and song.rights_status = 'approved'
        and (song.rights_valid_until is null or song.rights_valid_until >= current_date)
        and 'BR' = any(song.rights_territories)
    )
  );

create policy repertoire_delete_owner
  on public.repertoire_items for delete to authenticated
  using (musician_id = auth.uid());

create policy requests_read_owner_or_admin
  on public.music_requests for select to authenticated
  using (
    musician_id = auth.uid()
    or coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin'
  );

create policy requests_update_free_owner_status
  on public.music_requests for update to authenticated
  using (
    musician_id = auth.uid()
    and payment_status = 'not_required'
    and private.has_active_license(auth.uid())
  )
  with check (
    musician_id = auth.uid()
    and payment_status = 'not_required'
    and private.has_active_license(auth.uid())
  );

-- The public app cannot write to the request table. The server-only RPC validates
-- show status, license, approved catalog rights, free price and per-visitor limits.
create or replace function public.submit_free_request(
  p_performance_id uuid,
  p_song_id uuid,
  p_requester_name text,
  p_visitor_token uuid
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
    and (song.rights_valid_until is null or song.rights_valid_until >= current_date)
    and 'BR' = any(song.rights_territories)
  for share of performance, musician, license, repertoire, song;

  if target_musician_id is null then
    raise exception using errcode = 'P0002', message = 'Request unavailable';
  end if;

  if target_price_cents <> 0 then
    raise exception using errcode = 'P0001', message = 'Paid requests are not enabled';
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
    musician_id,
    performance_id,
    song_id,
    requester_name,
    requester_token,
    price_cents,
    payment_status,
    status
  ) values (
    target_musician_id,
    p_performance_id,
    p_song_id,
    nullif(pg_catalog.left(pg_catalog.btrim(p_requester_name), 60), ''),
    p_visitor_token,
    0,
    'not_required',
    'queued'
  )
  returning id into created_request_id;

  return created_request_id;
end;
$$;

revoke all on function public.submit_free_request(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.submit_free_request(uuid, uuid, text, uuid) to service_role;

do $$
begin
  alter publication supabase_realtime add table public.music_requests;
exception
  when duplicate_object then null;
end;
$$;

comment on table public.catalog_songs is
  'Central catalog. Public reads are restricted to approved entries with a current BR rights record.';
comment on column public.catalog_songs.chord_sheet is
  'Chord sheet content; publish only after the rights record is approved.';
comment on table public.musician_licenses is
  'Internal annual license status and period; not a payment processor ledger.';
comment on table public.music_requests is
  'Request records. Public inserts are only allowed through the server-only free-request RPC.';
