"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function validDate(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function readSong(formData: FormData) {
  const id = field(formData, "song_id");
  const title = field(formData, "title");
  const artist = field(formData, "artist");
  const genre = field(formData, "genre");
  const chordSheet = field(formData, "chord_sheet");
  const authorizationReference = field(formData, "authorization_reference");
  const rightsBasis = field(formData, "rights_basis");
  const validUntil = field(formData, "rights_valid_until");
  const valid = /^[0-9a-f-]{36}$/i.test(id) &&
    title.length >= 1 && title.length <= 160 && artist.length >= 1 && artist.length <= 160 &&
    genre.length >= 1 && genre.length <= 80 &&
    chordSheet.length >= 1 && chordSheet.length <= 40_000 &&
    authorizationReference.length <= 1000 && rightsBasis.length <= 2000 && validDate(validUntil);

  return {
    id, valid, authorizationReference, rightsBasis, validUntil,
    values: {
      title, artist, genre,
      chord_sheet: chordSheet, authorization_reference: authorizationReference || null,
      rights_basis: rightsBasis || null,
      rights_valid_until: validUntil || null,
    },
  };
}

export async function savePendingSongAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const song = readSong(formData);
  if (!song.valid) redirect("/admin/catalogo?estado=campos");

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

export async function approvePendingSongAction(formData: FormData) {
  const { supabase, adminId } = await requireAdmin();
  const song = readSong(formData);
  const confirmed = formData.get("rights_confirmed") === "yes";
  if (!song.valid || !confirmed || song.authorizationReference.length < 5 || song.rightsBasis.length < 5 ||
      (song.validUntil && song.validUntil < new Date().toISOString().slice(0, 10))) {
    redirect("/admin/catalogo?estado=campos");
  }

  const { data, error } = await supabase.from("catalog_songs")
    .update({
      ...song.values,
      rights_status: "approved",
      rights_reviewed_at: new Date().toISOString(),
      rights_reviewed_by: adminId,
    })
    .eq("id", song.id)
    .eq("rights_status", "pending")
    .select("id")
    .maybeSingle();
  if (error || !data) redirect("/admin/catalogo?estado=erro");
  revalidatePath("/admin/catalogo");
  revalidatePath("/painel/repertorio");
  redirect("/admin/catalogo?estado=aprovada");
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
  redirect("/admin/catalogo?estado=rejeitada");
}
