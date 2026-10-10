-- Reviewing imported metadata is independent of approving rights for publication.
-- Approved catalog metadata may have no chord sheet; rights evidence remains mandatory.
alter table public.catalog_songs
  drop constraint if exists approved_song_has_chord_sheet;

alter table public.catalog_songs
  add column if not exists metadata_reviewed_at timestamptz,
  add column if not exists metadata_reviewed_by uuid references auth.users (id) on delete set null;

create index if not exists catalog_songs_pending_metadata_review_idx
  on public.catalog_songs (created_at, id)
  where rights_status = 'pending' and metadata_reviewed_at is null;

create or replace function private.reset_catalog_metadata_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.title is distinct from old.title
    or new.artist is distinct from old.artist
    or new.genre is distinct from old.genre)
    and new.metadata_reviewed_at is not distinct from old.metadata_reviewed_at then
    new.metadata_reviewed_at := null;
    new.metadata_reviewed_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists catalog_song_reset_metadata_review on public.catalog_songs;
create trigger catalog_song_reset_metadata_review
  before update of title, artist, genre on public.catalog_songs
  for each row execute function private.reset_catalog_metadata_review();
