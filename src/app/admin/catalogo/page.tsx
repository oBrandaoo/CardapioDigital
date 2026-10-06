import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { CatalogListControls } from "@/components/catalog-list-controls";
import { requireAdmin } from "@/lib/auth/require-admin";
import { addApprovedSongAction, updateSongGenreAction, withdrawSongAction } from "@/app/admin/catalogo/actions";
import {
  CATALOG_PAGE_SIZE,
  firstSearchParam,
  normalizeCatalogSearch,
  parseCatalogPage,
} from "@/lib/catalog/pagination";

type CatalogAdminPageProps = {
  searchParams: Promise<{
    estado?: string | string[];
    q?: string | string[];
    pagina?: string | string[];
  }>;
};

const notices: Record<string, string> = {
  salva: "Música adicionada ao catálogo aprovado.",
  retirada: "Música retirada do catálogo público.",
  genero: "Gênero atualizado.",
  campos: "Preencha título, artista, cifra e a referência da autorização; confirme a revisão.",
  erro: "Não foi possível atualizar o catálogo. Confira os dados e tente novamente.",
};

export default async function AdminCatalogPage({ searchParams }: CatalogAdminPageProps) {
  const params = await searchParams;
  const estado = firstSearchParam(params.estado) ?? "";
  const searchTerm = normalizeCatalogSearch(params.q);
  const requestedPage = parseCatalogPage(params.pagina);
  const { supabase } = await requireAdmin();

  let countQuery = supabase
    .from("catalog_songs")
    .select("id", { count: "exact", head: true });
  if (searchTerm) {
    countQuery = countQuery.textSearch("catalog_search_vector", searchTerm, { config: "simple", type: "plain" });
  }
  const { count } = await countQuery;
  const resultCount = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(resultCount / CATALOG_PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);

  let songsQuery = supabase
    .from("catalog_songs")
    .select("id, title, artist, genre, version_label, rights_status, rights_valid_until, updated_at");
  if (searchTerm) {
    songsQuery = songsQuery.textSearch("catalog_search_vector", searchTerm, { config: "simple", type: "plain" });
  }
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
          <div><h1>Catálogo central</h1><p>Cadastre cifras com origem e autorização documentadas.</p></div>
          <span className="status-live"><ShieldCheck size={13} /> Administração</span>
        </div>
        {estado && notices[estado] && <p className="dashboard-flash" role="status">{notices[estado]}</p>}

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
            <label>Compositores
              <textarea name="composers" rows={2} placeholder="Um nome por linha" />
            </label>
            <label>Versão
              <input name="version_label" type="text" maxLength={100} defaultValue="Original" />
            </label>
            <label>Tom original
              <input name="original_key" type="text" maxLength={8} placeholder="Opcional" />
            </label>
            <label>Validade da autorização
              <input name="rights_valid_until" type="date" />
            </label>
            <label className="catalog-sheet-field">Cifra autorizada
              <textarea name="chord_sheet" rows={12} maxLength={40000} required placeholder="Cole aqui somente o conteúdo cuja autorização de armazenamento e exibição já foi confirmada." />
            </label>
            <label className="catalog-sheet-field">Origem ou referência documental
              <input name="source_reference" type="text" minLength={5} maxLength={1000} required placeholder="Link ou identificador do documento/licença" />
            </label>
            <label className="catalog-sheet-field">Base e limites de uso
              <textarea name="rights_basis" rows={3} maxLength={2000} required placeholder="Titular/licenciante, usos permitidos, território e condições relevantes" />
            </label>
            <label className="rights-confirmation">
              <input name="rights_confirmed" type="checkbox" value="yes" required />
              <span>Confirmo que a autorização documentada cobre o armazenamento da cifra e sua exibição ao músico autenticado conforme o produto.</span>
            </label>
            <button className="button button-primary" type="submit">Revisar e publicar no catálogo</button>
          </form>
          <p className="admin-catalog-note">Este registro guarda quem revisou e a referência informada. O formulário não concede direitos; só use conteúdo com autorização efetivamente confirmada.</p>
        </section>

        <section className="admin-catalog-list-section">
          <div className="dashboard-title-row">
            <div><h2 className="section-heading">Músicas cadastradas</h2><p>Retire do catálogo público quando a autorização expirar ou ficar em dúvida.</p></div>
          </div>
          <CatalogListControls
            pathname="/admin/catalogo"
            inputId="admin-catalog-search"
            searchTerm={searchTerm}
            page={page}
            pageCount={pageCount}
            resultCount={resultCount}
          />
          {songs?.length ? (
            <div className="admin-license-list">
              {songs.map((song) => (
                <article className="panel admin-license-card" key={song.id}>
                  <div className="admin-license-heading">
                    <div><h2>{song.title}</h2><p>{song.artist} · {song.version_label}</p></div>
                    <span className={song.rights_status === "approved" ? "status-live" : "demo-label"}>{song.rights_status}</span>
                  </div>
                  <div className="catalog-record-foot">
                    <span>{song.rights_valid_until ? `Autorização até ${new Date(`${song.rights_valid_until}T12:00:00`).toLocaleDateString("pt-BR")}` : "Sem vencimento informado"}</span>
                    {song.rights_status === "approved" && (
                      <form action={withdrawSongAction}>
                        <input type="hidden" name="song_id" value={song.id} />
                        <button className="button button-outline button-small" type="submit">Retirar do público</button>
                      </form>
                    )}
                  </div>
                  <form action={updateSongGenreAction} className="catalog-genre-form">
                    <input type="hidden" name="song_id" value={song.id} />
                    <label>Gênero principal
                      <input name="genre" type="text" maxLength={80} defaultValue={song.genre} required />
                    </label>
                    <button className="button button-outline button-small" type="submit">Salvar gênero</button>
                  </form>
                </article>
              ))}
            </div>
          ) : searchTerm ? (
            <section className="panel catalog-empty-panel catalog-search-empty">
              <span className="empty-queue-art"><ShieldCheck size={25} /></span>
              <h2>Nenhuma música encontrada</h2>
              <p>Tente outro título, artista ou compositor.</p>
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
              <p>Adicione somente conteúdo com origem e autorização registradas.</p>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
