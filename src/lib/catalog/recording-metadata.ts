// Cleanup rules for MusicBrainz recording metadata, shared by the admin import
// (src/lib/catalog/musicbrainz.ts) and the bulk script (scripts/importar-artistas.mts).
// Keep this file free of path aliases and server-only imports so Node can load it
// directly from the script. The SQL key in private.catalog_song_dedupe_key uses
// the same word lists.

export const MAX_CREDITED_ARTISTS = 3;

const VERSION_WORDS =
  "ao vivo|live|remaster[a-z]*|remasteriza[a-z]*|acustic[a-z]*|acoustic|unplugged|versao|version|" +
  "edit|radio|mix|remix|demo|mono|stereo|bonus|single|instrumental|playback|karaoke|" +
  "feat|ft|featuring|part|participacao|com";
const GUEST_WORDS = "feat|ft|featuring|part|participacao";
const MEDLEY_WORDS = "medley|pot[- ]?pourri|pout[- ]?pourri|potpourri|pupurri";

const versionPattern = new RegExp(`(^|[^a-z0-9])(${VERSION_WORDS})($|[^a-z0-9])`);
const guestPattern = new RegExp(`(^|[^a-z0-9])(${GUEST_WORDS})($|[^a-z0-9])`);
const medleyPattern = new RegExp(`(^|[^a-z0-9])(${MEDLEY_WORDS})($|[^a-z0-9])`);

function fold(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** "Sozinho (Ao Vivo)", "Sozinho - Remastered 2011", "Sozinho [feat. X]" → "Sozinho". */
export function cleanRecordingTitle(title: string): string {
  let result = title.replace(/\s*[([][^)\]]*[)\]]/g, (segment) => (versionPattern.test(fold(segment)) ? " " : segment));
  result = result.replace(/\s+[-–—]\s+([^-–—]*)$/, (segment, tail: string) => (versionPattern.test(fold(tail)) ? "" : segment));
  result = result.replace(/\s+/g, " ").trim();
  return result || title.trim();
}

/** MusicBrainz writes medleys as "A / B" or names them medley / pot-pourri. */
export function isMedleyTitle(title: string): boolean {
  return /\s\/\s/.test(title) || medleyPattern.test(fold(title));
}

export type ArtistCredit = { name: string; joinphrase: string };

/**
 * Joins the main credited artists and drops guests ("A feat. B" → "A").
 * A missing join phrase between two names becomes " & " instead of gluing them.
 */
export function creditedArtist(credits: ArtistCredit[]): { artist: string; creditCount: number } {
  const names = credits.map((credit) => credit.name.trim()).filter(Boolean);
  let artist = "";
  for (const [index, credit] of credits.entries()) {
    const name = credit.name.trim();
    if (!name) continue;
    artist += name;
    if (index === credits.length - 1) break;
    const joinphrase = credit.joinphrase;
    if (guestPattern.test(fold(joinphrase))) break;
    artist += joinphrase.trim() ? joinphrase : " & ";
  }
  return { artist: artist.replace(/\s+/g, " ").trim(), creditCount: names.length };
}

export type RecordingMetadata = {
  title: string;
  artist: string;
  valid: boolean;
  reason: "" | "invalid" | "collective" | "medley";
};

export function prepareRecording(rawTitle: string, credits: ArtistCredit[]): RecordingMetadata {
  const title = cleanRecordingTitle(rawTitle);
  const { artist, creditCount } = creditedArtist(credits);
  let reason: RecordingMetadata["reason"] = "";
  if (!title || title.length > 160 || !artist || artist.length > 160) reason = "invalid";
  else if (creditCount > MAX_CREDITED_ARTISTS) reason = "collective";
  else if (isMedleyTitle(rawTitle)) reason = "medley";
  return { title, artist, valid: reason === "", reason };
}

/** Same title/artist/version rule as the unique index, for in-memory skipping. */
export function exactSongKey(title: string, artist: string, versionLabel = "Original") {
  return [title, artist, versionLabel].map((part) => part.trim().replace(/\s+/g, " ").toLowerCase()).join("\u0000");
}
