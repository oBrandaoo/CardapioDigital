-- Tools to find and remove near-duplicate catalog records after bulk imports.
-- Nothing is deleted by this migration. Run manually in the SQL Editor:
--   select * from private.remove_catalog_duplicates();              -- preview only
--   select * from private.catalog_song_duplicates limit 200;        -- inspect groups
--   select * from private.remove_catalog_duplicates(true);          -- remove a batch
--
-- Near duplicates ignore accents, case and punctuation, version suffixes in the
-- title ("(Ao Vivo)", "- Remastered 2011", "(feat. X)") and guest credits in the
-- artist ("feat.", "part."). Only metadata drafts are removed: pending, without
-- chord sheet or rights record and not used by any repertoire or request. Every
-- other duplicate is listed as 'review' and kept for a manual decision.

create extension if not exists unaccent with schema extensions;

alter table public.catalog_song_audit
  add column if not exists details text;

alter table public.catalog_song_audit
  drop constraint if exists catalog_song_audit_operation_check;
alter table public.catalog_song_audit
  add constraint catalog_song_audit_operation_check
    check (operation in ('INSERT', 'UPDATE', 'MERGE'));

create or replace function private.catalog_song_dedupe_key(
  song_title text,
  song_artist text,
  song_version text
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  version_words constant text :=
    'ao vivo|live|remaster[a-z]*|remasteriza[a-z]*|acustic[a-z]*|acoustic|unplugged|versao|version|'
    'edit|radio|mix|remix|demo|mono|stereo|bonus|single|instrumental|playback|karaoke|'
    'feat|ft|featuring|part|participacao|com';
  guest_words constant text := 'feat|ft|featuring|part|participacao';
  raw_title text;
  title_key text;
  artist_key text;
begin
  raw_title := pg_catalog.lower(extensions.unaccent('extensions.unaccent'::regdictionary, song_title));
  -- "(Ao Vivo)", "[Remastered]", "(feat. X)", "(com X)"
  title_key := pg_catalog.regexp_replace(raw_title,
    '\s*[([][^])]*\m(' || version_words || ')\M[^])]*[])]', ' ', 'g');
  -- "- Ao Vivo", "– Remastered 2011" (last dash segment only)
  title_key := pg_catalog.regexp_replace(title_key,
    '\s+[-–—]\s+[^-–—]*\m(' || version_words || ')\M[^-–—]*$', '');
  title_key := pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.replace(title_key, '&', ' e '), '[^a-z0-9]+', ' ', 'g'));
  if title_key = '' then
    -- Titles made only of a suffix or of non-Latin characters keep their full text.
    title_key := pg_catalog.btrim(pg_catalog.regexp_replace(raw_title, '[[:space:]]+', ' ', 'g'));
  end if;

  artist_key := pg_catalog.lower(extensions.unaccent('extensions.unaccent'::regdictionary, song_artist));
  artist_key := pg_catalog.regexp_replace(artist_key,
    '\s*[([][^])]*\m(' || guest_words || ')\M[^])]*[])]', ' ', 'g');
  artist_key := pg_catalog.regexp_replace(artist_key,
    '[[:space:],]+\m(' || guest_words || ')\M.*$', '');
  artist_key := pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.replace(artist_key, '&', ' e '), '[^a-z0-9]+', ' ', 'g'));
  if artist_key = '' then
    artist_key := pg_catalog.lower(pg_catalog.btrim(song_artist));
  end if;

  return title_key || '|' || artist_key || '|' ||
    pg_catalog.lower(pg_catalog.regexp_replace(pg_catalog.btrim(song_version), '[[:space:]]+', ' ', 'g'));
end;
$$;

revoke all on function private.catalog_song_dedupe_key(text, text, text) from public, anon, authenticated;

create or replace view private.catalog_song_duplicates as
with referenced as (
  select song_id from public.repertoire_items
  union
  select song_id from public.music_requests
),
keyed as (
  select
    song.id,
    song.title,
    song.artist,
    song.genre,
    song.version_label,
    song.rights_status,
    song.created_at,
    nullif(btrim(song.chord_sheet), '') is not null as has_chord_sheet,
    (nullif(btrim(song.authorization_reference), '') is not null
      or nullif(btrim(song.rights_basis), '') is not null) as has_rights_record,
    song.metadata_reviewed_at is not null as metadata_reviewed,
    referenced.song_id is not null as is_referenced,
    private.catalog_song_dedupe_key(song.title, song.artist, song.version_label) as dedupe_key
  from public.catalog_songs as song
  left join referenced on referenced.song_id = song.id
),
ranked as (
  select
    keyed.*,
    count(*) over (partition by dedupe_key) as group_size,
    row_number() over (
      partition by dedupe_key
      order by
        case rights_status when 'approved' then 0 when 'pending' then 1 when 'rejected' then 3 else 2 end,
        has_chord_sheet desc,
        has_rights_record desc,
        is_referenced desc,
        metadata_reviewed desc,
        char_length(title),
        created_at,
        id
    ) as group_rank
  from keyed
)
select
  dedupe_key,
  group_size,
  group_rank,
  first_value(id) over (partition by dedupe_key order by group_rank) as keep_id,
  id,
  title,
  artist,
  genre,
  version_label,
  rights_status,
  has_chord_sheet,
  has_rights_record,
  is_referenced,
  metadata_reviewed,
  created_at,
  case
    when group_rank = 1 then 'keep'
    when rights_status <> 'pending' or has_chord_sheet or has_rights_record or is_referenced then 'review'
    else 'remove'
  end as action
from ranked
where group_size > 1;

revoke all on private.catalog_song_duplicates from public, anon, authenticated;

create or replace function private.remove_catalog_duplicates(
  apply boolean default false,
  batch_limit integer default 5000
)
returns table (
  duplicate_groups bigint,
  removable bigint,
  needs_review bigint,
  removed bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_count bigint := 0;
begin
  if batch_limit is null or batch_limit < 1 or batch_limit > 50000 then
    raise exception 'batch_limit must be between 1 and 50000';
  end if;

  if apply then
    with doomed as (
      select duplicate.id, duplicate.keep_id, duplicate.title, duplicate.artist, duplicate.rights_status
      from private.catalog_song_duplicates as duplicate
      where duplicate.action = 'remove'
      order by duplicate.dedupe_key, duplicate.group_rank
      limit batch_limit
    ),
    deleted as (
      delete from public.catalog_songs as song
      using doomed
      where song.id = doomed.id
        and song.rights_status = 'pending'
        and nullif(pg_catalog.btrim(song.chord_sheet), '') is null
        and nullif(pg_catalog.btrim(song.authorization_reference), '') is null
        and nullif(pg_catalog.btrim(song.rights_basis), '') is null
        and not exists (select 1 from public.repertoire_items as item where item.song_id = song.id)
        and not exists (select 1 from public.music_requests as request where request.song_id = song.id)
      returning song.id
    ),
    audited as (
      insert into public.catalog_song_audit (
        song_id, song_title, actor_id, operation, previous_status, new_status, changed_columns, details
      )
      select
        doomed.keep_id, keeper.title, auth.uid(), 'MERGE', doomed.rights_status, keeper.rights_status,
        '{}', pg_catalog.format('Duplicata removida: %s — %s (%s)', doomed.title, doomed.artist, doomed.id)
      from deleted
      join doomed on doomed.id = deleted.id
      join public.catalog_songs as keeper on keeper.id = doomed.keep_id
      returning 1
    )
    select count(*) into removed_count from audited;
  end if;

  return query
  select
    count(distinct duplicate.dedupe_key),
    count(*) filter (where duplicate.action = 'remove'),
    count(*) filter (where duplicate.action = 'review'),
    removed_count
  from private.catalog_song_duplicates as duplicate;
end;
$$;

revoke all on function private.remove_catalog_duplicates(boolean, integer) from public, anon, authenticated;
