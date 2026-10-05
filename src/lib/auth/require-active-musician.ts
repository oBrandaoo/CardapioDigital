import "server-only";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireActiveMusician() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/entrar?estado=configuracao");

  const { data } = await supabase.auth.getClaims();
  const musicianId = data?.claims?.sub;
  if (typeof musicianId !== "string") redirect("/entrar");

  const { data: license } = await supabase
    .from("musician_licenses")
    .select("status, starts_at, ends_at")
    .eq("musician_id", musicianId)
    .maybeSingle();

  const now = Date.now();
  if (
    license?.status !== "active" ||
    !license.starts_at ||
    !license.ends_at ||
    new Date(license.starts_at).getTime() > now ||
    new Date(license.ends_at).getTime() <= now
  ) {
    redirect("/painel?estado=licenca");
  }

  return { supabase, musicianId, license };
}
