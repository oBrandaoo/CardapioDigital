import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { requireAdmin } from "@/lib/auth/require-admin";
import { firstSearchParam } from "@/lib/catalog/pagination";
import { approvePendingSongAction, rejectPendingSongAction, savePendingSongAction } from "./actions";

type SongReviewPageProps = {
  params: Promise<{ songId: string }>;
  searchParams: Promise<{ estado?: string | string[] }>;
};

export default async function SongReviewPage({ params, searchParams }: SongReviewPageProps) {
  const [{ songId }, query] = await Promise.all([params, searchParams]);
  const { supabase } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(songId)) notFound();
  const { data: song } = await supabase.from("catalog_songs")
    .select("id, title, artist, genre, chord_sheet, authorization_reference, rights_basis, rights_valid_until, rights_status, created_at")
    .eq("id", songId)
    .maybeSingle();
  if (!song) notFound();
  const pending = song.rights_status === "pending";
  const { data: audit } = await supabase.from("catalog_song_audit")
    .select("id, operation, previous_status, new_status, changed_columns, changed_at, actor_id")
    .eq("song_id", song.id)
    .order("changed_at", { ascending: false })
    .limit(20);

  return (
    <main className="dashboard-page">
      <div className="dashboard-wrap">
        <header className="dashboard-topbar">
          <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
          <Link className="button button-outline button-small" href="/admin/catalogo"><ArrowLeft size={15} /> Voltar ao catálogo</Link>
        </header>

        <div className="dashboard-title-row">
          <div><h1>Revisar música</h1><p>{song.title} · {song.artist}</p></div>
          <span className={pending ? "demo-label" : "status-live"}><ShieldCheck size={13} /> {song.rights_status}</span>
        </div>

        {firstSearchParam(query.estado) === "salva" && <p className="dashboard-flash" role="status">Rascunho atualizado. A música permanece privada.</p>}

        <section className="panel admin-catalog-form-panel">
          <div className="panel-heading">
            <div>
              <h2>{pending ? "Confira dados, cifra e autorização" : "Registro do catálogo"}</h2>
              <p>{pending ? "Somente aprove quando a permissão de armazenar e exibir a cifra estiver documentada." : "Somente registros pendentes podem ser aprovados nesta tela."}</p>
            </div>
          </div>
          <form action={savePendingSongAction} className="catalog-admin-form catalog-review-form">
            <input type="hidden" name="song_id" value={song.id} />
            <label>Título<input name="title" defaultValue={song.title} maxLength={160} required disabled={!pending} /></label>
            <label>Artista<input name="artist" defaultValue={song.artist} maxLength={160} required disabled={!pending} /></label>
            <label>Gênero principal<input name="genre" defaultValue={song.genre} maxLength={80} required disabled={!pending} /></label>
            <label>Validade da autorização<input name="rights_valid_until" type="date" defaultValue={song.rights_valid_until ?? ""} disabled={!pending} /></label>
            <label className="catalog-sheet-field">Cifra TXT
              <textarea name="chord_sheet" rows={15} maxLength={40000} defaultValue={song.chord_sheet} required disabled={!pending} />
            </label>
            <label className="catalog-sheet-field">Referência da autorização
              <input name="authorization_reference" defaultValue={song.authorization_reference ?? ""} maxLength={1000} disabled={!pending} />
            </label>
            <label className="catalog-sheet-field">Base e limites de uso
              <textarea name="rights_basis" rows={4} maxLength={2000} defaultValue={song.rights_basis ?? ""} disabled={!pending} />
            </label>
            {pending && (
              <>
                <label className="rights-confirmation">
                  <input name="rights_confirmed" type="checkbox" value="yes" />
                  <span>Confirmo que a documentação permite armazenar a cifra e exibi-la ao músico autenticado neste produto.</span>
                </label>
                <div className="catalog-review-actions">
                  <button className="button button-outline" type="submit">Salvar rascunho</button>
                  <button className="button button-primary" type="submit" formAction={approvePendingSongAction}>Aprovar e publicar</button>
                </div>
              </>
            )}
          </form>
          {pending && (
            <form action={rejectPendingSongAction} className="catalog-review-reject">
              <input type="hidden" name="song_id" value={song.id} />
              <button className="button button-outline button-small" type="submit">Rejeitar registro</button>
            </form>
          )}
        </section>

        {audit?.length ? (
          <section className="panel catalog-audit-panel">
            <h2>Histórico administrativo</h2>
            <ul>
              {audit.map((event) => (
                <li key={event.id}>
                  {new Date(event.changed_at).toLocaleString("pt-BR")} · {event.operation === "INSERT" ? "Cadastro" : "Alteração"} · {event.previous_status ?? "—"} → {event.new_status}
                  {event.changed_columns.length ? ` · Campos: ${event.changed_columns.join(", ")}` : ""}
                  {event.actor_id ? ` · ${event.actor_id}` : ""}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
