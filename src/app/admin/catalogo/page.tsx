import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { CatalogListControls } from "@/components/catalog-list-controls";
import { requireAdmin } from "@/lib/auth/require-admin";
import { addApprovedSongAction } from "@/app/admin/catalogo/actions";
import { CatalogSongList } from "./catalog-song-list";
import {
  CATALOG_PAGE_SIZE,
  catalogPageHref,
  firstSearchParam,
  normalizeCatalogSearch,
  parseCatalogPage,
} from "@/lib/catalog/pagination";

type CatalogAdminPageProps = {
  searchParams: Promise<{
    estado?: string | string[];
    q?: string | string[];
    pagina?: string | string[];
    situacao?: string | string[];
  }>;
};

const statusOptions = [
  { value: "", label: "Todas" },
  { value: "metadata_pending", label: "Dados a revisar" },
  { value: "metadata_reviewed", label: "Dados validados" },
  { value: "pending", label: "Pendentes" },
  { value: "approved", label: "Aprovadas" },
  { value: "rejected", label: "Rejeitadas" },
  { value: "expired", label: "Expiradas" },
  { value: "disputed", label: "Contestadas" },
] as const;

const notices: Record<string, string> = {
  salva: "Música adicionada ao catálogo aprovado.",
  retirada: "Música retirada do catálogo público.",
  genero: "Gênero atualizado.",
  aprovada: "Música revisada e publicada no catálogo.",
  rejeitada: "Registro rejeitado e mantido fora do catálogo público.",
  campos: "Preencha título, artista e a referência da autorização; confirme a revisão. A cifra é opcional.",
  erro: "Não foi possível atualizar o catálogo. Confira os dados e tente novamente.",
  dados_validados: "Dados das músicas validados. Elas continuam privadas até a aprovação para publicação.",
  selecao: "Selecione de 1 a 30 músicas desta página para validar os dados.",
};

export default async function AdminCatalogPage({ searchParams }: CatalogAdminPageProps) {
  const params = await searchParams;
  const estado = firstSearchParam(params.estado) ?? "";
  const searchTerm = normalizeCatalogSearch(params.q);
  const requestedStatus = firstSearchParam(params.situacao) ?? "";
  const status = statusOptions.some((option) => option.value === requestedStatus) ? requestedStatus : "";
  const requestedPage = parseCatalogPage(params.pagina);
  const { supabase } = await requireAdmin();

  let countQuery = supabase
    .from("catalog_songs")
    .select("id", { count: "exact", head: true });
  if (searchTerm) {
    countQuery = countQuery.textSearch("catalog_search_vector", searchTerm, { config: "simple", type: "plain" });
  }
  if (status === "metadata_pending") countQuery = countQuery.eq("rights_status", "pending").is("metadata_reviewed_at", null);
  else if (status === "metadata_reviewed") countQuery = countQuery.eq("rights_status", "pending").not("metadata_reviewed_at", "is", null);
  else if (status) countQuery = countQuery.eq("rights_status", status);
  const [{ count }, { count: pendingCount }, { count: metadataPendingCount }] = await Promise.all([
    countQuery,
    supabase.from("catalog_songs").select("id", { count: "exact", head: true }).eq("rights_status", "pending"),
    supabase.from("catalog_songs").select("id", { count: "exact", head: true }).eq("rights_status", "pending").is("metadata_reviewed_at", null),
  ]);
  const resultCount = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(resultCount / CATALOG_PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);

  let songsQuery = supabase
    .from("catalog_songs")
    .select("id, title, artist, genre, version_label, rights_status, rights_valid_until, metadata_reviewed_at, updated_at");
  if (searchTerm) {
    songsQuery = songsQuery.textSearch("catalog_search_vector", searchTerm, { config: "simple", type: "plain" });
  }
  if (status === "metadata_pending") songsQuery = songsQuery.eq("rights_status", "pending").is("metadata_reviewed_at", null);
  else if (status === "metadata_reviewed") songsQuery = songsQuery.eq("rights_status", "pending").not("metadata_reviewed_at", "is", null);
  else if (status) songsQuery = songsQuery.eq("rights_status", status);
  const { data: songs } = await songsQuery
    .order("updated_at", { ascending: false })
    .order("id", { ascending: true })
    .range((page - 1) * CATALOG_PAGE_SIZE, page * CATALOG_PAGE_SIZE - 1);

  return (
    <main className="dashboard-page">
      <div className="dashboard-wrap">
        <header className="dashboard-topbar">
          <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
          <div className="dashboard-header-actions">
            <Link className="button button-outline button-small" href="/admin/licencas">Licenças</Link>
            <Link className="button button-outline button-small" href="/admin"><ArrowLeft size={15} /> Administração</Link>
          </div>
        </header>

        <div className="dashboard-title-row">
          <div><h1>Catálogo central</h1><p>Cadastre músicas e cifras com autorização documentada.</p></div>
          <span className="status-live"><ShieldCheck size={13} /> Administração</span>
        </div>
        {estado && notices[estado] && <p className="dashboard-flash" role="status">{notices[estado]}</p>}

        <div className="catalog-import-entry">
          <div><strong>Importação em lote</strong><p>Registros entram como rascunhos privados. {metadataPendingCount ?? 0} aguardando validação dos dados.</p></div>
          <Link className="button button-primary button-small" href="/admin/catalogo/importar">Importar músicas</Link>
        </div>

        <section className="panel admin-catalog-form-panel">
          <div className="panel-heading">
            <div><h2>Adicionar música autorizada</h2><p>O cadastro será publicado somente após a revisão administrativa registrada neste formulário.</p></div>
          </div>
          <form action={addApprovedSongAction} className="catalog-admin-form">
            <label>Título
              <input name="title" type="text" maxLength={160} required />
            </label>
            <label>Artista
              <input name="artist" type="text" maxLength={160} required />
            </label>
            <label>Gênero principal
              <input name="genre" type="text" maxLength={80} defaultValue="Sertanejo" required />
            </label>
            <label>Validade da autorização
              <input name="rights_valid_until" type="date" />
            </label>
            <label className="catalog-sheet-field">Cifra autorizada (opcional)
              <textarea name="chord_sheet" rows={12} maxLength={40000} placeholder="Cole aqui somente o conteúdo cuja autorização de armazenamento e exibição já foi confirmada." />
            </label>
            <label className="catalog-sheet-field">Referência da autorização
              <input name="authorization_reference" type="text" minLength={5} maxLength={1000} required placeholder="Link ou identificador do documento/licença" />
            </label>
            <label className="catalog-sheet-field">Base e limites de uso
              <textarea name="rights_basis" rows={3} maxLength={2000} required placeholder="Titular/licenciante, usos permitidos e condições relevantes" />
            </label>
            <label className="rights-confirmation">
              <input name="rights_confirmed" type="checkbox" value="yes" required />
              <span>Confirmo que a autorização documentada cobre a exibição dos dados da música e, quando houver cifra, seu armazenamento e sua exibição ao músico autenticado.</span>
            </label>
            <button className="button button-primary" type="submit">Revisar e publicar no catálogo</button>
          </form>
          <p className="admin-catalog-note">Este registro guarda quem revisou e a referência informada. O formulário não concede direitos; só use conteúdo com autorização efetivamente confirmada.</p>
        </section>

        <section className="admin-catalog-list-section">
          <div className="dashboard-title-row">
            <div><h2 className="section-heading">Músicas cadastradas</h2><p>Retire do catálogo público quando a autorização expirar ou ficar em dúvida.</p></div>
          </div>
          <nav className="catalog-status-filters" aria-label="Filtrar músicas por situação">
            {statusOptions.map((option) => (
              <Link
                key={option.value}
                className={`catalog-status-filter${status === option.value ? " catalog-status-filter-active" : ""}`}
                href={catalogPageHref("/admin/catalogo", searchTerm, 1, { situacao: option.value })}
                aria-current={status === option.value ? "page" : undefined}
              >
                {option.label}{option.value === "metadata_pending" && <span>{metadataPendingCount ?? 0}</span>}{option.value === "pending" && <span>{pendingCount ?? 0}</span>}
              </Link>
            ))}
          </nav>
          <CatalogListControls
            pathname="/admin/catalogo"
            inputId="admin-catalog-search"
            searchTerm={searchTerm}
            page={page}
            pageCount={pageCount}
            resultCount={resultCount}
            extraParams={{ situacao: status }}
          />
          {songs?.length ? (
            <CatalogSongList key={`${status}:${searchTerm}:${page}`} songs={songs} />
          ) : searchTerm || status ? (
            <section className="panel catalog-empty-panel catalog-search-empty">
              <span className="empty-queue-art"><ShieldCheck size={25} /></span>
              <h2>Nenhuma música encontrada</h2>
              <p>{searchTerm ? "Tente outro título, artista ou compositor." : "Não há músicas nesta situação."}</p>
            </section>
          ) : resultCount > 0 ? (
            <section className="panel catalog-empty-panel catalog-search-empty">
              <span className="empty-queue-art"><ShieldCheck size={25} /></span>
              <h2>Não há músicas nesta página</h2>
              <p>Volte para uma página anterior do catálogo.</p>
            </section>
          ) : (
            <section className="panel catalog-empty-panel">
              <span className="empty-queue-art"><ShieldCheck size={25} /></span>
              <h2>O catálogo ainda está vazio</h2>
              <p>Adicione somente conteúdo com autorização documentada.</p>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
