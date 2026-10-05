"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveMusician } from "@/lib/auth/require-active-musician";

export async function createPerformanceAction(formData: FormData) {
  const { supabase, musicianId } = await requireActiveMusician();
  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 2 || title.length > 120) redirect("/painel?estado=titulo");

  const { error } = await supabase.from("performances").insert({
    musician_id: musicianId,
    title,
    status: "active",
  });

  if (error) redirect("/painel?estado=apresentacao");
  revalidatePath("/painel");
  redirect("/painel?estado=aberta");
}

export async function closePerformanceAction(formData: FormData) {
  const { supabase, musicianId } = await requireActiveMusician();
  const performanceId = String(formData.get("performance_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(performanceId)) redirect("/painel?estado=apresentacao");

  const { error } = await supabase
    .from("performances")
    .update({ status: "closed" })
    .eq("id", performanceId)
    .eq("musician_id", musicianId)
    .eq("status", "active");

  if (error) redirect("/painel?estado=apresentacao");
  revalidatePath("/painel");
  revalidatePath(`/m/${String(formData.get("slug") ?? "")}`);
  redirect("/painel?estado=fechada");
}

export async function setPublicProfileAction(formData: FormData) {
  const { supabase, musicianId } = await requireActiveMusician();
  const shouldPublish = formData.get("is_public") === "true";
  const { error } = await supabase
    .from("musicians")
    .update({ profile_is_public: shouldPublish })
    .eq("id", musicianId);

  if (error) redirect("/painel?estado=perfil");
  revalidatePath("/painel");
  redirect(`/painel?estado=${shouldPublish ? "publicado" : "oculto"}`);
}

export async function updateRequestStatusAction(formData: FormData) {
  const { supabase, musicianId } = await requireActiveMusician();
  const requestId = String(formData.get("request_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(requestId) || !["played", "cancelled"].includes(status)) {
    redirect("/painel?estado=pedido");
  }

  const { error } = await supabase
    .from("music_requests")
    .update({ status })
    .eq("id", requestId)
    .eq("musician_id", musicianId)
    .eq("payment_status", "not_required");

  if (error) redirect("/painel?estado=pedido");
  revalidatePath("/painel");
  redirect(`/painel?estado=${status === "played" ? "tocada" : "cancelada"}`);
}
