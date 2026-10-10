import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const API_ROOT = "https://musicbrainz.org/ws/2";
const USER_AGENT = "CardapioMusical/0.1 (https://github.com/oBrandaoo/CardapioDigital)";
export const MUSICBRAINZ_PAGE_SIZE = 25;
export const MUSICBRAINZ_MAX_PAGE = 100_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MusicBrainzArtist = {
  id: string;
  name: string;
  description: string;
};

export type MusicBrainzRecording = {
  id: string;
  title: string;
  artist: string;
  firstReleaseDate: string;
  canImport: boolean;
};

export class MusicBrainzError extends Error {
  constructor(public kind: "setup" | "busy" | "unavailable") {
    super(kind);
  }
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function string(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function musicBrainzGet(path: string, params: URLSearchParams): Promise<Record<string, unknown>> {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new MusicBrainzError("setup");
  const { data: slot, error } = await admin.rpc("reserve_musicbrainz_request_slot");
  if (error || typeof slot !== "string") throw new MusicBrainzError("setup");

  const delay = new Date(slot).getTime() - Date.now();
  if (!Number.isFinite(delay) || delay > 30_000) throw new MusicBrainzError("busy");
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

  params.set("fmt", "json");
  let response: Response;
  try {
    response = await fetch(`${API_ROOT}/${path}?${params}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new MusicBrainzError("unavailable");
  }
  if (!response.ok) throw new MusicBrainzError(response.status === 429 || response.status === 503 ? "busy" : "unavailable");
  try {
    return object(await response.json());
  } catch {
    throw new MusicBrainzError("unavailable");
  }
}

export async function searchMusicBrainzArtists(query: string): Promise<MusicBrainzArtist[]> {
  const name = query.trim().slice(0, 100);
  if (name.length < 2) return [];
  const params = new URLSearchParams({ query: name, dismax: "true", limit: "10" });
  const data = await musicBrainzGet("artist", params);
  const rows = Array.isArray(data.artists) ? data.artists : [];
  return rows.map((row) => {
    const artist = object(row);
    return {
      id: string(artist.id),
      name: string(artist.name),
      description: string(artist.disambiguation) || string(artist.country),
    };
  }).filter((artist) => UUID.test(artist.id) && artist.name.length > 0);
}

export async function browseMusicBrainzRecordings(artistId: string, page: number) {
  if (!UUID.test(artistId) || !Number.isSafeInteger(page) || page < 1 || page > MUSICBRAINZ_MAX_PAGE) {
    throw new MusicBrainzError("unavailable");
  }
  const params = new URLSearchParams({
    artist: artistId,
    inc: "artist-credits",
    limit: String(MUSICBRAINZ_PAGE_SIZE),
    offset: String((page - 1) * MUSICBRAINZ_PAGE_SIZE),
  });
  const data = await musicBrainzGet("recording", params);
  const rows = Array.isArray(data.recordings) ? data.recordings : [];
  const recordings: MusicBrainzRecording[] = rows.map((row) => {
    const recording = object(row);
    const credits = Array.isArray(recording["artist-credit"]) ? recording["artist-credit"] : [];
    const artist = credits.map((entry) => {
      const credit = object(entry);
      const joinphrase = typeof credit.joinphrase === "string" ? credit.joinphrase : "";
      return `${string(credit.name) || string(object(credit.artist).name)}${joinphrase}`;
    }).join("").trim();
    const title = string(recording.title);
    const id = string(recording.id);
    return {
      id,
      title,
      artist,
      firstReleaseDate: string(recording["first-release-date"]),
      canImport: UUID.test(id) && title.length > 0 && title.length <= 160 && artist.length > 0 && artist.length <= 160,
    };
  });
  const reportedCount = Number(data["recording-count"]);
  const count = Number.isFinite(reportedCount) && reportedCount >= 0 ? reportedCount : recordings.length;
  return { recordings, count };
}
