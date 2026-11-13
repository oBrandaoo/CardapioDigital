// Importa do MusicBrainz as gravações de todos os artistas pendentes ("- [ ]")
// de uma lista Markdown, como rascunhos privados (rights_status = 'pending').
//
// Uso:
//   npm run importar:artistas -- <lista.md> --genero <Gênero> [--simular] [--artista <nome>] [--limite <n>]
//
// Segue as mesmas regras da importação em /admin/catalogo/musicbrainz
// (src/app/admin/catalogo/musicbrainz/actions.ts e src/lib/catalog/musicbrainz.ts):
// só metadados (título e artista), sem cifra, versão "Original", duplicatas
// ignoradas pelo índice único do banco e intervalo mínimo de 1,1 s entre chamadas.
// Títulos perdem sufixos de versão ("(Ao Vivo)", "- Remastered"), participações
// saem do artista e gravações coletivas (mais de 3 artistas), medleys ou com
// título/artista fora do alfabeto latino (traduções em cirílico etc.) são
// puladas (src/lib/catalog/recording-metadata.ts).
// Metadados do MusicBrainz não autorizam publicação: tudo entra como pendente.
//
// Para fixar um artista ambíguo, anote o MBID na linha da lista:
//   - [ ] Simone <!-- mbid: 00000000-0000-0000-0000-000000000000 -->

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { exactSongKey, prepareRecording, type RecordingMetadata } from "../src/lib/catalog/recording-metadata.ts";
import {
  createAdminClient, describe, FatalError, fmt, markDone, musicBrainzGet, normalizeName, object,
  parseList, resolveArtist, runMain, text, UUID,
} from "./lib/musicbrainz-script.mts";

const PAGE_SIZE = 100; // máximo aceito pelo MusicBrainz em consultas "browse"
const INSERT_CONCURRENCY = 8;

type Recording = RecordingMetadata;

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
    const prepared = prepareRecording(text(recording.title), credits.map((entry) => {
      const credit = object(entry);
      return {
        name: text(credit.name) || text(object(credit.artist).name),
        joinphrase: typeof credit.joinphrase === "string" ? credit.joinphrase : "",
      };
    }));
    if (!UUID.test(text(recording.id))) return { ...prepared, valid: false, reason: "invalid" };
    return prepared;
  });
  const reported = Number(data["recording-count"]);
  return { recordings, count: Number.isFinite(reported) && reported >= 0 ? reported : recordings.length };
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
  let totalFiltered = 0;
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
    const seen = new Set<string>();
    let offset = 0;
    let count = 0;
    let imported = 0;
    let skipped = 0;
    let invalid = 0;
    let filtered = 0;
    do {
      const batch = await browseRecordings(admin, artist.id, offset);
      count = batch.count;
      const fresh: Recording[] = [];
      for (const song of batch.recordings) {
        if (song.reason === "invalid") invalid += 1;
        else if (!song.valid) filtered += 1;
        else {
          // Várias gravações viram o mesmo título depois da limpeza; só a primeira vai ao banco.
          const key = exactSongKey(song.title, song.artist);
          if (seen.has(key)) skipped += 1;
          else {
            seen.add(key);
            fresh.push(song);
          }
        }
      }
      const saved = await insertRecordings(admin, fresh, genre, importer.id);
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
    totalFiltered += filtered;
    console.log(`✔ ${prefix} → ${artist.name}: ${fmt(imported)} novas, ${fmt(skipped)} repetidas, ${fmt(filtered)} coletivas/medleys/não latinas, ${fmt(invalid)} inválidas`);
  }

  console.log("\nResumo");
  if (dryRun) console.log(`  ${doneMbids.size} artista(s) identificados · ${fmt(totalRecordings)} gravações no MusicBrainz (antes de remover repetidas)`);
  else console.log(`  ${fmt(totalImported)} músicas novas como pendentes · ${fmt(totalSkipped)} repetidas · ${fmt(totalFiltered)} coletivas/medleys/não latinas · ${fmt(totalInvalid)} inválidas`);
  if (pendingReview.length) console.log(`  ${pendingReview.length} artista(s) precisam de MBID manual: ${pendingReview.join(", ")}`);
  if (!dryRun && totalImported) console.log("  Revise em /admin/catalogo?situacao=pending");
}

runMain(main);
