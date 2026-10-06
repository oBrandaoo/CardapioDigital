import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isLicenseActive } from "@/lib/auth/is-license-active";

export async function requireActiveMusician() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/entrar?estado=configuracao");

  const { data } = await supabase.auth.getClaims();
  const musicianId = data?.claims?.sub;
  if (typeof musicianId !== "string") redirect("/entrar");
  if (data?.claims?.app_metadata?.role === "admin") redirect("/admin");

  const { data: license } = await supabase
    .from("musician_licenses")
    .select("status, starts_at, ends_at")
    .eq("musician_id", musicianId)
    .maybeSingle();

  if (!isLicenseActive(license)) {
    redirect("/painel?estado=licenca");
  }

  return { supabase, musicianId, license };
}
