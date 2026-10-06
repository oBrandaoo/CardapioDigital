"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { normalizeCatalogSearch, parseCatalogPage } from "@/lib/catalog/pagination";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRequestVisitorToken } from "@/lib/security/request-token";

export async function submitSongRequestAction(formData: FormData) {
  const performanceId = String(formData.get("performance_id") ?? "");
  const songId = String(formData.get("song_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const requesterName = String(formData.get("requester_name") ?? "").trim().slice(0, 60);

  if (!/^[0-9a-f-]{36}$/i.test(performanceId) || !/^[0-9a-f-]{36}$/i.test(songId) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    redirect("/m/banda-mare?pedido=indisponivel");
  }
  const searchTerm = normalizeCatalogSearch(String(formData.get("search_query") ?? ""))
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const genre = String(formData.get("search_genre") ?? "").trim().slice(0, 80);
  const page = parseCatalogPage(String(formData.get("search_page") ?? ""));
  const resultHref = (state: string) => {
    const params = new URLSearchParams({ pedido: state });
    if (searchTerm) params.set("q", searchTerm);
    if (genre) params.set("genero", genre);
    if (page > 1) params.set("pagina", String(page));
    return `/m/${slug}/musicas?${params.toString()}`;
  };

  const admin = createSupabaseAdminClient();
  const visitorToken = await getRequestVisitorToken();
  if (!admin || !visitorToken) redirect(resultHref("configuracao"));

  const { data: requestId, error } = await admin.rpc("submit_song_request", {
    p_performance_id: performanceId,
    p_song_id: songId,
    p_requester_name: requesterName || null,
    p_visitor_token: visitorToken,
    p_mock_payment_enabled: process.env.NODE_ENV === "development",
  });

  if (error?.code === "PGRST202" || error?.code === "PGRST203") {
    redirect(resultHref("atualizar_banco"));
  }
  if (error?.code === "23505") redirect(resultHref("duplicado"));
  if (error?.code === "P0001") redirect(resultHref("limite"));
  if (error?.code === "P0002") redirect(resultHref("preparacao"));
  if (error?.code === "42501") redirect(resultHref("atualizar_banco"));
  if (error) {
    console.error("Falha em submit_song_request:", error.code);
    redirect(resultHref("indisponivel"));
  }
  if (!requestId) redirect(resultHref("indisponivel"));

  const { data: request, error: requestError } = await admin
    .from("music_requests")
    .select("id, price_cents, payment_status")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !request) redirect(resultHref("indisponivel"));

  revalidatePath("/painel");
  revalidatePath(`/m/${slug}/musicas`);
  if (request.price_cents > 0 && request.payment_status === "pending") {
    redirect(`/m/${slug}/pedido/${request.id}`);
  }
  redirect(resultHref("enviado"));
}
