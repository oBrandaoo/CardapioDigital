import Link from "next/link";
import { ArrowLeft, ExternalLink, Music2, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { requireAdmin } from "@/lib/auth/require-admin";
import { firstSearchParam, normalizeCatalogSearch, parseCatalogPage } from "@/lib/catalog/pagination";
import {
  browseMusicBrainzRecordings,
  MUSICBRAINZ_MAX_PAGE,
  MUSICBRAINZ_PAGE_SIZE,
  MusicBrainzError,
  searchMusicBrainzArtists,
  type MusicBrainzArtist,
  type MusicBrainzRecording,
} from "@/lib/catalog/musicbrainz";
import { importMusicBrainzRecordingsAction } from "./actions";
import { ImportAllMusicBrainz } from "./import-all";

type MusicBrainzPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    artista?: string | string[];
    pagina?: string | string[];
    estado?: string | string[];
    importadas?: string | string[];
    repetidas?: string | string[];
  }>;
};

function href(query: string, artistId: string, page = 1) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (artistId) params.set("artista", artistId);
  if (page > 1) params.set("pagina", String(page));
  return `/admin/catalogo/musicbrainz?${params}`;
}

export default async function MusicBrainzImportPage({ searchParams }: MusicBrainzPageProps) {
  const params = await searchParams;
  await requireAdmin();
  const query = normalizeCatalogSearch(params.q);
  const artistId = firstSearchParam(params.artista) ?? "";
  const validArtistId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(artistId);
  const page = Math.min(parseCatalogPage(params.pagina), MUSICBRAINZ_MAX_PAGE);
  const state = firstSearchParam(params.estado) ?? "";
  const imported = Math.max(0, Number(firstSearchParam(params.importadas)) || 0);
  const skipped = Math.max(0, Number(firstSearchParam(params.repetidas)) || 0);
  let artists: MusicBrainzArtist[] = [];
  let recordings: MusicBrainzRecording[] = [];
  let recordingCount = 0;
  let apiError = "";

  try {
    if (validArtistId) {
      ({ recordings, count: recordingCount } = await browseMusicBrainzRecordings(artistId, page));
    } else if (query.length >= 2) {
      artists = await searchMusicBrainzArtists(query);
    }
  } catch (error) {
    apiError = error instanceof MusicBrainzError && error.kind === "setup"
      ? "Aplique a migração do MusicBrainz no Supabase e confira a chave de servidor."
      : error instanceof MusicBrainzError && error.kind === "busy"
        ? "O MusicBrainz está ocupado ou o limite de consultas foi alcançado. Aguarde e tente novamente."
        : "Não foi possível consultar o MusicBrainz agora. Tente novamente em instantes.";
  }
  const pageCount = Math.min(MUSICBRAINZ_MAX_PAGE, Math.max(1, Math.ceil(recordingCount / MUSICBRAINZ_PAGE_SIZE)));

  return (
    <main className="dashboard-page">
      <div className="dashboard-wrap">
        <header className="dashboard-topbar">
          <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
          <Link className="button button-outline button-small" href="/admin/catalogo/importar"><ArrowLeft size={15} /> Importações</Link>
        </header>
        <div className="dashboard-title-row">
          <div><h1>Buscar no MusicBrainz</h1><p>Encontre gravações por artista e selecione os metadados para revisar.</p></div>
          <span className="status-live"><ShieldCheck size={13} /> Administração</span>
        </div>

        <section className="panel musicbrainz-panel">
          <p className="musicbrainz-notice">A importação salva apenas título e artista como rascunhos privados. MusicBrainz não fornece cifra nem autorização de exibição para este produto.</p>
          <form action="/admin/catalogo/musicbrainz" method="get" className="catalog-search-form" role="search">
            <label htmlFor="musicbrainz-artist">Nome do artista</label>
            <div className="catalog-search-row">
              <input id="musicbrainz-artist" name="q" type="search" minLength={2} maxLength={100} defaultValue={query} placeholder="Ex.: Tonico & Tinoco" required />
              <button className="button button-primary button-small" type="submit">Buscar</button>
            </div>
          </form>

          {state === "salva" && <p className="dashboard-flash" role="status">{imported} rascunho(s) salvo(s); {skipped} repetido(s) ignorado(s). <Link href="/admin/catalogo?situacao=pending">Abrir fila de revisão</Link></p>}
          {state === "parcial" && <p className="dashboard-flash" role="status">A importação parou após {imported} rascunho(s). {skipped} repetido(s) foram ignorados. Confira a fila antes de tentar novamente.</p>}
          {state === "campos" && <p className="dashboard-flash" role="status">Selecione até {MUSICBRAINZ_PAGE_SIZE} gravações válidas e informe um gênero.</p>}
          {state === "api" && <p className="dashboard-flash" role="status">Não foi possível confirmar os dados no MusicBrainz. Tente novamente.</p>}
          {apiError && <p className="dashboard-flash" role="status">{apiError}</p>}

          {!validArtistId && query.length >= 2 && !apiError && (
            <div className="musicbrainz-results">
              <h2>Escolha o artista</h2>
              {artists.length ? artists.map((artist) => (
                <Link className="musicbrainz-result" key={artist.id} href={href(query, artist.id)} prefetch={false}>
                  <span><strong>{artist.name}</strong>{artist.description && <small>{artist.description}</small>}</span>
                  <span>Ver gravações →</span>
                </Link>
              )) : <p>Nenhum artista encontrado. Confira o nome e tente outra busca.</p>}
            </div>
          )}

          {validArtistId && !apiError && (
            <div className="musicbrainz-results">
              <div className="musicbrainz-results-heading">
                <div><h2>Gravações encontradas</h2><p>{recordingCount.toLocaleString("pt-BR")} registros no MusicBrainz. Escolha somente músicas relevantes para o catálogo.</p></div>
                <Link className="button button-outline button-small" href={href(query, "")} prefetch={false}><ArrowLeft size={14} /> Trocar artista</Link>
              </div>
              {recordingCount > 0 && <ImportAllMusicBrainz artistId={artistId} recordingCount={recordingCount} />}
              {recordings.length ? (
                <form action={importMusicBrainzRecordingsAction}>
                  <input type="hidden" name="artist_id" value={artistId} />
                  <input type="hidden" name="q" value={query} />
                  <input type="hidden" name="page" value={page} />
                  <div className="musicbrainz-list">
                    {recordings.map((recording) => (
                      <div className="musicbrainz-recording" key={recording.id}>
                        <label>
                          <input type="checkbox" name="recording_id" value={recording.id} disabled={!recording.canImport} />
                          <span>
                            <strong>{recording.title || "Sem título"}</strong>
                            <small>{recording.artist || "Artista não informado"}{recording.firstReleaseDate && ` · ${recording.firstReleaseDate}`}</small>
                          </span>
                        </label>
                        <a href={`https://musicbrainz.org/recording/${recording.id}`} target="_blank" rel="noreferrer" aria-label={`Abrir ${recording.title} no MusicBrainz`}><ExternalLink size={15} /></a>
                      </div>
                    ))}
                  </div>
                  <div className="musicbrainz-import-actions">
                    <label>Gênero principal <input name="genre" type="text" maxLength={80} defaultValue="Sertanejo" required /></label>
                    <button className="button button-primary" type="submit"><Music2 size={16} /> Importar seleção como rascunho</button>
                  </div>
                </form>
              ) : <p>Nenhuma gravação nesta página.</p>}
              {pageCount > 1 && (
                <nav className="performance-pagination" aria-label="Páginas de gravações">
                  {page > 1 && <Link className="button button-outline button-small" href={href(query, artistId, page - 1)} prefetch={false}>Anterior</Link>}
                  <span>Página {page} de {pageCount}</span>
                  {page < pageCount && <Link className="button button-outline button-small" href={href(query, artistId, page + 1)} prefetch={false}>Próxima</Link>}
                </nav>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
