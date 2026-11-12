-- Accent- and case-insensitive catalog search.
-- Visitors and musicians type on phones, usually without accents ("evidencias",
-- "joao"). search_text keeps title, artist and composers in lowercase ASCII-ish
-- form (unaccented, punctuation collapsed to spaces) and a trigram index makes
-- substring searches (ILIKE '%word%') fast on the whole catalog.

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create or replace function private.catalog_search_text(p_title text, p_artist text, p_composers text[])
returns text
language sql
stable
set search_path = ''
as $$
  select pg_catalog.btrim(pg_catalog.regexp_replace(
    pg_catalog.lower(extensions.unaccent(
      'extensions.unaccent'::regdictionary,
      coalesce(p_title, '') || ' ' || coalesce(p_artist, '') || ' ' ||
        coalesce(pg_catalog.array_to_string(p_composers, ' '), '')
    )),
    '[^a-z0-9]+', ' ', 'g'
  ));
$$;

revoke all on function private.catalog_search_text(text, text, text[]) from public, anon, authenticated;

alter table public.catalog_songs
  add column if not exists search_text text not null default '';

-- The existing trigger keeps both search columns in sync.
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
  new.search_text := private.catalog_search_text(new.title, new.artist, new.composers);
  return new;
end;
$$;

revoke all on function private.sync_catalog_song_search_vector() from public, anon, authenticated;

-- Backfill without writing one audit row per song: this is a derived column,
-- not an editorial change to the catalog.
alter table public.catalog_songs disable trigger catalog_song_audit_change;
update public.catalog_songs
set search_text = private.catalog_search_text(title, artist, composers)
where search_text is distinct from private.catalog_search_text(title, artist, composers);
alter table public.catalog_songs enable trigger catalog_song_audit_change;

create index if not exists catalog_songs_search_text_trgm_idx
  on public.catalog_songs using gin (search_text extensions.gin_trgm_ops);

-- Visitors filter approved songs by this derived text (RLS still limits rows to approved items).
grant select (search_text) on public.catalog_songs to anon;

comment on column public.catalog_songs.search_text is
  'Trigger-maintained lowercase, unaccented title/artist/composers used for ILIKE search; chord_sheet is intentionally excluded.';
