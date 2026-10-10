"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item.trim() : "";
}

function validDate(value: string) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function publishCatalogSongAction(formData: FormData) {
  const { supabase, adminId } = await requireAdmin();
  const songId = value(formData, "song_id");
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(songId)) redirect("/admin/catalogo?estado=erro");
  const destination = `/admin/catalogo/${songId}/publicar`;
  const reference = value(formData, "authorization_reference");
  const basis = value(formData, "rights_basis");
  const validUntil = value(formData, "rights_valid_until");
  if (
    reference.length < 5 || reference.length > 1000 ||
    basis.length < 5 || basis.length > 2000 ||
    !validDate(validUntil) || (validUntil && validUntil < new Date().toISOString().slice(0, 10)) ||
    formData.get("rights_confirmed") !== "yes"
  ) redirect(`${destination}?estado=campos`);

  const { data: song, error: lookupError } = await supabase.from("catalog_songs")
    .select("metadata_reviewed_at, rights_status")
    .eq("id", songId)
    .maybeSingle();
  if (lookupError || !song || song.rights_status !== "pending" || !song.metadata_reviewed_at) {
    redirect(`${destination}?estado=bloqueada`);
  }

  const { data, error } = await supabase.from("catalog_songs")
    .update({
      authorization_reference: reference,
      rights_basis: basis,
      rights_valid_until: validUntil || null,
      rights_status: "approved",
      rights_reviewed_at: new Date().toISOString(),
      rights_reviewed_by: adminId,
    })
    .eq("id", songId)
    .eq("rights_status", "pending")
    .not("metadata_reviewed_at", "is", null)
    .select("id")
    .maybeSingle();
  if (error || !data) redirect(`${destination}?estado=erro`);
  revalidatePath("/admin/catalogo");
  revalidatePath("/painel/repertorio");
  redirect("/admin/catalogo?estado=aprovada&situacao=approved");
}
