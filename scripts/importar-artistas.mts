// Importa do MusicBrainz as gravações de todos os artistas pendentes ("- [ ]")
// de uma lista Markdown, como rascunhos privados (rights_status = 'pending').
//
// Uso:
//   npm run importar:artistas -- <lista.md> --genero <Gênero> [--simular] [--artista <nome>] [--limite <n>]
//
// Segue as mesmas regras da importação em /admin/catalogo/musicbrainz
// (src/app/admin/catalogo/musicbrainz/actions.ts e src/lib/catalog/musicbrainz.ts):
// só metadados (título e artista), sem cifra, versão "Original", duplicatas
// ignoradas pelo gatilho do banco e intervalo mínimo de 1,1 s entre chamadas.
// Metadados do MusicBrainz não autorizam publicação: tudo entra como pendente.
//
// Para fixar um artista ambíguo, anote o MBID na linha da lista:
//   - [ ] Simone <!-- mbid: 00000000-0000-0000-0000-000000000000 -->

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const API_ROOT = "https://musicbrainz.org/ws/2";
const USER_AGENT = "CardapioMusical/0.1 (https://github.com/oBrandaoo/CardapioDigital)";
const PAGE_SIZE = 100; // máximo aceito pelo MusicBrainz em consultas "browse"
const MIN_INTERVAL_MS = 1100;
const INSERT_CONCURRENCY = 8;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_LINE = /^(\s*[-*]\s*\[)([ xX])(\]\s+)(.+?)\s*$/;
const MBID_NOTE = /<!--\s*mbid:\s*([0-9a-f-]{36})\s*-->/i;

type Json = Record<string, unknown>;

type ListEntry = {
  lines: string[];
  label: string;
  names: string[];
  mbid: string | null;
};

type Candidate = {
  id: string;
  name: string;
  country: string;
  disambiguation: string;
  score: number;
  names: string[];
};

type Resolution =
  | { kind: "ok"; artist: Candidate; via: string }
  | { kind: "ambiguous" | "missing"; candidates: Candidate[] };

class FatalError extends Error {}

// ---------- utilidades ----------

function object(value: unknown): Json {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fmt = (n: number) => n.toLocaleString("pt-BR");

// ---------- lista Markdown ----------

function parseList(content: string): ListEntry[] {
  const byKey = new Map<string, ListEntry>();
  for (const line of content.split(/\r?\n/)) {
    const match = LIST_LINE.exec(line);
    if (!match || match[2] !== " ") continue;
    const raw = match[4];
    const mbid = MBID_NOTE.exec(raw)?.[1] ?? null;
    const label = raw.replace(MBID_NOTE, "").trim();
    // "Irmãs Galvão (As Galvão)" → ["Irmãs Galvão", "As Galvão"]
    const names = [label.replace(/\s*\([^)]*\)\s*/g, " ").trim()];
    for (const alias of label.matchAll(/\(([^)]+)\)/g)) names.push(alias[1].trim());
    const key = mbid ?? normalizeName(names[0]);
    const existing = byKey.get(key);
    if (existing) existing.lines.push(line);
    else byKey.set(key, { lines: [line], label, names: names.filter(Boolean), mbid });
  }
  return [...byKey.values()];
}

async function markDone(file: string, entry: ListEntry) {
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

async function musicBrainzGet(admin: SupabaseClient | null, path: string, params: URLSearchParams): Promise<Json> {
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

async function resolveArtist(admin: SupabaseClient | null, entry: ListEntry): Promise<Resolution> {
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

type Recording = { title: string; artist: string; valid: boolean };

async function browseRecordings(admin: SupabaseClient | null, artistId: string, offset: number, limit = PAGE_SIZE) {
  const data = await musicBrainzGet(admin, "recording", new URLSearchParams({
    artist: artistId,
    inc: "artist-credits",
    limit: String(limit),
    offset: String(offset),
  }));
  const rows = Array.isArray(data.recordings) ? data.recordings : [];
  const recordings: Recording[] = rows.map((row) => {
    const recording = object(row);
    const credits = Array.isArray(recording["artist-credit"]) ? recording["artist-credit"] : [];
    const artist = credits.map((entry) => {
      const credit = object(entry);
      const joinphrase = typeof credit.joinphrase === "string" ? credit.joinphrase : "";
      return `${text(credit.name) || text(object(credit.artist).name)}${joinphrase}`;
    }).join("").trim();
    const title = text(recording.title);
    return {
      title,
      artist,
      valid: UUID.test(text(recording.id)) && title.length > 0 && title.length <= 160 && artist.length > 0 && artist.length <= 160,
    };
  });
  const reported = Number(data["recording-count"]);
  return { recordings, count: Number.isFinite(reported) && reported >= 0 ? reported : recordings.length };
}

// ---------- Supabase ----------

function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new FatalError("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env ou .env.local.");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function findImportAdmin(admin: SupabaseClient): Promise<{ id: string; email: string }> {
  const wantedEmail = process.env.IMPORT_ADMIN_EMAIL?.trim().toLowerCase();
  const admins: { id: string; email: string }[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new FatalError(`Não foi possível listar os usuários do Supabase (${error.message}).`);
    for (const user of data.users) {
      if (user.app_metadata?.role === "admin") admins.push({ id: user.id, email: user.email ?? "" });
    }
    if (data.users.length < 1000) break;
  }
  const chosen = wantedEmail ? admins.filter((user) => user.email.toLowerCase() === wantedEmail) : admins;
  if (chosen.length === 1) return chosen[0];
  if (wantedEmail) throw new FatalError(`IMPORT_ADMIN_EMAIL (${wantedEmail}) não corresponde a um administrador.`);
  throw new FatalError(
    admins.length === 0
      ? "Nenhum usuário com app_metadata.role = 'admin' foi encontrado."
      : "Há mais de um administrador. Defina IMPORT_ADMIN_EMAIL no .env para indicar o responsável pela importação.",
  );
}

async function insertRecordings(admin: SupabaseClient, recordings: Recording[], genre: string, adminId: string) {
  let imported = 0;
  let skipped = 0;
  for (let start = 0; start < recordings.length; start += INSERT_CONCURRENCY) {
    const chunk = recordings.slice(start, start + INSERT_CONCURRENCY);
    const results = await Promise.all(chunk.map((song) => admin.from("catalog_songs").insert({
      title: song.title,
      artist: song.artist,
      genre,
      version_label: "Original",
      chord_sheet: "",
      rights_status: "pending",
      created_by: adminId,
    })));
    for (const { error } of results) {
      if (!error) imported += 1;
      else if (error.code === "23505") skipped += 1;
      else throw new FatalError(`Falha ao salvar no catálogo (${error.code}: ${error.message}). Rode de novo; o que já foi salvo será ignorado.`);
    }
  }
  return { imported, skipped };
}

// ---------- execução ----------

function describe(candidate: Candidate) {
  const extra = [candidate.country, candidate.disambiguation].filter(Boolean).join(", ");
  return `${candidate.name}${extra ? ` (${extra})` : ""} <!-- mbid: ${candidate.id} -->`;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      genero: { type: "string" },
      simular: { type: "boolean", default: false },
      artista: { type: "string" },
      limite: { type: "string" },
    },
  });
  const file = positionals[0];
  const genre = values.genero?.trim() ?? "";
  const dryRun = values.simular ?? false;
  const limit = values.limite ? Number(values.limite) : Infinity;
  if (!file) throw new FatalError("Informe o arquivo da lista. Ex.: npm run importar:artistas -- lista-artistas-mpb.md --genero MPB");
  if (!dryRun && (genre.length < 1 || genre.length > 80)) throw new FatalError("Informe --genero com 1 a 80 caracteres.");
  if (!Number.isInteger(limit) && limit !== Infinity) throw new FatalError("--limite deve ser um número inteiro.");

  let entries = parseList(await readFile(file, "utf8"));
  if (values.artista) {
    const wanted = normalizeName(values.artista);
    entries = entries.filter((entry) => entry.names.some((name) => normalizeName(name) === wanted));
  }
  entries = entries.slice(0, limit);
  if (entries.length === 0) {
    console.log("Nenhum artista pendente ([ ]) para processar.");
    return;
  }

  const admin = dryRun ? null : createAdminClient();
  const importer = admin ? await findImportAdmin(admin) : null;
  console.log(`${dryRun ? "Simulação" : "Importação"} de ${entries.length} artista(s) de ${file}${genre ? ` · gênero "${genre}"` : ""}${importer ? ` · responsável ${importer.email}` : ""}\n`);

  const pendingReview: string[] = [];
  const doneMbids = new Set<string>();
  let totalImported = 0;
  let totalSkipped = 0;
  let totalInvalid = 0;
  let totalRecordings = 0;

  for (const [position, entry] of entries.entries()) {
    const prefix = `[${position + 1}/${entries.length}] ${entry.label}`;
    const resolution = await resolveArtist(admin, entry);
    if (resolution.kind !== "ok") {
      const reason = resolution.kind === "ambiguous" ? "mais de um artista possível" : "não encontrado";
      console.log(`✖ ${prefix}: ${reason}. Anote o MBID correto na lista e rode de novo.`);
      for (const candidate of resolution.candidates) console.log(`    · ${describe(candidate)}`);
      pendingReview.push(entry.label);
      continue;
    }
    const { artist, via } = resolution;
    if (doneMbids.has(artist.id)) {
      if (!dryRun) await markDone(file, entry);
      console.log(`↺ ${prefix}: mesmo artista já processado nesta execução.`);
      continue;
    }

    if (dryRun) {
      const { count } = await browseRecordings(admin, artist.id, 0, 1);
      totalRecordings += count;
      console.log(`✔ ${prefix} → ${describe(artist)} · ${fmt(count)} gravações · ${via}`);
      doneMbids.add(artist.id);
      continue;
    }

    if (!admin || !importer) throw new FatalError("Cliente do Supabase não configurado.");
    let offset = 0;
    let count = 0;
    let imported = 0;
    let skipped = 0;
    let invalid = 0;
    do {
      const batch = await browseRecordings(admin, artist.id, offset);
      count = batch.count;
      const valid = batch.recordings.filter((song) => song.valid);
      invalid += batch.recordings.length - valid.length;
      const saved = await insertRecordings(admin, valid, genre, importer.id);
      imported += saved.imported;
      skipped += saved.skipped;
      offset += PAGE_SIZE;
      process.stdout.write(`\r  ${entry.label}: ${fmt(Math.min(offset, count))}/${fmt(count)} verificadas · ${fmt(imported)} novas · ${fmt(skipped)} repetidas`);
      if (batch.recordings.length === 0) break;
    } while (offset < count);
    process.stdout.write("\n");

    await markDone(file, entry);
    doneMbids.add(artist.id);
    totalImported += imported;
    totalSkipped += skipped;
    totalInvalid += invalid;
    console.log(`✔ ${prefix} → ${artist.name}: ${fmt(imported)} novas, ${fmt(skipped)} repetidas, ${fmt(invalid)} inválidas`);
  }

  console.log("\nResumo");
  if (dryRun) console.log(`  ${doneMbids.size} artista(s) identificados · ${fmt(totalRecordings)} gravações no MusicBrainz (antes de remover repetidas)`);
  else console.log(`  ${fmt(totalImported)} músicas novas como pendentes · ${fmt(totalSkipped)} repetidas · ${fmt(totalInvalid)} inválidas`);
  if (pendingReview.length) console.log(`  ${pendingReview.length} artista(s) precisam de MBID manual: ${pendingReview.join(", ")}`);
  if (!dryRun && totalImported) console.log("  Revise em /admin/catalogo?situacao=pending");
}

main().catch((error: unknown) => {
  console.error(`\nErro: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
