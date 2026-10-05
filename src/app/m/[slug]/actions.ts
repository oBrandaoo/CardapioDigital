"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

  const admin = createSupabaseAdminClient();
  const visitorToken = await getRequestVisitorToken();
  if (!admin || !visitorToken) redirect(`/m/${slug}?pedido=configuracao`);

  const { data: requestId, error } = await admin.rpc("submit_song_request", {
    p_performance_id: performanceId,
    p_song_id: songId,
    p_requester_name: requesterName || null,
    p_visitor_token: visitorToken,
    p_mock_payment_enabled: process.env.NODE_ENV === "development",
  });

  if (error?.code === "23505") redirect(`/m/${slug}?pedido=duplicado`);
  if (error?.code === "P0001") redirect(`/m/${slug}?pedido=limite`);
  if (error) redirect(`/m/${slug}?pedido=indisponivel`);
  if (!requestId) redirect(`/m/${slug}?pedido=indisponivel`);

  const { data: request, error: requestError } = await admin
    .from("music_requests")
    .select("id, price_cents, payment_status")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError || !request) redirect(`/m/${slug}?pedido=indisponivel`);

  revalidatePath("/painel");
  revalidatePath(`/m/${slug}`);
  if (request.price_cents > 0 && request.payment_status === "pending") {
    redirect(`/m/${slug}/pedido/${request.id}`);
  }
  redirect(`/m/${slug}?pedido=enviado`);
}
