-- Record administrative catalog changes without exposing chord content.
-- Prevent new duplicate title/artist/version combinations, including concurrent imports.
create or replace function private.prevent_catalog_song_duplicate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  song_key text;
begin
  song_key := pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(new.title), '[[:space:]]+', ' ', 'g')) || '|' ||
    pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(new.artist), '[[:space:]]+', ' ', 'g')) || '|' ||
    pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(new.version_label), '[[:space:]]+', ' ', 'g'));
  if tg_op = 'UPDATE' then
    if pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(old.title), '[[:space:]]+', ' ', 'g')) =
         pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(new.title), '[[:space:]]+', ' ', 'g'))
      and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(old.artist), '[[:space:]]+', ' ', 'g')) =
          pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(new.artist), '[[:space:]]+', ' ', 'g'))
      and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(old.version_label), '[[:space:]]+', ' ', 'g')) =
          pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(new.version_label), '[[:space:]]+', ' ', 'g')) then
      return new;
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(song_key, 0));
  if exists (
    select 1 from public.catalog_songs as existing
    where existing.id <> new.id
      and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(existing.title), '[[:space:]]+', ' ', 'g')) =
          pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(new.title), '[[:space:]]+', ' ', 'g'))
      and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(existing.artist), '[[:space:]]+', ' ', 'g')) =
          pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(new.artist), '[[:space:]]+', ' ', 'g'))
      and pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(existing.version_label), '[[:space:]]+', ' ', 'g')) =
          pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(new.version_label), '[[:space:]]+', ' ', 'g'))
  ) then
    raise exception using errcode = '23505', message = 'Duplicate catalog song';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_catalog_song_duplicate() from public, anon, authenticated;
drop trigger if exists catalog_song_prevent_duplicate on public.catalog_songs;
create trigger catalog_song_prevent_duplicate
  before insert or update of title, artist, version_label on public.catalog_songs
  for each row execute function private.prevent_catalog_song_duplicate();

create table if not exists public.catalog_song_audit (
  id bigint generated always as identity primary key,
  song_id uuid references public.catalog_songs (id) on delete set null,
  song_title text not null,
  actor_id uuid references auth.users (id) on delete set null,
  operation text not null check (operation in ('INSERT', 'UPDATE')),
  previous_status text,
  new_status text not null,
  changed_columns text[] not null default '{}',
  changed_at timestamptz not null default now()
);

alter table public.catalog_song_audit
  add column if not exists changed_columns text[] not null default '{}';

create index if not exists catalog_song_audit_song_changed_idx
  on public.catalog_song_audit (song_id, changed_at desc);

alter table public.catalog_song_audit enable row level security;
revoke all on public.catalog_song_audit from anon, authenticated;
grant select on public.catalog_song_audit to authenticated;

drop policy if exists catalog_song_audit_admin_read on public.catalog_song_audit;
create policy catalog_song_audit_admin_read
  on public.catalog_song_audit for select to authenticated
  using (coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin');

create or replace function private.audit_catalog_song_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prior_status text;
  changed_fields text[];
begin
  if tg_op = 'UPDATE' then
    prior_status := old.rights_status;
    select coalesce(pg_catalog.array_agg(entry.key order by entry.key), '{}')
      into changed_fields
    from pg_catalog.jsonb_each(pg_catalog.to_jsonb(new)) as entry(key, value)
    where entry.value is distinct from pg_catalog.to_jsonb(old) -> entry.key;
  else
    changed_fields := array['created'];
  end if;
  insert into public.catalog_song_audit (
    song_id, song_title, actor_id, operation, previous_status, new_status, changed_columns
  ) values (
    new.id, new.title, auth.uid(), tg_op,
    prior_status,
    new.rights_status,
    changed_fields
  );
  return new;
end;
$$;

revoke all on function private.audit_catalog_song_change() from public, anon, authenticated;

drop trigger if exists catalog_song_audit_change on public.catalog_songs;
create trigger catalog_song_audit_change
  after insert or update on public.catalog_songs
  for each row execute function private.audit_catalog_song_change();
