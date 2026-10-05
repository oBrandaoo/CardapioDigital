"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function confirmInviteAction(formData: FormData) {
  const tokenHashValue = formData.get("token_hash");
  const tokenHash = typeof tokenHashValue === "string" ? tokenHashValue : "";
  if (tokenHash.length < 16 || tokenHash.length > 512 || !/^[A-Za-z0-9_-]+$/.test(tokenHash)) {
    redirect("/entrar?estado=convite");
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/entrar?estado=configuracao");

  const { error } = await supabase.auth.verifyOtp({ type: "invite", token_hash: tokenHash });
  if (error) redirect("/entrar?estado=convite");

  redirect("/definir-senha");
}
