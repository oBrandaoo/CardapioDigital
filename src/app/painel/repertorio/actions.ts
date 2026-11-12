"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveMusician } from "@/lib/auth/require-active-musician";
import { normalizeCatalogSearch, parseCatalogPage } from "@/lib/catalog/pagination";

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const MAX_BATCH = 30;

// Keeps the musician on the same tab, search and page after each action.
function returnTo(formData: FormData, estado: string, extra: Record<string, string> = {}) {
  const params = new URLSearchParams();
  if (formData.get("aba") === "meu") params.set("aba", "meu");
  const query = normalizeCatalogSearch(String(formData.get("q") ?? ""));
  if (query) params.set("q", query);
  const page = parseCatalogPage(String(formData.get("pagina") ?? ""));
  if (page > 1) params.set("pagina", String(page));
  params.set("estado", estado);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  return `/painel/repertorio?${params}`;
}

function refresh() {
  revalidatePath("/painel/repertorio");
  revalidatePath("/painel");
}

export async function addSongToRepertoireAction(formData: FormData) {
  const { supabase, musicianId } = await requireActiveMusician();
  const songId = String(formData.get("song_id") ?? "");
  if (!UUID.test(songId)) redirect(returnTo(formData, "musica"));

  const { error } = await supabase.from("repertoire_items").insert({
    musician_id: musicianId,
    song_id: songId,
    price_cents: 0,
    is_enabled: true,
  });

  if (error && error.code !== "23505") redirect(returnTo(formData, "musica"));
  refresh();
  redirect(returnTo(formData, "adicionada"));
}

export async function addSongsToRepertoireAction(formData: FormData) {
  const { supabase, musicianId } = await requireActiveMusician();
  const rawIds = formData.getAll("song_id");
  const ids = [...new Set(rawIds.filter((id): id is string => typeof id === "string"))];
  if (ids.length < 1) redirect(returnTo(formData, "selecao"));
  if (ids.length > MAX_BATCH || ids.length !== rawIds.length || ids.some((id) => !UUID.test(id))) {
    redirect(returnTo(formData, "musica"));
  }

  const { data, error } = await supabase
    .from("repertoire_items")
    .upsert(
      ids.map((songId) => ({ musician_id: musicianId, song_id: songId, price_cents: 0, is_enabled: true })),
      { onConflict: "musician_id,song_id", ignoreDuplicates: true },
    )
    .select("id");

  if (error) redirect(returnTo(formData, "musica"));
  refresh();
  redirect(returnTo(formData, "adicionadas", { quantidade: String(data?.length ?? 0) }));
}

export async function removeSongFromRepertoireAction(formData: FormData) {
  const { supabase, musicianId } = await requireActiveMusician();
  const itemId = String(formData.get("item_id") ?? "");
  if (!UUID.test(itemId)) redirect(returnTo(formData, "musica"));

  const { error } = await supabase
    .from("repertoire_items")
    .delete()
    .eq("id", itemId)
    .eq("musician_id", musicianId);

  if (error) redirect(returnTo(formData, "musica"));
  refresh();
  redirect(returnTo(formData, "removida"));
}

export async function updateRepertoirePriceAction(formData: FormData) {
  const { supabase, musicianId } = await requireActiveMusician();
  const itemId = String(formData.get("item_id") ?? "");
  const rawPrice = String(formData.get("price") ?? "").trim().replace(",", ".");
  if (!UUID.test(itemId) || !/^(?:\d|[1-4]\d?|5)(?:\.\d{1,2})?$/.test(rawPrice)) {
    redirect(returnTo(formData, "valor"));
  }

  const [wholePart, decimalPart = ""] = rawPrice.split(".");
  const priceCents = Number(wholePart) * 100 + Number(decimalPart.padEnd(2, "0"));
  if (!Number.isFinite(priceCents) || priceCents < 0 || priceCents > 500) {
    redirect(returnTo(formData, "valor"));
  }

  const { data, error } = await supabase
    .from("repertoire_items")
    .update({ price_cents: priceCents })
    .eq("id", itemId)
    .eq("musician_id", musicianId)
    .select("id")
    .maybeSingle();

  if (error || !data) redirect(returnTo(formData, "valor"));
  refresh();
  redirect(returnTo(formData, priceCents === 0 ? "gratuita" : "valor_salvo"));
}
