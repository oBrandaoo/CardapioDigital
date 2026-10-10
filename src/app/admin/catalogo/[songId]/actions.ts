"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function readSong(formData: FormData) {
  const id = field(formData, "song_id");
  const title = field(formData, "title");
  const artist = field(formData, "artist");
  const genre = field(formData, "genre");
  const chordSheet = field(formData, "chord_sheet");
  const valid = /^[0-9a-f-]{36}$/i.test(id) &&
    title.length >= 1 && title.length <= 160 && artist.length >= 1 && artist.length <= 160 &&
    genre.length >= 1 && genre.length <= 80 &&
    chordSheet.length <= 40_000;

  return {
    id, valid,
    values: {
      title, artist, genre,
      chord_sheet: chordSheet,
    },
  };
}

export async function savePendingSongAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const song = readSong(formData);
  if (!song.valid) redirect(/^[0-9a-f-]{36}$/i.test(song.id) ? `/admin/catalogo/${song.id}?estado=campos` : "/admin/catalogo?estado=campos");

  const { data, error } = await supabase.from("catalog_songs")
    .update(song.values)
    .eq("id", song.id)
    .eq("rights_status", "pending")
    .select("id")
    .maybeSingle();
  if (error || !data) redirect("/admin/catalogo?estado=erro");
  revalidatePath("/admin/catalogo");
  redirect(`/admin/catalogo/${song.id}?estado=salva`);
}

export async function validateSongMetadataAction(formData: FormData) {
  const { supabase, adminId } = await requireAdmin();
  const song = readSong(formData);
  if (!song.valid) {
    redirect(/^[0-9a-f-]{36}$/i.test(song.id) ? `/admin/catalogo/${song.id}?estado=campos` : "/admin/catalogo?estado=campos");
  }

  const { data, error } = await supabase.from("catalog_songs")
    .update({
      ...song.values,
      metadata_reviewed_at: new Date().toISOString(),
      metadata_reviewed_by: adminId,
    })
    .eq("id", song.id)
    .eq("rights_status", "pending")
    .select("id")
    .maybeSingle();
  if (error || !data) redirect("/admin/catalogo?estado=erro");
  revalidatePath("/admin/catalogo");
  redirect("/admin/catalogo?estado=dados_validados&situacao=metadata_pending&quantidade=1");
}

export async function rejectPendingSongAction(formData: FormData) {
  const { supabase, adminId } = await requireAdmin();
  const songId = field(formData, "song_id");
  if (!/^[0-9a-f-]{36}$/i.test(songId)) redirect("/admin/catalogo?estado=erro");
  const { data, error } = await supabase.from("catalog_songs")
    .update({ rights_status: "rejected", rights_reviewed_at: new Date().toISOString(), rights_reviewed_by: adminId })
    .eq("id", songId)
    .eq("rights_status", "pending")
    .select("id")
    .maybeSingle();
  if (error || !data) redirect("/admin/catalogo?estado=erro");
  revalidatePath("/admin/catalogo");
  redirect("/admin/catalogo?estado=rejeitada&situacao=pending");
}
