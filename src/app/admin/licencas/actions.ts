"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";

export async function inviteMusicianAction(formData: FormData) {
  await requireAdmin();

  const emailValue = formData.get("email");
  const stageNameValue = formData.get("stage_name");
  const email = typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
  const stageName = typeof stageNameValue === "string" ? stageNameValue.trim() : "";

  if (formData.get("access_validated") !== "yes") {
    redirect("/admin/licencas?estado=convite_validacao");
  }
  if (
    stageName.length < 2 ||
    stageName.length > 80 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    redirect("/admin/licencas?estado=convite_dados");
  }

  const adminClient = createSupabaseAdminClient();
  if (!adminClient) redirect("/admin/licencas?estado=convite_config");

  const { error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { stage_name: stageName },
  });

  if (error) redirect("/admin/licencas?estado=convite_erro");

  revalidatePath("/admin/licencas");
  redirect("/admin/licencas?estado=convite_enviado");
}

export async function updateLicenseAction(formData: FormData) {
  const { supabase, adminId } = await requireAdmin();
  const musicianId = String(formData.get("musician_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const startsAtValue = String(formData.get("starts_at") ?? "");
  const endsAtValue = String(formData.get("ends_at") ?? "");
  const internalNote = String(formData.get("internal_note") ?? "").trim().slice(0, 1000);

  if (!/^[0-9a-f-]{36}$/i.test(musicianId)) redirect("/admin/licencas?estado=erro");
  if (!["pending", "active", "expired", "suspended"].includes(status)) {
    redirect("/admin/licencas?estado=erro");
  }

  const startsAt = startsAtValue ? new Date(startsAtValue) : null;
  const endsAt = endsAtValue ? new Date(endsAtValue) : null;
  if (
    status === "active" &&
    (!startsAt || !endsAt || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt)
  ) {
    redirect("/admin/licencas?estado=periodo");
  }

  const { error } = await supabase
    .from("musician_licenses")
    .update({
      status,
      starts_at: startsAt?.toISOString() ?? null,
      ends_at: endsAt?.toISOString() ?? null,
      internal_note: internalNote || null,
      granted_by: status === "active" ? adminId : null,
      updated_at: new Date().toISOString(),
    })
    .eq("musician_id", musicianId);

  if (error) redirect("/admin/licencas?estado=erro");
  revalidatePath("/admin/licencas");
  revalidatePath("/painel");
  redirect("/admin/licencas?estado=salva");
}
