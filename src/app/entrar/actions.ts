"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function formValue(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function signInAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/entrar?estado=configuracao");

  const email = formValue(formData, "email").toLowerCase();
  const password = formValue(formData, "password");
  if (!email || !password) redirect("/entrar?estado=campos");

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect("/entrar?estado=credenciais");

  redirect("/painel");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}
