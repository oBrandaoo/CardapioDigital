"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function setInitialPasswordAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/entrar?estado=configuracao");

  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.sub !== "string") redirect("/entrar?estado=convite");
  const destination = data.claims.app_metadata?.role === "admin" ? "/admin" : "/painel";

  const password = formData.get("password");
  const confirmation = formData.get("password_confirmation");
  if (typeof password !== "string" || typeof confirmation !== "string" || password.length < 8) {
    redirect("/definir-senha?estado=senha");
  }
  if (password !== confirmation) redirect("/definir-senha?estado=divergente");

  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/definir-senha?estado=erro");

  redirect(destination);
}
