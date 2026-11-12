"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  FACTUAL_METADATA_AUTHORIZATION,
  factualMetadataAuthorizationExpired,
  MAX_BULK_CATALOG_SELECTION,
} from "@/lib/catalog/metadata-authorization";
import { catalogPageHref, normalizeCatalogSearch, parseCatalogPage } from "@/lib/catalog/pagination";

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const LIST_FILTERS = ["", "metadata_pending", "metadata_reviewed", "popular", "pending", "approved", "rejected", "expired", "disputed"];

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item.trim() : "";
}

export async function addApprovedSongAction(formData: FormData) {
  const { supabase, adminId } = await requireAdmin();
  const title = value(formData, "title");
  const artist = value(formData, "artist");
  const genre = value(formData, "genre");
  const versionLabel = value(formData, "version_label") || "Original";
  const chordSheet = value(formData, "chord_sheet");
  const authorizationReference = value(formData, "authorization_reference");
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
    genre.length < 1 || genre.length > 80 ||
    versionLabel.length > 100 ||
    composers.length > 30 || composers.some((composer) => composer.length > 160) ||
    chordSheet.length > 40000 ||
    authorizationReference.length < 5 || authorizationReference.length > 1000 ||
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
    genre,
    composers,
    version_label: versionLabel,
    chord_sheet: chordSheet,
    authorization_reference: authorizationReference,
    rights_basis: rightsBasis,
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

export async function updateSongGenreAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const songId = value(formData, "song_id");
  const genre = value(formData, "genre");
  if (!/^[0-9a-f-]{36}$/i.test(songId) || genre.length < 1 || genre.length > 80) {
    redirect("/admin/catalogo?estado=campos");
  }

  const { error } = await supabase.from("catalog_songs").update({ genre }).eq("id", songId);
  if (error) redirect("/admin/catalogo?estado=erro");
  revalidatePath("/admin/catalogo");
  revalidatePath("/painel/repertorio");
  redirect("/admin/catalogo?estado=genero");
}

/** Back to the list the admin was looking at, with a notice. */
function listUrl(formData: FormData, estado: string, extra: Record<string, string> = {}, fallbackFilter = "metadata_pending") {
  const requested = value(formData, "situacao");
  const situacao = formData.has("situacao") && LIST_FILTERS.includes(requested) ? requested : fallbackFilter;
  return catalogPageHref("/admin/catalogo", normalizeCatalogSearch(value(formData, "q")), parseCatalogPage(value(formData, "pagina")), {
    situacao,
    estado,
    ...extra,
  });
}

function selectedIds(formData: FormData) {
  const rawIds = formData.getAll("song_id");
  const ids = [...new Set(rawIds.filter((id): id is string => typeof id === "string"))];
  const valid = ids.length >= 1 && ids.length <= MAX_BULK_CATALOG_SELECTION && ids.length === rawIds.length && ids.every((id) => UUID.test(id));
  return valid ? ids : null;
}

export async function validateCatalogMetadataBatchAction(formData: FormData) {
  const { supabase, adminId } = await requireAdmin();
  const ids = selectedIds(formData);
  if (!ids) redirect(listUrl(formData, "selecao"));

  const { data, error } = await supabase.from("catalog_songs")
    .update({ metadata_reviewed_at: new Date().toISOString(), metadata_reviewed_by: adminId })
    .in("id", ids)
    .eq("rights_status", "pending")
    .is("metadata_reviewed_at", null)
    .select("id");
  if (error) redirect(listUrl(formData, "erro"));
  revalidatePath("/admin/catalogo");
  redirect(listUrl(formData, "dados_validados", { quantidade: String(data?.length ?? 0) }));
}

/**
 * Publishes validated metadata drafts from the "Mais conhecidas" curation under the
 * factual-metadata authorization. Songs with a chord sheet are never covered by it.
 */
export async function publishFactualMetadataBatchAction(formData: FormData) {
  const { supabase, adminId } = await requireAdmin();
  const ids = selectedIds(formData);
  if (!ids || formData.get("rights_confirmed") !== "yes") redirect(listUrl(formData, "selecao_publicar", {}, "popular"));
  if (factualMetadataAuthorizationExpired()) redirect(listUrl(formData, "autorizacao_vencida", {}, "popular"));

  const { data, error } = await supabase.from("catalog_songs")
    .update({
      authorization_reference: FACTUAL_METADATA_AUTHORIZATION.reference,
      rights_basis: FACTUAL_METADATA_AUTHORIZATION.basis,
      rights_valid_until: FACTUAL_METADATA_AUTHORIZATION.validUntil,
      rights_status: "approved",
      rights_reviewed_at: new Date().toISOString(),
      rights_reviewed_by: adminId,
    })
    .in("id", ids)
    .eq("rights_status", "pending")
    .not("metadata_reviewed_at", "is", null)
    .not("popularity_rank", "is", null)
    .eq("chord_sheet", "")
    .select("id");
  if (error) {
    console.error("Falha na publicação em lote:", error.code);
    redirect(listUrl(formData, "erro", {}, "popular"));
  }
  revalidatePath("/admin/catalogo");
  revalidatePath("/painel/repertorio");
  const published = data?.length ?? 0;
  redirect(listUrl(formData, "publicadas", {
    quantidade: String(published),
    ignoradas: String(ids.length - published),
  }, "popular"));
}

/** Takes every song published under the factual-metadata authorization out of the public catalog. */
export async function withdrawFactualMetadataAuthorizationAction(formData: FormData) {
  const { supabase, adminId } = await requireAdmin();
  if (formData.get("withdraw_confirmed") !== "yes") redirect(listUrl(formData, "erro", {}, "popular"));

  const { data, error } = await supabase.from("catalog_songs")
    .update({ rights_status: "disputed", rights_reviewed_at: new Date().toISOString(), rights_reviewed_by: adminId })
    .eq("authorization_reference", FACTUAL_METADATA_AUTHORIZATION.reference)
    .eq("rights_status", "approved")
    .select("id");
  if (error) {
    console.error("Falha ao retirar a autorização em lote:", error.code);
    redirect(listUrl(formData, "erro", {}, "popular"));
  }
  revalidatePath("/admin/catalogo");
  revalidatePath("/painel/repertorio");
  redirect(listUrl(formData, "retiradas", { quantidade: String(data?.length ?? 0) }, "popular"));
}
