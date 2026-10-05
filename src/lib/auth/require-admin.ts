import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireAdmin() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/entrar?estado=configuracao");

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (typeof claims?.sub !== "string") redirect("/entrar");
  if (claims.app_metadata?.role !== "admin") redirect("/painel");

  return { supabase, adminId: claims.sub };
}
