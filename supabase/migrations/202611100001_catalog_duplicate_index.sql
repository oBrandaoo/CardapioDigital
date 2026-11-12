-- The duplicate trigger compared every new row with the whole catalog using
-- three regular expressions per existing row (sequential scan, O(n) per insert).
-- A unique expression index enforces the same title/artist/version rule with an
-- index lookup, stays safe under concurrent imports and keeps SQLSTATE 23505.

do $$
declare
  duplicate_groups bigint;
begin
  select count(*) into duplicate_groups
  from (
    select 1
    from public.catalog_songs
    group by
      lower(regexp_replace(btrim(title), '[[:space:]]+', ' ', 'g')),
      lower(regexp_replace(btrim(artist), '[[:space:]]+', ' ', 'g')),
      lower(regexp_replace(btrim(version_label), '[[:space:]]+', ' ', 'g'))
    having count(*) > 1
  ) as duplicates;

  if duplicate_groups > 0 then
    raise exception 'catalog_songs has % group(s) of exact duplicates created before the duplicate trigger; resolve them before applying this migration', duplicate_groups;
  end if;
end;
$$;

create unique index if not exists catalog_songs_title_artist_version_key
  on public.catalog_songs (
    lower(regexp_replace(btrim(title), '[[:space:]]+', ' ', 'g')),
    lower(regexp_replace(btrim(artist), '[[:space:]]+', ' ', 'g')),
    lower(regexp_replace(btrim(version_label), '[[:space:]]+', ' ', 'g'))
  );

drop trigger if exists catalog_song_prevent_duplicate on public.catalog_songs;
drop function if exists private.prevent_catalog_song_duplicate();
