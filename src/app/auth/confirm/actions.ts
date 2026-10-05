"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function confirmAuthLinkAction(formData: FormData) {
  const tokenHashValue = formData.get("token_hash");
  const tokenHash = typeof tokenHashValue === "string" ? tokenHashValue : "";
  const typeValue = formData.get("type");
  const type = typeValue === "invite" || typeValue === "recovery" ? typeValue : "";
  const errorState = type === "recovery" ? "recuperacao" : "convite";
  if (tokenHash.length < 16 || tokenHash.length > 512 || !/^[A-Za-z0-9_-]+$/.test(tokenHash)) {
    redirect(`/entrar?estado=${errorState}`);
  }
  if (!type) redirect("/entrar?estado=convite");

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/entrar?estado=configuracao");

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) redirect(`/entrar?estado=${type === "recovery" ? "recuperacao" : "convite"}`);

  redirect("/definir-senha");
}
