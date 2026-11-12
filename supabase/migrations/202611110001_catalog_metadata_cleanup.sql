-- Cleanup of imported MusicBrainz metadata and a popularity rank for curation.
-- Nothing is changed by this migration itself. Run manually in the SQL Editor,
-- after private.remove_catalog_duplicates(true) has reached removed = 0:
--   select * from private.clean_catalog_metadata();            -- preview only
--   select * from private.clean_catalog_metadata(true);        -- one batch; repeat until both counts are 0
--   select * from private.catalog_artist_suspects;             -- names glued together, e.g. "JobimVinicius"
--   select * from private.rename_catalog_artist('Antônio Carlos JobimVinicius de Moraes',
--                                              'Antônio Carlos Jobim & Vinicius de Moraes');
--
-- Only untouched metadata drafts are changed: pending, without chord sheet or
-- rights record, never validated by an admin and not used by repertoires or
-- requests. Renames and removals are recorded in catalog_song_audit.

alter table public.catalog_song_audit
  drop constraint if exists catalog_song_audit_operation_check;
alter table public.catalog_song_audit
  add constraint catalog_song_audit_operation_check
    check (operation in ('INSERT', 'UPDATE', 'MERGE', 'DELETE'));

-- ---------- title and artist cleanup (mirrors src/lib/catalog/recording-metadata.ts) ----------

create or replace function private.catalog_clean_title(song_title text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  version_words constant text :=
    'ao vivo|live|remaster[a-z]*|remasteriza[a-z]*|ac[uú]stic[a-z]*|acoustic|unplugged|vers[aã]o|version|'
    'edit|radio|mix|remix|demo|mono|stereo|b[oô]nus|single|instrumental|playback|karaoke|'
    'feat|ft|featuring|part|participa[cç][aã]o|com';
  result text;
begin
  result := pg_catalog.regexp_replace(song_title,
    '\s*[([][^])]*\m(' || version_words || ')\M[^])]*[])]', ' ', 'gi');
  result := pg_catalog.regexp_replace(result,
    '\s+[-–—]\s+[^-–—]*\m(' || version_words || ')\M[^-–—]*$', '', 'i');
  result := pg_catalog.btrim(pg_catalog.regexp_replace(result, '[[:space:]]+', ' ', 'g'));
  return coalesce(nullif(result, ''), pg_catalog.btrim(song_title));
end;
$$;

create or replace function private.catalog_clean_artist(song_artist text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  guest_words constant text := 'feat|ft|featuring|part|participa[cç][aã]o';
  result text;
begin
  result := pg_catalog.regexp_replace(song_artist,
    '\s*[([][^])]*\m(' || guest_words || ')\M[^])]*[])]', ' ', 'gi');
  result := pg_catalog.regexp_replace(result,
    '[[:space:],]+\m(' || guest_words || ')\M.*$', '', 'i');
  result := pg_catalog.btrim(pg_catalog.regexp_replace(result, '[[:space:]]+', ' ', 'g'));
  return coalesce(nullif(result, ''), pg_catalog.btrim(song_artist));
end;
$$;

revoke all on function private.catalog_clean_title(text) from public, anon, authenticated;
revoke all on function private.catalog_clean_artist(text) from public, anon, authenticated;

-- Untouched metadata drafts: the only rows bulk cleanup may rename or remove.
create or replace view private.catalog_untouched_drafts as
select song.*
from public.catalog_songs as song
where song.rights_status = 'pending'
  and song.metadata_reviewed_at is null
  and nullif(btrim(song.chord_sheet), '') is null
  and nullif(btrim(song.authorization_reference), '') is null
  and nullif(btrim(song.rights_basis), '') is null
  and not exists (select 1 from public.repertoire_items as item where item.song_id = song.id)
  and not exists (select 1 from public.music_requests as request where request.song_id = song.id);

revoke all on private.catalog_untouched_drafts from public, anon, authenticated;

create or replace function private.clean_catalog_metadata(
  apply boolean default false,
  batch_limit integer default 5000
)
returns table (
  collective_or_medley bigint,
  renamable bigint,
  blocked_renames bigint,
  removed bigint,
  renamed bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_count bigint := 0;
  renamed_count bigint := 0;
begin
  if batch_limit is null or batch_limit < 1 or batch_limit > 50000 then
    raise exception 'batch_limit must be between 1 and 50000';
  end if;

  create temporary table if not exists catalog_cleanup_junk (id uuid primary key) on commit drop;
  create temporary table if not exists catalog_cleanup_renames (
    id uuid primary key, new_title text not null, new_artist text not null, blocked boolean not null
  ) on commit drop;
  truncate pg_temp.catalog_cleanup_junk, pg_temp.catalog_cleanup_renames;

  -- More than three credited artists (", ", "&", "/") or medleys.
  insert into pg_temp.catalog_cleanup_junk (id)
  select draft.id
  from private.catalog_untouched_drafts as draft
  where pg_catalog.array_length(pg_catalog.regexp_split_to_array(draft.artist, '\s*(,|&|/)\s*'), 1) > 3
     or draft.title ~ '\s/\s'
     or draft.title ~* '\m(medley|pot-?\s?pourri|pout-?\s?pourri|potpourri|pupurri)\M';

  insert into pg_temp.catalog_cleanup_renames (id, new_title, new_artist, blocked)
  select candidate.id, candidate.new_title, candidate.new_artist,
    candidate.target_rank > 1 or exists (
      select 1 from public.catalog_songs as existing
      where existing.id <> candidate.id
        and lower(regexp_replace(btrim(existing.title), '[[:space:]]+', ' ', 'g')) =
            lower(regexp_replace(btrim(candidate.new_title), '[[:space:]]+', ' ', 'g'))
        and lower(regexp_replace(btrim(existing.artist), '[[:space:]]+', ' ', 'g')) =
            lower(regexp_replace(btrim(candidate.new_artist), '[[:space:]]+', ' ', 'g'))
        and lower(regexp_replace(btrim(existing.version_label), '[[:space:]]+', ' ', 'g')) =
            lower(regexp_replace(btrim(candidate.version_label), '[[:space:]]+', ' ', 'g'))
    )
  from (
    select cleaned.*,
      row_number() over (
        partition by lower(cleaned.new_title), lower(cleaned.new_artist), lower(btrim(cleaned.version_label))
        order by cleaned.created_at, cleaned.id
      ) as target_rank
    from (
      select draft.id, draft.version_label, draft.created_at, draft.title, draft.artist,
        private.catalog_clean_title(draft.title) as new_title,
        private.catalog_clean_artist(draft.artist) as new_artist
      from private.catalog_untouched_drafts as draft
      where not exists (select 1 from pg_temp.catalog_cleanup_junk as junk where junk.id = draft.id)
    ) as cleaned
    where cleaned.new_title <> cleaned.title or cleaned.new_artist <> cleaned.artist
  ) as candidate;

  if apply then
    with doomed as (
      select junk.id from pg_temp.catalog_cleanup_junk as junk order by junk.id limit batch_limit
    ),
    deleted as (
      delete from public.catalog_songs as song
      using doomed
      where song.id = doomed.id
      returning song.id, song.title, song.artist, song.rights_status
    ),
    audited as (
      insert into public.catalog_song_audit (
        song_id, song_title, actor_id, operation, previous_status, new_status, changed_columns, details
      )
      select null, deleted.title, auth.uid(), 'DELETE', deleted.rights_status, 'deleted', '{}',
        pg_catalog.format('Rascunho coletivo ou medley removido: %s — %s (%s)', deleted.title, deleted.artist, deleted.id)
      from deleted
      returning 1
    )
    select count(*) into removed_count from audited;

    with batch as (
      select rename.* from pg_temp.catalog_cleanup_renames as rename
      where not rename.blocked
      order by rename.id
      limit batch_limit
    ),
    updated as (
      update public.catalog_songs as song
      set title = batch.new_title, artist = batch.new_artist, updated_at = pg_catalog.now()
      from batch
      where song.id = batch.id
      returning song.id
    )
    select count(*) into renamed_count from updated;
  end if;

  return query
  select
    (select count(*) from pg_temp.catalog_cleanup_junk) - removed_count,
    (select count(*) from pg_temp.catalog_cleanup_renames where not blocked) - renamed_count,
    (select count(*) from pg_temp.catalog_cleanup_renames where blocked),
    removed_count,
    renamed_count;
end;
$$;

revoke all on function private.clean_catalog_metadata(boolean, integer) from public, anon, authenticated;

-- Artist names that look glued together by a missing separator ("JobimVinicius").
-- Real names such as "BaianaSystem" also match: review before renaming.
create or replace view private.catalog_artist_suspects as
select song.artist, count(*) as songs
from public.catalog_songs as song
where song.artist ~ '[a-zà-ÿ]{3}[A-ZÀ-Ý][a-zà-ÿ]'
group by song.artist
order by count(*) desc, song.artist;

revoke all on private.catalog_artist_suspects from public, anon, authenticated;

create or replace function private.rename_catalog_artist(old_artist text, new_artist text)
returns table (renamed bigint, blocked bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  renamed_count bigint;
begin
  if new_artist is null or char_length(pg_catalog.btrim(new_artist)) not between 1 and 160 then
    raise exception 'new_artist must have 1 to 160 characters';
  end if;

  with movable as (
    select song.id
    from public.catalog_songs as song
    where song.artist = old_artist
      and not exists (
        select 1 from public.catalog_songs as existing
        where existing.id <> song.id
          and lower(regexp_replace(btrim(existing.title), '[[:space:]]+', ' ', 'g')) =
              lower(regexp_replace(btrim(song.title), '[[:space:]]+', ' ', 'g'))
          and lower(regexp_replace(btrim(existing.artist), '[[:space:]]+', ' ', 'g')) =
              lower(regexp_replace(btrim(new_artist), '[[:space:]]+', ' ', 'g'))
          and lower(regexp_replace(btrim(existing.version_label), '[[:space:]]+', ' ', 'g')) =
              lower(regexp_replace(btrim(song.version_label), '[[:space:]]+', ' ', 'g'))
      )
  ),
  updated as (
    update public.catalog_songs as song
    set artist = pg_catalog.btrim(new_artist), updated_at = pg_catalog.now()
    from movable
    where song.id = movable.id
    returning song.id
  )
  select count(*) into renamed_count from updated;

  return query
  select renamed_count, (select count(*) from public.catalog_songs as song where song.artist = old_artist);
end;
$$;

revoke all on function private.rename_catalog_artist(text, text) from public, anon, authenticated;

-- ---------- popularity rank (ListenBrainz listen counts, set by scripts/marcar-populares.mts) ----------

alter table public.catalog_songs
  add column if not exists popularity_rank smallint
    check (popularity_rank is null or popularity_rank between 1 and 1000);

create index if not exists catalog_songs_popularity_idx
  on public.catalog_songs (artist, popularity_rank)
  where popularity_rank is not null;

comment on column public.catalog_songs.popularity_rank is
  'Position among the most listened songs of a listed artist (1 = most listened). Curation aid only; it does not authorize publication.';

-- Popularity is a curation aid, not a catalog edit: do not audit rank-only updates.
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
    if changed_fields <@ array['popularity_rank']::text[] then
      return new;
    end if;
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

-- entries: [{ "artist_group": "<artist MBID>", "listen_rank": 1, "title": "...", "artist": "..." }, ...]
-- Each artist group keeps its top_n distinct catalog songs; a song in several
-- groups keeps its best position. Pass reset = true on the first call of a run.
create or replace function public.set_catalog_popularity(
  entries jsonb,
  top_n integer default 30,
  reset boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_count integer;
begin
  if top_n is null or top_n < 1 or top_n > 200 then
    raise exception 'top_n must be between 1 and 200';
  end if;
  if pg_catalog.jsonb_typeof(entries) is distinct from 'array' then
    raise exception 'entries must be a JSON array';
  end if;

  if reset then
    update public.catalog_songs set popularity_rank = null where popularity_rank is not null;
  end if;

  with wanted as (
    select entry.artist_group, entry.listen_rank,
      private.catalog_song_dedupe_key(entry.title, entry.artist, 'Original') as dedupe_key
    from pg_catalog.jsonb_to_recordset(entries) as entry(artist_group text, listen_rank integer, title text, artist text)
    where entry.artist_group is not null and entry.listen_rank > 0
      and nullif(pg_catalog.btrim(entry.title), '') is not null
      and nullif(pg_catalog.btrim(entry.artist), '') is not null
  ),
  songs as (
    select song.id, char_length(song.title) as title_length,
      private.catalog_song_dedupe_key(song.title, song.artist, song.version_label) as dedupe_key
    from public.catalog_songs as song
    where song.rights_status <> 'rejected'
  ),
  matched as (
    select wanted.artist_group, songs.id, songs.title_length, min(wanted.listen_rank) as listen_rank
    from wanted
    join songs on songs.dedupe_key = wanted.dedupe_key
    group by wanted.artist_group, songs.id, songs.title_length
  ),
  ranked as (
    select matched.id,
      row_number() over (
        partition by matched.artist_group
        order by matched.listen_rank, matched.title_length, matched.id
      ) as artist_rank
    from matched
  ),
  best as (
    select ranked.id, min(ranked.artist_rank)::smallint as artist_rank
    from ranked
    where ranked.artist_rank <= top_n
    group by ranked.id
  ),
  updated as (
    update public.catalog_songs as song
    set popularity_rank = least(coalesce(song.popularity_rank, best.artist_rank), best.artist_rank)
    from best
    where song.id = best.id
      and song.popularity_rank is distinct from least(coalesce(song.popularity_rank, best.artist_rank), best.artist_rank)
    returning 1
  )
  select count(*) into updated_count from updated;

  return updated_count;
end;
$$;

revoke all on function public.set_catalog_popularity(jsonb, integer, boolean) from public, anon, authenticated;
grant execute on function public.set_catalog_popularity(jsonb, integer, boolean) to service_role;
