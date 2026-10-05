"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";

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
