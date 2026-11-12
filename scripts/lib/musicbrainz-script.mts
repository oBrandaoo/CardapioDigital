// Shared pieces of the catalog scripts: artist lists, MusicBrainz client with
// the shared request slot, artist resolution and the Supabase admin client.

import { readFile, writeFile } from "node:fs/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const API_ROOT = "https://musicbrainz.org/ws/2";
export const USER_AGENT = "CardapioMusical/0.1 (https://github.com/oBrandaoo/CardapioDigital)";
const MIN_INTERVAL_MS = 1100;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_LINE = /^(\s*[-*]\s*\[)([ xX])(\]\s+)(.+?)\s*$/;
const MBID_NOTE = /<!--\s*mbid:\s*([0-9a-f-]{36})\s*-->/i;

export type Json = Record<string, unknown>;

export type ListEntry = {
  lines: string[];
  label: string;
  names: string[];
  mbid: string | null;
  done: boolean;
};

export type Candidate = {
  id: string;
  name: string;
  country: string;
  disambiguation: string;
  score: number;
  names: string[];
};

export type Resolution =
  | { kind: "ok"; artist: Candidate; via: string }
  | { kind: "ambiguous" | "missing"; candidates: Candidate[] };

export class FatalError extends Error {}

// ---------- utilidades ----------

export function object(value: unknown): Json {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

export function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const fmt = (n: number) => n.toLocaleString("pt-BR");

// ---------- lista Markdown ----------

/** Artists in "- [ ]" (pending) lines; with includeDone, also "- [X]" lines. */
export function parseList(content: string, includeDone = false): ListEntry[] {
  const byKey = new Map<string, ListEntry>();
  for (const line of content.split(/\r?\n/)) {
    const match = LIST_LINE.exec(line);
    if (!match) continue;
    const done = match[2] !== " ";
    if (done && !includeDone) continue;
    const raw = match[4];
    const mbid = MBID_NOTE.exec(raw)?.[1] ?? null;
    const label = raw.replace(MBID_NOTE, "").trim();
    // "Irmãs Galvão (As Galvão)" → ["Irmãs Galvão", "As Galvão"]
    const names = [label.replace(/\s*\([^)]*\)\s*/g, " ").trim()];
    for (const alias of label.matchAll(/\(([^)]+)\)/g)) names.push(alias[1].trim());
    const key = mbid ?? normalizeName(names[0]);
    const existing = byKey.get(key);
    if (existing) existing.lines.push(line);
    else byKey.set(key, { lines: [line], label, names: names.filter(Boolean), mbid, done });
  }
  return [...byKey.values()];
}

export async function markDone(file: string, entry: ListEntry) {
  // Relê o arquivo para não sobrescrever edições feitas durante a importação.
  const content = await readFile(file, "utf8");
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  for (const original of entry.lines) {
    const index = lines.indexOf(original);
    if (index >= 0) lines[index] = original.replace(LIST_LINE, (_all, a, _b, c, d) => `${a}X${c}${d}`);
  }
  await writeFile(file, lines.join(eol), "utf8");
}

// ---------- MusicBrainz ----------

let localNextSlot = 0;

async function waitForSlot(admin: SupabaseClient | null) {
  if (admin) {
    // Mesmo controle usado pelo app: coordena com importações abertas no navegador.
    const { data, error } = await admin.rpc("reserve_musicbrainz_request_slot");
    if (error || typeof data !== "string") {
      throw new FatalError(`Não foi possível reservar o intervalo do MusicBrainz no banco (${error?.code ?? "sem resposta"}). As migrations foram aplicadas?`);
    }
    const delay = new Date(data).getTime() - Date.now();
    if (delay > 0) await sleep(delay);
    return;
  }
  const now = Date.now();
  const slot = Math.max(now, localNextSlot);
  localNextSlot = slot + MIN_INTERVAL_MS;
  if (slot > now) await sleep(slot - now);
}

export async function musicBrainzGet(admin: SupabaseClient | null, path: string, params: URLSearchParams): Promise<Json> {
  params.set("fmt", "json");
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await waitForSlot(admin);
    let status = 0;
    try {
      const response = await fetch(`${API_ROOT}/${path}?${params}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      status = response.status;
      if (response.ok) return object(await response.json());
      if (status !== 429 && status !== 503 && status < 500) {
        throw new FatalError(`MusicBrainz respondeu ${status} para ${path}.`);
      }
    } catch (error) {
      if (error instanceof FatalError) throw error;
    }
    const wait = 2000 * 2 ** attempt;
    console.warn(`  MusicBrainz indisponível (${status || "rede"}); nova tentativa em ${wait / 1000}s…`);
    await sleep(wait);
  }
  throw new FatalError("MusicBrainz continua indisponível. Rode o comando de novo mais tarde; o que já foi salvo será ignorado.");
}

function toCandidate(row: unknown): Candidate {
  const artist = object(row);
  const aliases = Array.isArray(artist.aliases) ? artist.aliases.map((alias) => text(object(alias).name)) : [];
  const name = text(artist.name);
  return {
    id: text(artist.id),
    name,
    country: text(artist.country) || text(object(artist.area).name),
    disambiguation: text(artist.disambiguation),
    score: Number(artist.score) || 0,
    names: [name, text(artist["sort-name"]), ...aliases].filter(Boolean),
  };
}

function isBrazilian(candidate: Candidate) {
  return candidate.country === "BR" || /^(brazil|brasil)$/i.test(candidate.country) || /brazil|brasil/i.test(candidate.disambiguation);
}

export async function resolveArtist(admin: SupabaseClient | null, entry: ListEntry): Promise<Resolution> {
  if (entry.mbid) {
    if (!UUID.test(entry.mbid)) return { kind: "missing", candidates: [] };
    const data = await musicBrainzGet(admin, `artist/${entry.mbid}`, new URLSearchParams());
    const artist = toCandidate({ ...data, score: 100 });
    if (!UUID.test(artist.id)) return { kind: "missing", candidates: [] };
    return { kind: "ok", artist, via: "MBID anotado" };
  }

  const data = await musicBrainzGet(admin, "artist", new URLSearchParams({ query: entry.names[0], dismax: "true", limit: "15" }));
  const candidates = (Array.isArray(data.artists) ? data.artists : [])
    .map(toCandidate)
    .filter((candidate) => UUID.test(candidate.id) && candidate.name);
  const wanted = new Set(entry.names.map(normalizeName));
  const exact = candidates.filter((candidate) => candidate.names.some((name) => wanted.has(normalizeName(name))));
  const brazilian = exact.filter(isBrazilian);

  if (brazilian.length === 1) return { kind: "ok", artist: brazilian[0], via: "nome exato, Brasil" };
  if (brazilian.length > 1) return { kind: "ambiguous", candidates: brazilian };
  // Sem país no MusicBrainz: aceita só se for o único com o nome e o primeiro da busca.
  if (exact.length === 1 && exact[0].id === candidates[0]?.id && !exact[0].country) {
    return { kind: "ok", artist: exact[0], via: "nome exato, sem país informado" };
  }
  return { kind: exact.length ? "ambiguous" : "missing", candidates: (exact.length ? exact : candidates).slice(0, 5) };
}

export function describe(candidate: Candidate) {
  const extra = [candidate.country, candidate.disambiguation].filter(Boolean).join(", ");
  return `${candidate.name}${extra ? ` (${extra})` : ""} <!-- mbid: ${candidate.id} -->`;
}

// ---------- Supabase ----------

export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new FatalError("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env ou .env.local.");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export function runMain(main: () => Promise<void>) {
  main().catch((error: unknown) => {
    console.error(`\nErro: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
