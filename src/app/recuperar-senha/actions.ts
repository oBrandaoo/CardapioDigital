"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/supabase/env";

export async function sendPasswordRecoveryAction(formData: FormData) {
  const emailValue = formData.get("email");
  const email = typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    redirect("/recuperar-senha?estado=dados");
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/recuperar-senha?estado=configuracao");

  const redirectTo = getSiteUrl().replace(/\/+$/, "");
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) redirect("/recuperar-senha?estado=erro");

  redirect("/recuperar-senha?estado=enviado");
}
