-- A primary genre lets visitors browse the approved central catalog.
alter table public.catalog_songs
  add column if not exists genre text not null default 'Não informado';

alter table public.catalog_songs
  drop constraint if exists catalog_songs_genre_check;
alter table public.catalog_songs
  add constraint catalog_songs_genre_check
  check (char_length(btrim(genre)) between 1 and 80);

grant select (genre) on public.catalog_songs to anon;

create index if not exists catalog_songs_genre_idx
  on public.catalog_songs (genre, title, id)
  where rights_status = 'approved';

create or replace function public.list_public_song_genres()
returns table (genre text, song_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select song.genre, count(*)
  from public.catalog_songs as song
  group by song.genre
  order by song.genre;
$$;

revoke all on function public.list_public_song_genres() from public, anon, authenticated;
grant execute on function public.list_public_song_genres() to anon;
