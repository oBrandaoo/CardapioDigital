-- Fix: visitors could not read any musician's repertoire (SQLSTATE 42501,
-- "permission denied for table catalog_songs").
--
-- repertoire_read_owner_or_public (migration 202610060003) checked the song's
-- rights in a subquery on catalog_songs. Policy subqueries run with the
-- caller's privileges, and anon may only read a few catalog columns
-- (id, title, artist, genre, search_text), not rights_status,
-- rights_reviewed_at or rights_valid_until. Every anon query on
-- repertoire_items therefore failed, breaking the public request flow.
--
-- The rights check now lives in a SECURITY DEFINER function. It answers only
-- "is this song publicly approved?", which anon can already learn from the
-- catalog_read_approved_rights policy, so no additional data is exposed.

create or replace function private.is_catalog_song_public(p_song_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.catalog_songs as song
    where song.id = p_song_id
      and song.rights_status = 'approved'
      and song.rights_reviewed_at is not null
      and (song.rights_valid_until is null or song.rights_valid_until >= current_date)
  );
$$;

revoke all on function private.is_catalog_song_public(uuid) from public;
grant execute on function private.is_catalog_song_public(uuid) to anon, authenticated;

drop policy if exists repertoire_read_owner_or_public on public.repertoire_items;
create policy repertoire_read_owner_or_public
  on public.repertoire_items for select to anon, authenticated
  using (
    musician_id = auth.uid()
    or (
      is_enabled
      and private.has_active_license(musician_id)
      and exists (
        select 1 from public.musicians as musician
        where musician.id = repertoire_items.musician_id
          and musician.profile_is_public
      )
      and private.is_catalog_song_public(song_id)
    )
  );
