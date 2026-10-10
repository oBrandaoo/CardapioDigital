"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { duplicateKey, parseImportFiles, type ImportSong } from "@/lib/catalog/import";

export type ImportPreview = {
  fingerprint: string;
  issues: string[];
  rows: { line: number; title: string; artist: string; genre: string; filename: string; issues: string[] }[];
};

type ImportResult = { ok: boolean; message: string; imported?: number };

async function flagExistingSongs(
  songs: ImportSong[],
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
) {
  await Promise.all(songs.map(async (song) => {
    if (song.issues.length || !song.title) return;
    const { data, error } = await supabase
      .from("catalog_songs")
      .select("title, artist, version_label")
      .ilike("title", `%${song.title.trim().replace(/\s+/g, "%")}%`)
      .limit(1000);
    if (error) {
      song.issues.push("não foi possível consultar duplicatas no banco");
      return;
    }
    const key = duplicateKey(song);
    if ((data ?? []).some((record) => duplicateKey(record) === key)) {
      song.issues.push("já cadastrada no catálogo");
    }
  }));
}

async function inspectImport(formData: FormData) {
  const { supabase } = await requireAdmin();
  const parsed = await parseImportFiles(formData);
  if (parsed.songs.length && !parsed.issues.length) {
    await flagExistingSongs(parsed.songs, supabase);
  }
  return { supabase, parsed };
}

export async function previewCatalogImportAction(formData: FormData): Promise<ImportPreview> {
  const { parsed } = await inspectImport(formData);
  return {
    fingerprint: parsed.fingerprint,
    issues: parsed.issues,
    rows: parsed.songs.map((song) => ({
      line: song.line,
      title: song.title,
      artist: song.artist,
      genre: song.genre,
      filename: song.filename,
      issues: song.issues,
    })),
  };
}

export async function commitCatalogImportAction(formData: FormData): Promise<ImportResult> {
  const expectedFingerprint = formData.get("fingerprint");
  const { supabase, parsed } = await inspectImport(formData);
  if (typeof expectedFingerprint !== "string" || !expectedFingerprint || expectedFingerprint !== parsed.fingerprint) {
    return { ok: false, message: "Os arquivos mudaram após a prévia. Revise o lote novamente." };
  }
  if (parsed.issues.length || parsed.songs.some((song) => song.issues.length) || !parsed.songs.length) {
    return { ok: false, message: "O lote contém erros ou duplicatas. Corrija os arquivos e gere outra prévia." };
  }

  const { adminId } = await requireAdmin();
  const { error } = await supabase.from("catalog_songs").insert(parsed.songs.map((song) => ({
    title: song.title,
    artist: song.artist,
    genre: song.genre,
    composers: song.composers,
    version_label: song.version_label,
    chord_sheet: song.chord_sheet,
    authorization_reference: song.authorization_reference || null,
    rights_basis: song.rights_basis || null,
    rights_valid_until: song.rights_valid_until,
    rights_status: "pending",
    created_by: adminId,
  })));

  if (error) {
    console.error("Falha na importação do catálogo:", error.code);
    return { ok: false, message: "Não foi possível salvar o lote. Nenhuma música foi publicada." };
  }
  revalidatePath("/admin/catalogo");
  revalidatePath("/admin/catalogo/importar");
  return { ok: true, message: `${parsed.songs.length} músicas importadas como pendentes de revisão.`, imported: parsed.songs.length };
}
