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

export async function updateMusicianProfileAction(formData: FormData) {
  const { supabase, musicianId } = await requireActiveMusician();
  const readField = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const stageName = readField("stage_name");
  const slug = readField("slug");
  const city = readField("city");
  const bio = readField("bio");

  if (stageName.length < 2 || stageName.length > 80 || city.length > 100 || bio.length > 500) {
    redirect("/painel?estado=perfil_campos");
  }
  if (slug.length < 3 || slug.length > 60 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    redirect("/painel?estado=endereco_invalido");
  }

  const { data: currentProfile, error: readError } = await supabase
    .from("musicians")
    .select("slug")
    .eq("id", musicianId)
    .maybeSingle();

  if (readError || !currentProfile) redirect("/painel?estado=perfil");

  const { error } = await supabase
    .from("musicians")
    .update({
      stage_name: stageName,
      slug,
      city: city || null,
      bio: bio || null,
    })
    .eq("id", musicianId);

  if (error?.code === "23505") redirect("/painel?estado=endereco_em_uso");
  if (error) redirect("/painel?estado=perfil");

  revalidatePath("/painel");
  revalidatePath(`/m/${currentProfile.slug}`);
  revalidatePath(`/m/${slug}`);
  redirect("/painel?estado=perfil_salvo");
}

export async function updateRequestStatusAction(formData: FormData) {
  const { supabase, musicianId } = await requireActiveMusician();
  const requestId = String(formData.get("request_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(requestId) || !["played", "cancelled"].includes(status)) {
    redirect("/painel?estado=pedido");
  }

  const update = supabase
    .from("music_requests")
    .update({ status })
    .eq("id", requestId)
    .eq("musician_id", musicianId)
    .eq("status", "queued");
  const { data, error } = status === "cancelled"
    ? await update.eq("payment_status", "not_required").select("id").maybeSingle()
    : await update.in("payment_status", ["not_required", "mock_paid", "paid"]).select("id").maybeSingle();

  if (error || !data) redirect("/painel?estado=pedido");
  revalidatePath("/painel");
  redirect(`/painel?estado=${status === "played" ? "tocada" : "cancelada"}`);
}
