import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, ClipboardList } from "lucide-react";
import { Brand } from "@/components/brand";
import { requireActiveMusician } from "@/lib/auth/require-active-musician";
import { parseCatalogPage } from "@/lib/catalog/pagination";

const PAGE_SIZE = 30;

type PerformanceRequestsPageProps = {
  params: Promise<{ performanceId: string }>;
  searchParams: Promise<{ pagina?: string | string[] }>;
};

const requestStatuses: Record<string, string> = {
  queued: "Na fila",
  awaiting_payment: "Aguardando pagamento",
  played: "Tocada",
  cancelled: "Cancelada",
};

const paymentStatuses: Record<string, string> = {
  not_required: "Gratuito",
  pending: "Pagamento pendente",
  mock_paid: "Pagamento simulado",
  paid: "Pago",
  failed: "Pagamento falhou",
  refunded: "Reembolsado",
};

export default async function PerformanceRequestsPage({ params, searchParams }: PerformanceRequestsPageProps) {
  const [{ performanceId }, { pagina }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(performanceId)) notFound();
  const { supabase, musicianId } = await requireActiveMusician();
  const { data: performance, error: performanceError } = await supabase
    .from("performances")
    .select("id, title, status, starts_at")
    .eq("id", performanceId)
    .eq("musician_id", musicianId)
    .maybeSingle();
  if (performanceError || !performance) notFound();

  const { count } = await supabase
    .from("music_requests")
    .select("id", { count: "exact", head: true })
    .eq("musician_id", musicianId)
    .eq("performance_id", performanceId);
  const pageCount = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const page = Math.min(parseCatalogPage(pagina), pageCount);
  const { data: requests } = await supabase
    .from("music_requests")
    .select("id, song_id, requester_name, price_cents, payment_status, status, created_at, catalog_songs(title, artist)")
    .eq("musician_id", musicianId)
    .eq("performance_id", performanceId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  return (
    <main className="dashboard-page">
      <div className="dashboard-wrap">
        <header className="dashboard-topbar">
          <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
          <Link className="button button-outline button-small" href="/painel/apresentacoes"><ArrowLeft size={15} /> Apresentações</Link>
        </header>
        <div className="dashboard-title-row">
          <div>
            <h1>{performance.title}</h1>
            <p>Iniciada em {new Date(performance.starts_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {count ?? 0} pedidos</p>
          </div>
          <span className={performance.status === "active" ? "status-live" : "demo-label"}>
            {performance.status === "active" ? "Aberta" : "Encerrada"}
          </span>
        </div>

        {requests?.length ? (
          <div className="admin-license-list">
            {requests.map((request) => {
              const song = Array.isArray(request.catalog_songs) ? request.catalog_songs[0] : request.catalog_songs;
              return (
                <article className="panel admin-license-card" key={request.id}>
                  <div className="admin-license-heading">
                    <div>
                      <h2>{song?.title ?? "Música indisponível"}</h2>
                      <p>{song?.artist ? `${song.artist} · ` : ""}{request.requester_name || "Público"}</p>
                    </div>
                    <span className={request.status === "played" ? "status-live" : "demo-label"}>
                      {requestStatuses[request.status] ?? request.status}
                    </span>
                  </div>
                  <p className="performance-request-meta">
                    {new Date(request.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                    {" · "}{paymentStatuses[request.payment_status] ?? request.payment_status}
                    {request.price_cents > 0 && ` · ${(request.price_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
                  </p>
                  {song && <Link className="button button-outline button-small" href={`/painel/repertorio/${request.song_id}`} prefetch={false}><BookOpen size={14} /> Ver música</Link>}
                </article>
              );
            })}
          </div>
        ) : (
          <section className="panel catalog-empty-panel">
            <span className="empty-queue-art"><ClipboardList size={25} /></span>
            <h2>Nenhum pedido nesta apresentação</h2>
            <p>Os pedidos recebidos aparecerão aqui.</p>
          </section>
        )}

        {pageCount > 1 && (
          <nav className="performance-pagination" aria-label="Páginas de pedidos">
            {page > 1 && <Link className="button button-outline button-small" href={`/painel/apresentacoes/${performance.id}?pagina=${page - 1}`}>Anterior</Link>}
            <span>Página {page} de {pageCount}</span>
            {page < pageCount && <Link className="button button-outline button-small" href={`/painel/apresentacoes/${performance.id}?pagina=${page + 1}`}>Próxima</Link>}
          </nav>
        )}
      </div>
    </main>
  );
}
