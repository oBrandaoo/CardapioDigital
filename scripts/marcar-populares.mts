// Marca no catálogo as músicas mais ouvidas de cada artista das listas,
// usando a contagem de execuções do ListenBrainz (projeto irmão do MusicBrainz).
// Grava só catalog_songs.popularity_rank (1 = mais ouvida do artista). Não aprova
// nem publica nada: é um recorte para curadoria em /admin/catalogo?situacao=popular.
//
// Uso:
//   npm run marcar:populares -- <lista.md> [outra-lista.md ...] [--top 30] [--simular] [--artista <nome>]
//
// Requer LISTENBRAINZ_TOKEN no .env.local (token gratuito em
// https://listenbrainz.org/settings/ depois de criar uma conta). A identificação
// do artista segue a mesma regra da importação, inclusive o MBID anotado na lista.
// Cada execução recalcula todo o recorte: rode com todas as listas de uma vez.

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  createAdminClient, describe, FatalError, fmt, normalizeName, object, parseList,
  resolveArtist, runMain, sleep, text, USER_AGENT, type ListEntry,
} from "./lib/musicbrainz-script.mts";

const LISTENBRAINZ_ROOT = "https://api.listenbrainz.org/1";
const RECORDINGS_PER_ARTIST = 100;
const ARTISTS_PER_WRITE = 20;

type PopularityEntry = { artist_group: string; listen_rank: number; title: string; artist: string };

async function topRecordings(token: string, artistId: string): Promise<{ title: string; artist: string; listens: number }[]> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    let response: Response | null = null;
    try {
      response = await fetch(`${LISTENBRAINZ_ROOT}/popularity/top-recordings-for-artist/${artistId}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json", Authorization: `Token ${token}` },
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      response = null;
    }
    if (response?.ok) {
      const remaining = Number(response.headers.get("X-RateLimit-Remaining"));
      const resetIn = Number(response.headers.get("X-RateLimit-Reset-In"));
      const data: unknown = await response.json();
      if (remaining === 0 && Number.isFinite(resetIn)) await sleep((resetIn + 1) * 1000);
      return (Array.isArray(data) ? data : []).slice(0, RECORDINGS_PER_ARTIST).map((row) => {
        const recording = object(row);
        return {
          title: text(recording.recording_name),
          artist: text(recording.artist_name),
          listens: Number(recording.total_listen_count) || 0,
        };
      }).filter((recording) => recording.title && recording.artist);
    }
    if (response?.status === 401) throw new FatalError("O ListenBrainz recusou o token. Confira LISTENBRAINZ_TOKEN.");
    if (response?.status === 400 || response?.status === 404) return [];
    const resetIn = Number(response?.headers.get("X-RateLimit-Reset-In"));
    const wait = response?.status === 429 && Number.isFinite(resetIn) ? (resetIn + 1) * 1000 : 2000 * 2 ** attempt;
    console.warn(`  ListenBrainz indisponível (${response?.status ?? "rede"}); nova tentativa em ${Math.round(wait / 1000)}s…`);
    await sleep(wait);
  }
  throw new FatalError("ListenBrainz continua indisponível. Rode o comando de novo mais tarde; nada foi gravado.");
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      top: { type: "string", default: "30" },
      simular: { type: "boolean", default: false },
      artista: { type: "string" },
    },
  });
  const top = Number(values.top);
  const dryRun = values.simular ?? false;
  if (positionals.length === 0) throw new FatalError("Informe as listas. Ex.: npm run marcar:populares -- lista-artistas-mpb.md lista-artistas-sertanejo.md");
  if (!Number.isInteger(top) || top < 1 || top > 200) throw new FatalError("--top deve ser um número inteiro de 1 a 200.");
  if (!dryRun && values.artista) throw new FatalError("--artista só pode ser usado com --simular, porque cada gravação recalcula o recorte inteiro.");
  const token = process.env.LISTENBRAINZ_TOKEN?.trim();
  if (!token) throw new FatalError("Defina LISTENBRAINZ_TOKEN no .env.local (token em https://listenbrainz.org/settings/).");

  const byLabel = new Map<string, ListEntry>();
  for (const file of positionals) {
    for (const entry of parseList(await readFile(file, "utf8"), true)) {
      const key = entry.mbid ?? normalizeName(entry.names[0]);
      if (!byLabel.has(key)) byLabel.set(key, entry);
    }
  }
  let entries = [...byLabel.values()];
  if (values.artista) {
    const wanted = normalizeName(values.artista);
    entries = entries.filter((entry) => entry.names.some((name) => normalizeName(name) === wanted));
  }
  if (entries.length === 0) {
    console.log("Nenhum artista nas listas.");
    return;
  }

  const admin = dryRun ? null : createAdminClient();
  console.log(`${dryRun ? "Simulação" : "Marcação"} das ${top} mais ouvidas de ${entries.length} artista(s)\n`);

  // 1. Consulta tudo antes de gravar, para uma falha de rede não deixar o recorte pela metade.
  const groups: PopularityEntry[][] = [];
  const unresolved: string[] = [];
  const seenArtists = new Set<string>();
  for (const [position, entry] of entries.entries()) {
    const prefix = `[${position + 1}/${entries.length}] ${entry.label}`;
    const resolution = await resolveArtist(admin, entry);
    if (resolution.kind !== "ok") {
      console.log(`✖ ${prefix}: ${resolution.kind === "ambiguous" ? "mais de um artista possível" : "não encontrado"}. Anote o MBID na lista.`);
      for (const candidate of resolution.candidates) console.log(`    · ${describe(candidate)}`);
      unresolved.push(entry.label);
      continue;
    }
    if (seenArtists.has(resolution.artist.id)) continue;
    seenArtists.add(resolution.artist.id);
    const recordings = await topRecordings(token, resolution.artist.id);
    groups.push(recordings.map((recording, index) => ({
      artist_group: resolution.artist.id,
      listen_rank: index + 1,
      title: recording.title,
      artist: recording.artist,
    })));
    const preview = recordings.slice(0, dryRun ? 5 : 3).map((recording) => recording.title).join(" · ");
    console.log(`✔ ${prefix}: ${fmt(recordings.length)} gravações com execuções${preview ? ` · ${preview}` : ""}`);
  }

  if (dryRun || !admin) {
    console.log(`\nSimulação concluída. ${groups.length} artista(s) com dados; nada foi gravado.`);
    if (unresolved.length) console.log(`  Sem identificação: ${unresolved.join(", ")}`);
    return;
  }

  // 2. Grava em blocos; o primeiro limpa o recorte anterior.
  let updated = 0;
  for (let start = 0; start < groups.length; start += ARTISTS_PER_WRITE) {
    const chunk = groups.slice(start, start + ARTISTS_PER_WRITE).flat();
    const { data, error } = await admin.rpc("set_catalog_popularity", { entries: chunk, top_n: top, reset: start === 0 });
    if (error) throw new FatalError(`Falha ao gravar a popularidade (${error.code}: ${error.message}). As migrations foram aplicadas? Rode de novo.`);
    updated += Number(data) || 0;
    process.stdout.write(`\r  Gravando: ${Math.min(start + ARTISTS_PER_WRITE, groups.length)}/${groups.length} artistas`);
  }
  process.stdout.write("\n");

  const { count } = await admin.from("catalog_songs").select("id", { count: "exact", head: true }).not("popularity_rank", "is", null);
  console.log(`\nResumo\n  ${fmt(count ?? updated)} músicas do catálogo marcadas entre as ${top} mais ouvidas de seus artistas.`);
  if (unresolved.length) console.log(`  ${unresolved.length} artista(s) sem identificação: ${unresolved.join(", ")}`);
  console.log("  Revise em /admin/catalogo?situacao=popular");
}

runMain(main);
