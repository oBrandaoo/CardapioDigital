import Link from "next/link";
import { ArrowLeft, BookOpen, Check, ListPlus, Music2, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { CatalogListControls } from "@/components/catalog-list-controls";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  addSongToRepertoireAction,
  addSongsToRepertoireAction,
  removeSongFromRepertoireAction,
  updateRepertoirePriceAction,
} from "@/app/painel/repertorio/actions";
import { requireActiveMusician } from "@/lib/auth/require-active-musician";
import {
  CATALOG_PAGE_SIZE,
  catalogPageHref,
  firstSearchParam,
  normalizeCatalogSearch,
  parseCatalogPage,
} from "@/lib/catalog/pagination";
import { catalogSearchPatterns } from "@/lib/catalog/search";
import { paidRequestsAvailable } from "@/lib/payments/availability";

type RepertoirePageProps = {
  searchParams: Promise<{
    estado?: string | string[];
    q?: string | string[];
    pagina?: string | string[];
    aba?: string | string[];
    quantidade?: string | string[];
  }>;
};

type SongRow = { id: string; title: string; artist: string; version_label: string };
type RepertoireRow = { id: string; song_id: string; price_cents: number };

const BULK_FORM_ID = "repertoire-bulk-add";

const messages: Record<string, string> = {
  adicionada: "Música adicionada ao repertório.",
  removida: "Música removida do repertório.",
  selecao: "Marque pelo menos uma música para adicionar.",
  valor: "Valor inválido. Use um preço entre R$ 0 e R$ 5, com até duas casas decimais.",
  valor_salvo: "Valor do pedido atualizado.",
  gratuita: "Pedido dessa música agora é gratuito.",
  musica: "Não foi possível atualizar o repertório. Atualize a página e tente novamente.",
};

function formatPrice(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function RepertoirePage({ searchParams }: RepertoirePageProps) {
  const params = await searchParams;
  const estado = firstSearchParam(params.estado);
  const quantidade = Number(firstSearchParam(params.quantidade) ?? "0");
  const tab = firstSearchParam(params.aba) === "meu" ? "meu" : "catalogo";
  const searchTerm = normalizeCatalogSearch(params.q);
  const patterns = catalogSearchPatterns(searchTerm);
  const requestedPage = parseCatalogPage(params.pagina);
  const paidAvailable = paidRequestsAvailable();
  const { supabase, musicianId } = await requireActiveMusician();

  const { count: selectedCount } = await supabase
    .from("repertoire_items")
    .select("id", { count: "exact", head: true })
    .eq("musician_id", musicianId);

  let resultCount = 0;
  let page = 1;
  let songs: SongRow[] = [];
  let repertoireBySongId = new Map<string, RepertoireRow>();

  if (tab === "catalogo") {
    let countQuery = supabase
      .from("catalog_songs")
      .select("id", { count: "exact", head: true })
      .eq("rights_status", "approved");
    for (const pattern of patterns) countQuery = countQuery.ilike("search_text", pattern);
    const { count } = await countQuery;
    resultCount = count ?? 0;
    page = Math.min(requestedPage, Math.max(1, Math.ceil(resultCount / CATALOG_PAGE_SIZE)));

    let songsQuery = supabase
      .from("catalog_songs")
      .select("id, title, artist, version_label")
      .eq("rights_status", "approved");
    for (const pattern of patterns) songsQuery = songsQuery.ilike("search_text", pattern);
    const { data } = await songsQuery
      .order("title", { ascending: true })
      .order("id", { ascending: true })
      .range((page - 1) * CATALOG_PAGE_SIZE, page * CATALOG_PAGE_SIZE - 1);
    songs = data ?? [];

    if (songs.length) {
      const { data: items } = await supabase
        .from("repertoire_items")
        .select("id, song_id, price_cents")
        .eq("musician_id", musicianId)
        .in("song_id", songs.map((song) => song.id));
      repertoireBySongId = new Map((items ?? []).map((item) => [item.song_id, item]));
    }
  } else {
    let countQuery = supabase
      .from("repertoire_items")
      .select("id, catalog_songs!inner(id)", { count: "exact", head: true })
      .eq("musician_id", musicianId);
    for (const pattern of patterns) countQuery = countQuery.ilike("catalog_songs.search_text", pattern);
    const { count } = await countQuery;
    resultCount = count ?? 0;
    page = Math.min(requestedPage, Math.max(1, Math.ceil(resultCount / CATALOG_PAGE_SIZE)));

    let itemsQuery = supabase
      .from("repertoire_items")
      .select("id, song_id, price_cents, catalog_songs!inner(id, title, artist, version_label)")
      .eq("musician_id", musicianId);
    for (const pattern of patterns) itemsQuery = itemsQuery.ilike("catalog_songs.search_text", pattern);
    const { data } = await itemsQuery
      .order("catalog_songs(title)", { ascending: true })
      .order("id", { ascending: true })
      .range((page - 1) * CATALOG_PAGE_SIZE, page * CATALOG_PAGE_SIZE - 1);
    for (const item of data ?? []) {
      const song = Array.isArray(item.catalog_songs) ? item.catalog_songs[0] : item.catalog_songs;
      if (!song) continue;
      songs.push(song);
      repertoireBySongId.set(song.id, { id: item.id, song_id: item.song_id, price_cents: item.price_cents });
    }
  }

  const pageCount = Math.max(1, Math.ceil(resultCount / CATALOG_PAGE_SIZE));
  const tabParam = tab === "meu" ? "meu" : "";
  const notInRepertoire = songs.filter((song) => !repertoireBySongId.has(song.id));
  const flash = estado === "adicionadas"
    ? `${quantidade} música${quantidade === 1 ? "" : "s"} adicionada${quantidade === 1 ? "" : "s"} ao repertório.`
    : estado ? messages[estado] : undefined;

  // Hidden fields that send the musician back to the same tab, search and page.
  const returnFields = (
    <>
      {tabParam && <input type="hidden" name="aba" value={tabParam} />}
      {searchTerm && <input type="hidden" name="q" value={searchTerm} />}
      {page > 1 && <input type="hidden" name="pagina" value={page} />}
    </>
  );

  return (
    <main className="dashboard-page">
      <div className="dashboard-wrap">
        <header className="dashboard-topbar">
          <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
          <Link className="button button-outline button-small" href="/painel"><ArrowLeft size={15} /> Voltar ao painel</Link>
        </header>

        <div className="dashboard-title-row">
          <div><h1>Repertório</h1><p>Escolha no catálogo central as músicas que você aceita tocar.</p></div>
          <span className="status-live"><Music2 size={13} /> {selectedCount ?? 0} no repertório</span>
        </div>

        {flash && <p className="dashboard-flash" role="status">{flash}</p>}

        <nav className="public-search-tabs repertoire-tabs" aria-label="Escolher lista">
          <Link
            className={tab === "catalogo" ? "active" : ""}
            aria-current={tab === "catalogo" ? "page" : undefined}
            href={catalogPageHref("/painel/repertorio", searchTerm, 1)}
          >Catálogo</Link>
          <Link
            className={tab === "meu" ? "active" : ""}
            aria-current={tab === "meu" ? "page" : undefined}
            href={catalogPageHref("/painel/repertorio", searchTerm, 1, { aba: "meu" })}
          >Meu repertório ({selectedCount ?? 0})</Link>
        </nav>

        <CatalogListControls
          pathname="/painel/repertorio"
          inputId="repertoire-catalog-search"
          searchTerm={searchTerm}
          searchLabel={tab === "meu" ? "Buscar no seu repertório" : "Buscar por título, artista ou compositor"}
          page={page}
          pageCount={pageCount}
          resultCount={resultCount}
          extraParams={{ aba: tabParam }}
        />

        {!paidAvailable && (
          <div className="catalog-admin-callout">
            <ShieldCheck size={17} />
            <span>A cobrança por pedido ainda não está disponível. Por enquanto, todos os pedidos são gratuitos.</span>
          </div>
        )}

        {tab === "catalogo" && notInRepertoire.length > 0 && (
          <form id={BULK_FORM_ID} action={addSongsToRepertoireAction} className="repertoire-bulk-bar">
            {returnFields}
            <span>Marque várias músicas e adicione de uma vez.</span>
            <button className="button button-primary button-small" type="submit"><ListPlus size={15} /> Adicionar marcadas</button>
          </form>
        )}

        {songs.length === 0 ? (
          <section className="panel catalog-empty-panel catalog-search-empty">
            <span className="empty-queue-art"><ShieldCheck size={25} /></span>
            {searchTerm ? (
              <>
                <h2>Nenhuma música encontrada</h2>
                <p>Tente outro título, artista ou compositor. Não precisa digitar acentos.</p>
              </>
            ) : tab === "meu" ? (
              <>
                <h2>Seu repertório está vazio</h2>
                <p>Abra a aba Catálogo, marque as músicas que você toca e adicione de uma vez.</p>
                <Link className="button button-primary button-small" href="/painel/repertorio">Abrir catálogo</Link>
              </>
            ) : (
              <>
                <h2>O catálogo está sendo preparado</h2>
                <p>As músicas aparecem aqui depois que a plataforma confirmar a autorização de uso.</p>
              </>
            )}
          </section>
        ) : (
          <div className="catalog-grid">
            {songs.map((song) => {
              const repertoireItem = repertoireBySongId.get(song.id);
              return (
                <article className={`panel catalog-song${repertoireItem && tab === "catalogo" ? " catalog-song-selected" : ""}`} key={song.id}>
                  <div className="panel-heading catalog-song-heading">
                    <div className="catalog-song-title">
                      {tab === "catalogo" && !repertoireItem && (
                        <input
                          className="catalog-song-check"
                          type="checkbox"
                          name="song_id"
                          value={song.id}
                          form={BULK_FORM_ID}
                          aria-label={`Marcar ${song.title}, ${song.artist}`}
                        />
                      )}
                      <div>
                        <h2>{song.title}</h2>
                        <p>{song.artist}</p>
                      </div>
                    </div>
                    {repertoireItem ? (
                      tab === "catalogo" && <span className="status-live"><Check size={13} /> No repertório</span>
                    ) : (
                      <form action={addSongToRepertoireAction}>
                        {returnFields}
                        <input type="hidden" name="song_id" value={song.id} />
                        <button className="button button-primary button-small" type="submit">Adicionar</button>
                      </form>
                    )}
                  </div>

                  {repertoireItem && paidAvailable && (
                    <form action={updateRepertoirePriceAction} className="repertoire-price-form">
                      {returnFields}
                      <input type="hidden" name="item_id" value={repertoireItem.id} />
                      <label>
                        <span>Valor por pedido (R$)</span>
                        <input
                          name="price"
                          type="number"
                          min="0"
                          max="5"
                          step="0.01"
                          defaultValue={(repertoireItem.price_cents / 100).toFixed(2)}
                          required
                        />
                      </label>
                      <button className="button button-outline button-small" type="submit">Salvar valor</button>
                      <p>R$ 0,00 deixa o pedido gratuito. Máximo de R$ 5,00.</p>
                    </form>
                  )}
                  {repertoireItem && !paidAvailable && repertoireItem.price_cents > 0 && (
                    <form action={updateRepertoirePriceAction} className="repertoire-price-warning">
                      {returnFields}
                      <input type="hidden" name="item_id" value={repertoireItem.id} />
                      <input type="hidden" name="price" value="0" />
                      <p>Esta música está com valor de {formatPrice(repertoireItem.price_cents)}, mas a cobrança não está ativa: o público não consegue pedi-la.</p>
                      <button className="button button-primary button-small" type="submit">Deixar gratuita</button>
                    </form>
                  )}

                  <div className="catalog-song-actions">
                    <Link
                      className="button button-outline button-small"
                      href={catalogPageHref(`/painel/repertorio/${song.id}`, searchTerm, page, { aba: tabParam })}
                      prefetch={false}
                    ><BookOpen size={14} /> Ver música</Link>
                    {repertoireItem && (
                      <form action={removeSongFromRepertoireAction}>
                        {returnFields}
                        <input type="hidden" name="item_id" value={repertoireItem.id} />
                        <ConfirmSubmitButton
                          className="button button-outline button-small button-danger"
                          message={`Remover “${song.title}” do seu repertório? O público deixa de poder pedi-la.`}
                        >Remover</ConfirmSubmitButton>
                      </form>
                    )}
                  </div>
                  {song.version_label !== "Original" && <p className="catalog-version">{song.version_label}</p>}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
