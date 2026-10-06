-- Search the central catalog by title, artist, and composers without loading chord sheets.
alter table public.catalog_songs
  add column if not exists catalog_search_vector tsvector;

create or replace function private.sync_catalog_song_search_vector()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.catalog_search_vector := pg_catalog.to_tsvector(
    'simple'::pg_catalog.regconfig,
    coalesce(new.title, '') || ' ' || coalesce(new.artist, '') || ' ' ||
      coalesce(pg_catalog.array_to_string(new.composers, ' '), '')
  );
  return new;
end;
$$;

revoke all on function private.sync_catalog_song_search_vector() from public, anon, authenticated;

drop trigger if exists catalog_songs_search_vector_sync on public.catalog_songs;
create trigger catalog_songs_search_vector_sync
  before insert or update of title, artist, composers on public.catalog_songs
  for each row execute function private.sync_catalog_song_search_vector();

update public.catalog_songs
set catalog_search_vector = pg_catalog.to_tsvector(
  'simple'::pg_catalog.regconfig,
  coalesce(title, '') || ' ' || coalesce(artist, '') || ' ' ||
    coalesce(pg_catalog.array_to_string(composers, ' '), '')
);

alter table public.catalog_songs
  alter column catalog_search_vector set not null;

create index if not exists catalog_songs_search_vector_idx
  on public.catalog_songs using gin (catalog_search_vector);

drop index if exists public.catalog_songs_search_idx;

comment on column public.catalog_songs.catalog_search_vector is
  'Trigger-maintained full-text search vector over title, artist, and composers; chord_sheet is intentionally excluded.';
