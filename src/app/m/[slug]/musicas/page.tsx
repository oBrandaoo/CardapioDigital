import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Music2, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { CatalogListControls } from "@/components/catalog-list-controls";
import { catalogPageHref, firstSearchParam, normalizeCatalogSearch, parseCatalogPage } from "@/lib/catalog/pagination";
import { getSupabaseConfig } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { submitSongRequestAction } from "@/app/m/[slug]/actions";

type PublicMusicianPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    pedido?: string | string[];
    q?: string | string[];
    pagina?: string | string[];
    aba?: string | string[];
    genero?: string | string[];
  }>;
};

const PUBLIC_PAGE_SIZE = 24;

const requestMessages: Record<string, string> = {
  enviado: "Pedido enviado para a fila do músico.",
  duplicado: "Você já pediu essa música há pouco. Aguarde a vez dela.",
  limite: "Você chegou ao limite temporário de pedidos. Tente novamente daqui a alguns minutos.",
  atualizar_banco: "O banco ainda não recebeu a atualização do fluxo de pedidos. Aplique as migrations do projeto no Supabase.",
  preparacao: "O pedido exige perfil público, licença ativa, apresentação aberta e música aprovada no repertório.",
  configuracao: "Os pedidos ainda não estão liberados neste ambiente.",
  indisponivel: "Essa música não está disponível para pedido agora.",
};

export async function generateMetadata({ params }: PublicMusicianPageProps) {
  const { slug } = await params;
  if (!getSupabaseConfig() && slug === "banda-mare") {
    return { title: "Buscar músicas — Banda Maré" };
  }

  const supabase = createSupabasePublicClient();
  if (!supabase) return { title: "Página do músico" };

  const { data: musician } = await supabase
    .from("musicians")
    .select("stage_name")
    .eq("slug", slug)
    .maybeSingle();

  return { title: musician ? `Buscar músicas — ${musician.stage_name}` : "Músico não encontrado" };
}

export default async function PublicSongSearchPage({ params, searchParams }: PublicMusicianPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const pedido = firstSearchParam(query.pedido);
  const tab = firstSearchParam(query.aba) === "catalogo" ? "catalogo" : "repertorio";
  const searchTerm = normalizeCatalogSearch(query.q)
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const requestedPage = parseCatalogPage(query.pagina);
  const pathname = `/m/${slug}/musicas`;
  let page = 1;
  let pageCount = 1;
  let resultCount = 0;
  let repertoireError = false;
  let musician: { stage_name: string };
  let hasActiveShow = false;
  let performanceId: string | null = null;
  let songs: { id: string; title: string; artist: string; genre: string; price_cents: number | null }[] = [];
  let genres: { genre: string; song_count: number }[] = [];
  let genre = "";
  const requestsReady = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    (process.env.REQUEST_TOKEN_SECRET?.length ?? 0) >= 32,
  );
  const mockPaymentsEnabled = process.env.NODE_ENV === "development";

  if (!getSupabaseConfig() && slug === "banda-mare") {
    musician = { stage_name: "Banda Maré" };
    hasActiveShow = true;
  } else {
    const supabase = createSupabasePublicClient();
    if (!supabase) notFound();

    const { data: musicianRecord } = await supabase
      .from("musicians")
      .select("id, stage_name")
      .eq("slug", slug)
      .eq("profile_is_public", true)
      .maybeSingle();

    if (!musicianRecord) notFound();
    musician = musicianRecord;

    const { data: performance } = await supabase
      .from("performances")
      .select("id")
      .eq("musician_id", musicianRecord.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    hasActiveShow = Boolean(performance);
    performanceId = performance?.id ?? null;

    const { data: publicGenres, error: genresError } = await supabase.rpc("list_public_song_genres");
    if (genresError) {
      console.error("Falha ao carregar gêneros públicos:", genresError.code);
      repertoireError = true;
    } else {
      genres = publicGenres ?? [];
      const requestedGenre = firstSearchParam(query.genero) ?? "";
      genre = genres.some((item) => item.genre === requestedGenre) ? requestedGenre : "";
    }

    if (performance && !repertoireError && tab === "repertorio") {
      let countQuery = supabase
        .from("repertoire_items")
        .select("id, catalog_songs!inner(id)", { count: "exact", head: true })
        .eq("musician_id", musicianRecord.id)
        .eq("is_enabled", true);
      if (genre) countQuery = countQuery.eq("catalog_songs.genre", genre);
      if (searchTerm) {
        countQuery = countQuery.or(
          `title.ilike.%${searchTerm}%,artist.ilike.%${searchTerm}%`,
          { referencedTable: "catalog_songs" },
        );
      }
      const { count, error: countError } = await countQuery;
      if (countError) {
        console.error("Falha ao contar repertório público:", countError.code);
        repertoireError = true;
      } else {
        resultCount = count ?? 0;
        pageCount = Math.max(1, Math.ceil(resultCount / PUBLIC_PAGE_SIZE));
        page = Math.min(requestedPage, pageCount);

        if (resultCount > 0) {
          let songsQuery = supabase
            .from("repertoire_items")
            .select("id, price_cents, catalog_songs!inner(id, title, artist, genre)")
            .eq("musician_id", musicianRecord.id)
            .eq("is_enabled", true);
          if (genre) songsQuery = songsQuery.eq("catalog_songs.genre", genre);
          if (searchTerm) {
            songsQuery = songsQuery.or(
              `title.ilike.%${searchTerm}%,artist.ilike.%${searchTerm}%`,
              { referencedTable: "catalog_songs" },
            );
          }
          const { data: repertoire, error: songsError } = await songsQuery
            .order("catalog_songs(title)", { ascending: true })
            .order("id", { ascending: true })
            .range((page - 1) * PUBLIC_PAGE_SIZE, page * PUBLIC_PAGE_SIZE - 1);
          if (songsError) {
            console.error("Falha ao carregar repertório público:", songsError.code);
            repertoireError = true;
          } else {
            songs = (repertoire ?? []).flatMap((item) => {
              const song = Array.isArray(item.catalog_songs)
                ? item.catalog_songs[0]
                : item.catalog_songs;
              return song ? [{ id: song.id, title: song.title, artist: song.artist, genre: song.genre, price_cents: item.price_cents }] : [];
            });
          }
        }
      }
    }

    if (!repertoireError && tab === "catalogo") {
      let countQuery = supabase
        .from("catalog_songs")
        .select("id", { count: "exact", head: true });
      if (genre) countQuery = countQuery.eq("genre", genre);
      if (searchTerm) {
        countQuery = countQuery.or(`title.ilike.%${searchTerm}%,artist.ilike.%${searchTerm}%`);
      }
      const { count, error: countError } = await countQuery;
      if (countError) {
        console.error("Falha ao contar catálogo público:", countError.code);
        repertoireError = true;
      } else {
        resultCount = count ?? 0;
        pageCount = Math.max(1, Math.ceil(resultCount / PUBLIC_PAGE_SIZE));
        page = Math.min(requestedPage, pageCount);

        if (resultCount > 0) {
          let songsQuery = supabase.from("catalog_songs").select("id, title, artist, genre");
          if (genre) songsQuery = songsQuery.eq("genre", genre);
          if (searchTerm) {
            songsQuery = songsQuery.or(`title.ilike.%${searchTerm}%,artist.ilike.%${searchTerm}%`);
          }
          const { data: catalogSongs, error: songsError } = await songsQuery
            .order("title", { ascending: true })
            .order("id", { ascending: true })
            .range((page - 1) * PUBLIC_PAGE_SIZE, page * PUBLIC_PAGE_SIZE - 1);
          if (songsError) {
            console.error("Falha ao carregar catálogo público:", songsError.code);
            repertoireError = true;
          } else {
            songs = (catalogSongs ?? []).map((song) => ({ ...song, price_cents: null }));
          }
        }
      }
    }
  }

  return (
    <main className="public-page">
      <header className="public-header">
        <Link href="/" aria-label="Cardápio Musical, início"><Brand compact /></Link>
        <span className={hasActiveShow ? "status-live" : "public-closed-pill"}>
          {hasActiveShow && <span className="live-dot" />}
          {hasActiveShow ? "Show aberto" : "Fora de apresentação"}
        </span>
      </header>

      <div className="public-content">
        <section className="public-section">
          <Link className="public-search-back" href={`/m/${slug}`}><ArrowLeft size={16} /> Voltar para {musician.stage_name}</Link>
          <div className="public-section-heading">
            <div>
              <h1>Encontre uma música</h1>
              <p>Explore o catálogo aprovado e veja o que {musician.stage_name} aceita tocar.</p>
            </div>
          </div>

          {pedido && requestMessages[pedido] && (
            <p className={`public-request-message ${pedido === "enviado" ? "success" : ""}`} role="status">
              {requestMessages[pedido]}
            </p>
          )}

          <nav className="public-search-tabs" aria-label="Origem das músicas">
            <Link
              className={tab === "repertorio" ? "active" : ""}
              aria-current={tab === "repertorio" ? "page" : undefined}
              href={catalogPageHref(pathname, searchTerm, 1, { genero: genre })}
            >Repertório do cantor</Link>
            <Link
              className={tab === "catalogo" ? "active" : ""}
              aria-current={tab === "catalogo" ? "page" : undefined}
              href={catalogPageHref(pathname, searchTerm, 1, { aba: "catalogo", genero: genre })}
            >Catálogo da plataforma</Link>
          </nav>

          {!repertoireError && (
            <nav className="public-genre-list" aria-label="Filtrar por gênero">
              <Link
                className={!genre ? "active" : ""}
                aria-current={!genre ? "true" : undefined}
                href={catalogPageHref(pathname, searchTerm, 1, { aba: tab === "catalogo" ? tab : "" })}
              >Todos os gêneros</Link>
              {genres.map((item) => (
                <Link
                  key={item.genre}
                  className={genre === item.genre ? "active" : ""}
                  aria-current={genre === item.genre ? "true" : undefined}
                  href={catalogPageHref(pathname, searchTerm, 1, { aba: tab === "catalogo" ? tab : "", genero: item.genre })}
                >{item.genre}</Link>
              ))}
            </nav>
          )}

          {!repertoireError && (hasActiveShow || tab === "catalogo") && (
            <CatalogListControls
              pathname={pathname}
              inputId="public-song-search"
              searchTerm={searchTerm}
              searchLabel="Buscar por título ou artista"
              page={page}
              pageCount={pageCount}
              resultCount={resultCount}
              extraParams={{ aba: tab === "catalogo" ? tab : "", genero: genre }}
            />
          )}

          {repertoireError ? (
            <div className="public-empty" role="alert">
              <Music2 size={23} />
              <h3>Não foi possível carregar as músicas</h3>
              <p>Confira se a migração de gêneros foi aplicada e atualize a página.</p>
            </div>
          ) : (tab === "repertorio" && !hasActiveShow) || songs.length === 0 ? (
            <div className="public-empty">
              <Music2 size={23} />
              <h3>{tab === "repertorio" && !hasActiveShow ? "A apresentação ainda não começou" : searchTerm || genre ? "Nenhuma música encontrada" : tab === "repertorio" ? "O repertório está sendo preparado" : "O catálogo está sendo preparado"}</h3>
              <p>{tab === "repertorio" && !hasActiveShow
                ? "Os pedidos abrem quando o músico iniciar a apresentação."
                : searchTerm || genre ? "Tente outro título, artista ou gênero." : "As músicas aparecem depois da revisão do catálogo central."}</p>
            </div>
          ) : (
            <div className="public-song-list">
              {songs.map((song) => (
                <div className="public-song-row" key={song.id}>
                  <span className="public-song-icon"><Music2 size={16} /></span>
                  <span className="public-song-copy"><strong>{song.title}</strong><span>{song.artist} · {song.genre}</span></span>
                  {tab === "repertorio" && performanceId && requestsReady && song.price_cents !== null ? (
                    <form action={submitSongRequestAction}>
                      <input type="hidden" name="performance_id" value={performanceId} />
                      <input type="hidden" name="song_id" value={song.id} />
                      <input type="hidden" name="slug" value={slug} />
                      <input type="hidden" name="search_query" value={searchTerm} />
                      <input type="hidden" name="search_genre" value={genre} />
                      <input type="hidden" name="search_page" value={page} />
                      <button
                        className="button button-primary button-small public-request-button"
                        type="submit"
                        disabled={song.price_cents > 0 && !mockPaymentsEnabled}
                      >
                        {song.price_cents === 0 ? "Pedir grátis" : `Pedir · ${(song.price_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
                      </button>
                    </form>
                  ) : <span className="public-song-note">{tab === "catalogo" ? "Consulte o repertório para pedir" : "Pedidos indisponíveis"}</span>}
                  {tab === "repertorio" && song.price_cents !== null && song.price_cents > 0 && !mockPaymentsEnabled && <span className="public-song-note">Cobrança indisponível</span>}
                </div>
              ))}
            </div>
          )}

          {tab === "repertorio" && hasActiveShow && songs.length > 0 && (
            <p className="public-request-hint">
              {mockPaymentsEnabled
                ? "Pedidos pagos só entram na fila após a confirmação do teste. Nenhum valor real será cobrado neste ambiente."
                : "Pedidos pagos só estarão disponíveis quando a cobrança real estiver configurada. Pedidos gratuitos continuam disponíveis."}
            </p>
          )}
        </section>

        <p className="public-footer">
          <ShieldCheck size={13} /> O público vê títulos. Quando houver cifra, ela fica no acesso autenticado do músico.
          <br />
          <span className="brand-lockup" aria-label="Feito com Cardápio Musical">
            <span className="brand-mark"><Music2 size={15} /></span>
            <span className="brand-name">Cardápio Musical</span>
          </span>
        </p>
      </div>
    </main>
  );
}
