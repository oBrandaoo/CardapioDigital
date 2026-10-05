"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveMusician } from "@/lib/auth/require-active-musician";

export async function addSongToRepertoireAction(formData: FormData) {
  const { supabase, musicianId } = await requireActiveMusician();
  const songId = String(formData.get("song_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(songId)) redirect("/painel/repertorio?estado=musica");

  const { error } = await supabase.from("repertoire_items").insert({
    musician_id: musicianId,
    song_id: songId,
    price_cents: 0,
    is_enabled: true,
  });

  if (error) redirect("/painel/repertorio?estado=musica");
  revalidatePath("/painel/repertorio");
  revalidatePath("/painel");
  redirect("/painel/repertorio?estado=adicionada");
}

export async function removeSongFromRepertoireAction(formData: FormData) {
  const { supabase, musicianId } = await requireActiveMusician();
  const itemId = String(formData.get("item_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) redirect("/painel/repertorio?estado=musica");

  const { error } = await supabase
    .from("repertoire_items")
    .delete()
    .eq("id", itemId)
    .eq("musician_id", musicianId);

  if (error) redirect("/painel/repertorio?estado=musica");
  revalidatePath("/painel/repertorio");
  revalidatePath("/painel");
  redirect("/painel/repertorio?estado=removida");
}
