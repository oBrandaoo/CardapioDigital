-- MusicBrainz contributes metadata only. Drafts without chord sheets stay private.
alter table public.catalog_songs
  drop constraint if exists catalog_songs_chord_sheet_check;

alter table public.catalog_songs
  add constraint catalog_songs_chord_sheet_check
    check (char_length(chord_sheet) <= 40000),
  add constraint approved_song_has_chord_sheet
    check (rights_status <> 'approved' or nullif(btrim(chord_sheet), '') is not null);

-- Reserve request slots across all application instances to respect the
-- MusicBrainz one-request-per-second limit, including concurrent admins.
create table if not exists private.musicbrainz_request_slot (
  singleton boolean primary key default true check (singleton),
  next_request_at timestamptz not null default now()
);

insert into private.musicbrainz_request_slot (singleton)
values (true)
on conflict (singleton) do nothing;

create or replace function public.reserve_musicbrainz_request_slot()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  reserved_at timestamptz;
begin
  update private.musicbrainz_request_slot
  set next_request_at = greatest(next_request_at, pg_catalog.clock_timestamp()) + interval '1100 milliseconds'
  where singleton = true
  returning next_request_at - interval '1100 milliseconds' into reserved_at;
  return reserved_at;
end;
$$;

revoke all on function public.reserve_musicbrainz_request_slot() from public, anon, authenticated;
grant execute on function public.reserve_musicbrainz_request_slot() to service_role;
