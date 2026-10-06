import Link from "next/link";
import { ArrowLeft, BookOpen, Check, Music2, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { CatalogListControls } from "@/components/catalog-list-controls";
import { addSongToRepertoireAction, removeSongFromRepertoireAction, updateRepertoirePriceAction } from "@/app/painel/repertorio/actions";
import { requireActiveMusician } from "@/lib/auth/require-active-musician";
import {
  CATALOG_PAGE_SIZE,
  catalogPageHref,
  normalizeCatalogSearch,
  parseCatalogPage,
} from "@/lib/catalog/pagination";

type RepertoirePageProps = {
  searchParams: Promise<{
    estado?: string | string[];
    q?: string | string[];
    pagina?: string | string[];
  }>;
};

const messages: Record<string, string> = {
  adicionada: "Música adicionada ao repertório.",
  removida: "Música removida do repertório.",
  valor: "Valor inválido. Use um preço entre R$ 0 e R$ 5, com até duas casas decimais.",
  valor_salvo: "Valor do pedido atualizado.",
  musica: "Não foi possível atualizar o repertório. Atualize a página e tente novamente.",
};

export default async function RepertoirePage({ searchParams }: RepertoirePageProps) {
  const params = await searchParams;
  const estado = Array.isArray(params.estado) ? params.estado[0] : params.estado;
  const searchTerm = normalizeCatalogSearch(params.q);
  const requestedPage = parseCatalogPage(params.pagina);
  const { supabase, musicianId } = await requireActiveMusician();

  let catalogCountQuery = supabase
    .from("catalog_songs")
    .select("id", { count: "exact", head: true })
    .eq("rights_status", "approved")
    .contains("rights_territories", ["BR"]);
  if (searchTerm) {
    catalogCountQuery = catalogCountQuery.textSearch("catalog_search_vector", searchTerm, { config: "simple", type: "plain" });
  }
  const repertoireCountQuery = supabase
    .from("repertoire_items")
    .select("id", { count: "exact", head: true })
    .eq("musician_id", musicianId);
  const [{ count: catalogCount }, { count: selectedCount }] = await Promise.all([
    catalogCountQuery,
    repertoireCountQuery,
  ]);

  const resultCount = catalogCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(resultCount / CATALOG_PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);
  let songsQuery = supabase
    .from("catalog_songs")
    .select("id, title, artist, composers, version_label, original_key")
    .eq("rights_status", "approved")
    .contains("rights_territories", ["BR"]);
  if (searchTerm) {
    songsQuery = songsQuery.textSearch("catalog_search_vector", searchTerm, { config: "simple", type: "plain" });
  }
  const { data: songs } = await songsQuery
    .order("title", { ascending: true })
    .order("id", { ascending: true })
    .range((page - 1) * CATALOG_PAGE_SIZE, page * CATALOG_PAGE_SIZE - 1);

  const songIds = (songs ?? []).map((song) => song.id);
  let repertoire: { id: string; song_id: string; price_cents: number }[] = [];
  if (songIds.length) {
    const { data } = await supabase
      .from("repertoire_items")
      .select("id, song_id, price_cents")
      .eq("musician_id", musicianId)
      .in("song_id", songIds);
    repertoire = data ?? [];
  }

  const repertoireBySongId = new Map(repertoire.map((item) => [item.song_id, item]));

  return (
    <main className="dashboard-page">
      <div className="dashboard-wrap">
        <header className="dashboard-topbar">
          <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
          <Link className="button button-outline button-small" href="/painel"><ArrowLeft size={15} /> Voltar ao painel</Link>
        </header>

        <div className="dashboard-title-row">
          <div><h1>Repertório</h1><p>Escolha músicas do catálogo central revisado.</p></div>
          <span className="status-live"><Music2 size={13} /> {selectedCount ?? 0} selecionadas</span>
        </div>

        {estado && messages[estado] && <p className="dashboard-flash" role="status">{messages[estado]}</p>}

        <CatalogListControls
          pathname="/painel/repertorio"
          inputId="repertoire-catalog-search"
          searchTerm={searchTerm}
          page={page}
          pageCount={pageCount}
          resultCount={resultCount}
        />

        {!songs?.length && searchTerm ? (
          <section className="panel catalog-empty-panel catalog-search-empty">
            <span className="empty-queue-art"><ShieldCheck size={25} /></span>
            <h2>Nenhuma música encontrada</h2>
            <p>Tente outro título, artista ou compositor.</p>
          </section>
        ) : !songs?.length ? (
          <section className="panel catalog-empty-panel">
            <span className="empty-queue-art"><ShieldCheck size={25} /></span>
            <h2>O catálogo está sendo preparado</h2>
            <p>As músicas aparecem aqui depois que a plataforma confirmar origem e autorização de uso. Cifras de sites externos não são importadas automaticamente.</p>
          </section>
        ) : (
          <div className="catalog-grid">
            {songs.map((song) => {
              const repertoireItem = repertoireBySongId.get(song.id);
              return (
                <article className="panel catalog-song" key={song.id}>
                  <div className="panel-heading catalog-song-heading">
                    <div>
                      <h2>{song.title}</h2>
                      <p>{song.artist}{song.original_key ? ` · Tom ${song.original_key}` : ""}</p>
                    </div>
                    {repertoireItem ? (
                      <form action={removeSongFromRepertoireAction}>
                        <input type="hidden" name="item_id" value={repertoireItem.id} />
                        <button className="button button-outline button-small" type="submit"><Check size={14} /> No repertório</button>
                      </form>
                    ) : (
                      <form action={addSongToRepertoireAction}>
                        <input type="hidden" name="song_id" value={song.id} />
                        <button className="button button-primary button-small" type="submit">Adicionar</button>
                      </form>
                    )}
                  </div>
                  {song.composers.length > 0 && <p className="catalog-composers">Compositores: {song.composers.join(", ")}</p>}
                  <Link
                    className="button button-outline button-small catalog-open-sheet"
                    href={catalogPageHref(`/painel/repertorio/${song.id}`, searchTerm, page)}
                    prefetch={false}
                  ><BookOpen size={14} /> Abrir cifra</Link>
                  {repertoireItem && (
                    <form action={updateRepertoirePriceAction} className="repertoire-price-form">
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
                  <p className="catalog-version">{song.version_label}</p>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
