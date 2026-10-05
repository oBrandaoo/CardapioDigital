"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item.trim() : "";
}

export async function addApprovedSongAction(formData: FormData) {
  const { supabase, adminId } = await requireAdmin();
  const title = value(formData, "title");
  const artist = value(formData, "artist");
  const versionLabel = value(formData, "version_label") || "Original";
  const originalKey = value(formData, "original_key");
  const chordSheet = value(formData, "chord_sheet");
  const sourceReference = value(formData, "source_reference");
  const rightsBasis = value(formData, "rights_basis");
  const composers = value(formData, "composers")
    .split("\n")
    .map((composer) => composer.trim())
    .filter(Boolean);
  const validUntilValue = value(formData, "rights_valid_until");
  const rightsConfirmed = formData.get("rights_confirmed") === "yes";

  if (
    title.length < 1 || title.length > 160 ||
    artist.length < 1 || artist.length > 160 ||
    versionLabel.length > 100 || originalKey.length > 8 ||
    composers.length > 30 || composers.some((composer) => composer.length > 160) ||
    chordSheet.length < 1 || chordSheet.length > 40000 ||
    sourceReference.length < 5 || sourceReference.length > 1000 ||
    rightsBasis.length < 5 || rightsBasis.length > 2000 || !rightsConfirmed
  ) {
    redirect("/admin/catalogo?estado=campos");
  }

  const rightsValidUntil = validUntilValue ? new Date(`${validUntilValue}T23:59:59.000Z`) : null;
  if (rightsValidUntil && Number.isNaN(rightsValidUntil.getTime())) {
    redirect("/admin/catalogo?estado=campos");
  }

  const { error } = await supabase.from("catalog_songs").insert({
    title,
    artist,
    composers,
    version_label: versionLabel,
    original_key: originalKey || null,
    chord_sheet: chordSheet,
    source_reference: sourceReference,
    rights_basis: rightsBasis,
    rights_territories: ["BR"],
    rights_valid_until: validUntilValue || null,
    rights_status: "approved",
    rights_reviewed_at: new Date().toISOString(),
    rights_reviewed_by: adminId,
    created_by: adminId,
  });

  if (error) redirect("/admin/catalogo?estado=erro");
  revalidatePath("/admin/catalogo");
  revalidatePath("/painel/repertorio");
  redirect("/admin/catalogo?estado=salva");
}

export async function withdrawSongAction(formData: FormData) {
  const { supabase, adminId } = await requireAdmin();
  const songId = value(formData, "song_id");
  if (!/^[0-9a-f-]{36}$/i.test(songId)) redirect("/admin/catalogo?estado=erro");

  const { error } = await supabase
    .from("catalog_songs")
    .update({ rights_status: "disputed", rights_reviewed_at: new Date().toISOString(), rights_reviewed_by: adminId })
    .eq("id", songId);

  if (error) redirect("/admin/catalogo?estado=erro");
  revalidatePath("/admin/catalogo");
  revalidatePath("/painel/repertorio");
  redirect("/admin/catalogo?estado=retirada");
}
