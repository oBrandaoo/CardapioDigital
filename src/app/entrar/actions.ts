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

export async function signUpAction(formData: FormData) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/entrar?estado=configuracao");

  const stageName = formValue(formData, "stage_name");
  const email = formValue(formData, "email").toLowerCase();
  const password = formValue(formData, "password");

  if (stageName.length < 2 || stageName.length > 80 || !email || password.length < 8) {
    redirect("/entrar?estado=campos");
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { stage_name: stageName } },
  });

  if (error) redirect("/entrar?estado=cadastro");
  if (data.session) redirect("/painel");

  redirect("/entrar?estado=confirmar");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/");
}
