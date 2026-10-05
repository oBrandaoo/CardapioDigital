"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getRequestVisitorToken } from "@/lib/security/request-token";

export async function submitFreeRequestAction(formData: FormData) {
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

  const { error } = await admin.rpc("submit_free_request", {
    p_performance_id: performanceId,
    p_song_id: songId,
    p_requester_name: requesterName || null,
    p_visitor_token: visitorToken,
  });

  if (error?.code === "23505") redirect(`/m/${slug}?pedido=duplicado`);
  if (error?.code === "P0001") redirect(`/m/${slug}?pedido=limite`);
  if (error) redirect(`/m/${slug}?pedido=indisponivel`);

  revalidatePath("/painel");
  revalidatePath(`/m/${slug}`);
  redirect(`/m/${slug}?pedido=enviado`);
}
