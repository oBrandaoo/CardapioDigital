"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { normalizeCatalogSearch, parseCatalogPage } from "@/lib/catalog/pagination";
import { browseMusicBrainzRecordings, MUSICBRAINZ_MAX_PAGE, MUSICBRAINZ_PAGE_SIZE } from "@/lib/catalog/musicbrainz";

function resultUrl(formData: FormData, state: string, imported = 0, skipped = 0) {
  const params = new URLSearchParams();
  const artistId = String(formData.get("artist_id") ?? "");
  const query = normalizeCatalogSearch(String(formData.get("q") ?? ""));
  const page = parseCatalogPage(String(formData.get("page") ?? ""));
  if (/^[0-9a-f-]{36}$/i.test(artistId)) params.set("artista", artistId);
  if (query) params.set("q", query);
  if (page > 1 && page <= MUSICBRAINZ_MAX_PAGE) params.set("pagina", String(page));
  params.set("estado", state);
  if (imported) params.set("importadas", String(imported));
  if (skipped) params.set("repetidas", String(skipped));
  return `/admin/catalogo/musicbrainz?${params}`;
}

export async function importMusicBrainzRecordingsAction(formData: FormData) {
  const { supabase, adminId } = await requireAdmin();
  const artistId = String(formData.get("artist_id") ?? "");
  const page = parseCatalogPage(String(formData.get("page") ?? ""));
  const genre = String(formData.get("genre") ?? "").trim();
  const ids = formData.getAll("recording_id");
  if (
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(artistId) ||
    page > MUSICBRAINZ_MAX_PAGE || genre.length < 1 || genre.length > 80 ||
    ids.length < 1 || ids.length > MUSICBRAINZ_PAGE_SIZE ||
    ids.some((id) => typeof id !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))
  ) redirect(resultUrl(formData, "campos"));

  let recordings;
  try {
    ({ recordings } = await browseMusicBrainzRecordings(artistId, page));
  } catch {
    redirect(resultUrl(formData, "api"));
  }
  const selected = new Set(ids as string[]);
  const songs = recordings.filter((recording) => selected.has(recording.id) && recording.canImport);
  if (songs.length !== selected.size) redirect(resultUrl(formData, "campos"));

  let imported = 0;
  let skipped = 0;
  for (const song of songs) {
    const { error } = await supabase.from("catalog_songs").insert({
      title: song.title,
      artist: song.artist,
      genre,
      version_label: "Original",
      chord_sheet: "",
      rights_status: "pending",
      created_by: adminId,
    });
    if (error?.code === "23505") {
      skipped += 1;
    } else if (error) {
      console.error("Falha ao salvar metadados do MusicBrainz:", error.code);
      revalidatePath("/admin/catalogo");
      redirect(resultUrl(formData, "parcial", imported, skipped));
    } else {
      imported += 1;
    }
  }

  revalidatePath("/admin/catalogo");
  redirect(resultUrl(formData, "salva", imported, skipped));
}

export type MusicBrainzBulkResult = {
  ok: boolean;
  message?: string;
  nextPage: number;
  count: number;
  scanned: number;
  imported: number;
  skipped: number;
  invalid: number;
  done: boolean;
};

export async function importAllMusicBrainzPageAction(
  artistId: string,
  genreInput: string,
  page: number,
): Promise<MusicBrainzBulkResult> {
  const { supabase, adminId } = await requireAdmin();
  const genre = genreInput.trim();
  const base = { nextPage: page, count: 0, scanned: 0, imported: 0, skipped: 0, invalid: 0, done: false };
  if (
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(artistId) ||
    !Number.isSafeInteger(page) || page < 1 || page > MUSICBRAINZ_MAX_PAGE ||
    genre.length < 1 || genre.length > 80
  ) return { ...base, ok: false, message: "Artista, página ou gênero inválido." };

  let batch;
  try {
    batch = await browseMusicBrainzRecordings(artistId, page);
  } catch {
    return { ...base, ok: false, message: "Não foi possível consultar o MusicBrainz. Tente continuar em instantes." };
  }

  let imported = 0;
  let skipped = 0;
  let invalid = 0;
  for (const song of batch.recordings) {
    if (!song.canImport) {
      invalid += 1;
      continue;
    }
    const { error } = await supabase.from("catalog_songs").insert({
      title: song.title,
      artist: song.artist,
      genre,
      version_label: "Original",
      chord_sheet: "",
      rights_status: "pending",
      created_by: adminId,
    });
    if (error?.code === "23505") skipped += 1;
    else if (error) {
      console.error("Falha na importação completa do MusicBrainz:", error.code);
      if (imported > 0) revalidatePath("/admin/catalogo");
      return {
        ...base, ok: false,
        message: "Falha ao salvar no catálogo. O lote pode estar parcial; continuar repetirá esta página e ignorará o que já foi salvo.",
      };
    } else imported += 1;
  }

  const scanned = batch.recordings.length;
  const done = scanned === 0 || page * MUSICBRAINZ_PAGE_SIZE >= batch.count;
  if (done || imported > 0) revalidatePath("/admin/catalogo");
  return {
    ok: true,
    nextPage: page + 1,
    count: batch.count,
    scanned,
    imported,
    skipped,
    invalid,
    done,
  };
}
