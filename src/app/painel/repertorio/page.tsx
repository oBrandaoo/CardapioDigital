import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Check, Music2, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { addSongToRepertoireAction, removeSongFromRepertoireAction, updateRepertoirePriceAction } from "@/app/painel/repertorio/actions";
import { requireActiveMusician } from "@/lib/auth/require-active-musician";

type RepertoirePageProps = {
  searchParams: Promise<{ estado?: string }>;
};

const messages: Record<string, string> = {
  adicionada: "Música adicionada ao repertório.",
  removida: "Música removida do repertório.",
  valor: "Valor inválido. Use um preço entre R$ 0 e R$ 5, com até duas casas decimais.",
  valor_salvo: "Valor do pedido atualizado.",
  musica: "Não foi possível atualizar o repertório. Atualize a página e tente novamente.",
};

export default async function RepertoirePage({ searchParams }: RepertoirePageProps) {
  const { estado } = await searchParams;
  const { supabase, musicianId } = await requireActiveMusician();
  const [{ data: songs }, { data: repertoire }] = await Promise.all([
    supabase
      .from("catalog_songs")
      .select("id, title, artist, composers, version_label, original_key, chord_sheet")
      .eq("rights_status", "approved")
      .contains("rights_territories", ["BR"])
      .order("title", { ascending: true }),
    supabase
      .from("repertoire_items")
      .select("id, song_id, price_cents")
      .eq("musician_id", musicianId),
  ]);

  const selectedIds = new Set((repertoire ?? []).map((item) => item.song_id));

  return (
    <main className="dashboard-page">
      <div className="dashboard-wrap">
        <header className="dashboard-topbar">
          <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
          <Link className="button button-outline button-small" href="/painel"><ArrowLeft size={15} /> Voltar ao painel</Link>
        </header>

        <div className="dashboard-title-row">
          <div><h1>Repertório</h1><p>Escolha músicas do catálogo central revisado.</p></div>
          <span className="status-live"><Music2 size={13} /> {selectedIds.size} selecionadas</span>
        </div>

        {estado && messages[estado] && <p className="dashboard-flash" role="status">{messages[estado]}</p>}

        {!songs?.length ? (
          <section className="panel catalog-empty-panel">
            <span className="empty-queue-art"><ShieldCheck size={25} /></span>
            <h2>O catálogo está sendo preparado</h2>
            <p>As músicas aparecem aqui depois que a plataforma confirmar origem e autorização de uso. Cifras de sites externos não são importadas automaticamente.</p>
          </section>
        ) : (
          <div className="catalog-grid">
            {songs.map((song) => {
              const repertoireItem = (repertoire ?? []).find((item) => item.song_id === song.id);
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
                  <pre className="chord-sheet">{song.chord_sheet}</pre>
                  <p className="rights-footnote"><ShieldCheck size={13} /> Conteúdo revisado para exibição a músicos autenticados.</p>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
