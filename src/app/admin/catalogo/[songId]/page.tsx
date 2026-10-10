import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { requireAdmin } from "@/lib/auth/require-admin";
import { firstSearchParam } from "@/lib/catalog/pagination";
import { rejectPendingSongAction } from "./actions";
import { SongReviewForm } from "./review-form";

type SongReviewPageProps = {
  params: Promise<{ songId: string }>;
  searchParams: Promise<{ estado?: string | string[] }>;
};

export default async function SongReviewPage({ params, searchParams }: SongReviewPageProps) {
  const [{ songId }, query] = await Promise.all([params, searchParams]);
  const { supabase } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/i.test(songId)) notFound();
  const { data: song } = await supabase.from("catalog_songs")
    .select("id, title, artist, genre, chord_sheet, metadata_reviewed_at, rights_status")
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
          <Link className="button button-outline button-small" href="/admin/catalogo?situacao=metadata_pending"><ArrowLeft size={15} /> Dados a revisar</Link>
        </header>

        <div className="dashboard-title-row">
          <div><h1>Revisar música</h1><p>{song.title} · {song.artist}</p></div>
          <span className={pending ? "demo-label" : "status-live"}><ShieldCheck size={13} /> {song.rights_status}</span>
        </div>

        {firstSearchParam(query.estado) === "salva" && <p className="dashboard-flash" role="status">Rascunho atualizado. A música permanece privada.</p>}
        {firstSearchParam(query.estado) === "campos" && <p className="dashboard-flash" role="status">Confira título, artista, gênero e o tamanho da cifra, se houver.</p>}

        <section className="panel admin-catalog-form-panel">
          <div className="panel-heading">
            <div>
              <h2>{pending ? "Confira os dados" : "Registro do catálogo"}</h2>
              <p>{pending ? "Valide os metadados da música. A cifra pode ser adicionada depois." : "Somente registros pendentes podem ser revisados nesta tela."}</p>
            </div>
          </div>
          {pending ? <SongReviewForm song={song} /> : (
            <div className="catalog-review-readonly">
              <p><strong>Música:</strong> {song.title} · {song.artist} · {song.genre}</p>
              <p><strong>Cifra:</strong> {song.chord_sheet ? "Cadastrada" : "Não cadastrada"}</p>
            </div>
          )}
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
