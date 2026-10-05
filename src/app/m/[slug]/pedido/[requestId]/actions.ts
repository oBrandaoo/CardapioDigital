"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRequestVisitorToken } from "@/lib/security/request-token";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function confirmMockPaymentAction(formData: FormData) {
  const requestId = String(formData.get("request_id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(requestId) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    redirect("/m/banda-mare?pedido=indisponivel");
  }

  const paymentUrl = `/m/${slug}/pedido/${requestId}`;
  if (process.env.NODE_ENV !== "development") redirect(`${paymentUrl}?estado=indisponivel`);

  const admin = createSupabaseAdminClient();
  const visitorToken = await getRequestVisitorToken();
  if (!admin || !visitorToken) redirect(`${paymentUrl}?estado=configuracao`);

  const { data: confirmed, error } = await admin.rpc("confirm_mock_request", {
    p_request_id: requestId,
    p_visitor_token: visitorToken,
  });

  if (error || confirmed !== true) redirect(`${paymentUrl}?estado=indisponivel`);

  revalidatePath("/painel");
  revalidatePath(paymentUrl);
  redirect(`${paymentUrl}?estado=mock_aprovado`);
}
