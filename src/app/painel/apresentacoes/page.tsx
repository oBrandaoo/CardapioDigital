import Link from "next/link";
import { ArrowLeft, ClipboardList, Music2 } from "lucide-react";
import { Brand } from "@/components/brand";
import { requireActiveMusician } from "@/lib/auth/require-active-musician";
import { parseCatalogPage } from "@/lib/catalog/pagination";

const PAGE_SIZE = 20;

type PerformancesPageProps = {
  searchParams: Promise<{ pagina?: string | string[] }>;
};

export default async function PerformancesPage({ searchParams }: PerformancesPageProps) {
  const { pagina } = await searchParams;
  const requestedPage = parseCatalogPage(pagina);
  const { supabase, musicianId } = await requireActiveMusician();
  const { count } = await supabase
    .from("performances")
    .select("id", { count: "exact", head: true })
    .eq("musician_id", musicianId);
  const pageCount = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  const { data: performances } = await supabase
    .from("performances")
    .select("id, title, status, starts_at")
    .eq("musician_id", musicianId)
    .order("starts_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  return (
    <main className="dashboard-page">
      <div className="dashboard-wrap">
        <header className="dashboard-topbar">
          <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
          <Link className="button button-outline button-small" href="/painel"><ArrowLeft size={15} /> Voltar ao painel</Link>
        </header>
        <div className="dashboard-title-row">
          <div><h1>Apresentações</h1><p>Consulte as apresentações e os pedidos recebidos.</p></div>
          <span className="status-live"><ClipboardList size={13} /> {count ?? 0} registradas</span>
        </div>

        {performances?.length ? (
          <div className="admin-license-list">
            {performances.map((performance) => (
              <article className="panel admin-license-card" key={performance.id}>
                <div className="admin-license-heading">
                  <div>
                    <h2>{performance.title}</h2>
                    <p>Iniciada em {new Date(performance.starts_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
                  </div>
                  <span className={performance.status === "active" ? "status-live" : "demo-label"}>
                    {performance.status === "active" ? "Aberta" : "Encerrada"}
                  </span>
                </div>
                <Link className="button button-outline button-small" href={`/painel/apresentacoes/${performance.id}`}>
                  <Music2 size={14} /> Ver pedidos
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <section className="panel catalog-empty-panel">
            <span className="empty-queue-art"><ClipboardList size={25} /></span>
            <h2>Nenhuma apresentação registrada</h2>
            <p>Abra uma apresentação no painel para começar a receber pedidos.</p>
          </section>
        )}

        {pageCount > 1 && (
          <nav className="performance-pagination" aria-label="Páginas de apresentações">
            {page > 1 && <Link className="button button-outline button-small" href={`/painel/apresentacoes?pagina=${page - 1}`}>Anterior</Link>}
            <span>Página {page} de {pageCount}</span>
            {page < pageCount && <Link className="button button-outline button-small" href={`/painel/apresentacoes?pagina=${page + 1}`}>Próxima</Link>}
          </nav>
        )}
      </div>
    </main>
  );
}
