import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Music2, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { getSupabaseConfig } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { submitSongRequestAction } from "@/app/m/[slug]/actions";

type PublicMusicianPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pedido?: string }>;
};

const requestMessages: Record<string, string> = {
  enviado: "Pedido enviado para a fila do músico.",
  duplicado: "Você já pediu essa música há pouco. Aguarde a vez dela.",
  limite: "Você chegou ao limite temporário de pedidos. Tente novamente daqui a alguns minutos.",
  configuracao: "Os pedidos ainda não estão liberados neste ambiente.",
  indisponivel: "Essa música não está disponível para pedido agora.",
};

export async function generateMetadata({ params }: PublicMusicianPageProps) {
  const { slug } = await params;
  if (!getSupabaseConfig() && slug === "banda-mare") {
    return { title: "Banda Maré — página de demonstração" };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { title: "Página do músico" };

  const { data: musician } = await supabase
    .from("musicians")
    .select("stage_name")
    .eq("slug", slug)
    .maybeSingle();

  return { title: musician ? `${musician.stage_name} — página do público` : "Músico não encontrado" };
}

export default async function PublicMusicianPage({ params, searchParams }: PublicMusicianPageProps) {
  const [{ slug }, { pedido }] = await Promise.all([params, searchParams]);
  let musician: { stage_name: string; city: string | null; bio: string | null };
  let hasActiveShow = false;
  let performanceId: string | null = null;
  let songs: { id: string; title: string; artist: string; price_cents: number }[] = [];
  const requestsReady = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    (process.env.REQUEST_TOKEN_SECRET?.length ?? 0) >= 32,
  );
  const mockPaymentsEnabled = process.env.NODE_ENV === "development";

  if (!getSupabaseConfig() && slug === "banda-mare") {
    musician = { stage_name: "Banda Maré", city: "Campinas, SP", bio: "Voz e violão · página de demonstração" };
    hasActiveShow = true;
  } else {
    const supabase = await createSupabaseServerClient();
    if (!supabase) notFound();

    const { data: musicianRecord } = await supabase
      .from("musicians")
      .select("id, stage_name, city, bio")
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

    if (performance) {
      const { data: repertoire } = await supabase
        .from("repertoire_items")
        .select("song_id, price_cents")
        .eq("musician_id", musicianRecord.id)
        .eq("is_enabled", true);

      const songIds = (repertoire ?? []).map((item) => item.song_id);
      if (songIds.length) {
        const { data: catalogSongs } = await supabase
          .from("catalog_songs")
          .select("id, title, artist")
          .in("id", songIds)
          .order("title", { ascending: true });
        const prices = new Map((repertoire ?? []).map((item) => [item.song_id, item.price_cents]));
        songs = (catalogSongs ?? []).map((song) => ({
          ...song,
          price_cents: prices.get(song.id) ?? 0,
        }));
      }
    }
  }

  const initials = musician.stage_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

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
        <section className="artist-hero">
          <div className="artist-avatar" aria-hidden="true">{initials}</div>
          <h1>{musician.stage_name}</h1>
          <p className="artist-subtitle">{musician.bio || "Músico ao vivo"}</p>
          {musician.city && <span className="artist-location"><MapPin size={14} /> {musician.city}</span>}
        </section>

        <section className="public-section">
          <div className="public-section-heading">
            <div>
              <h2>Peça uma música</h2>
              <p>{hasActiveShow ? "Escolha entre as músicas deste repertório." : "Os pedidos abrem quando a próxima apresentação começar."}</p>
            </div>
            <span className="public-free-pill">Grátis ou até R$ 5</span>
          </div>

          {pedido && requestMessages[pedido] && (
            <p className={`public-request-message ${pedido === "enviado" ? "success" : ""}`} role="status">
              {requestMessages[pedido]}
            </p>
          )}

          {!hasActiveShow || songs.length === 0 ? (
            <div className="public-empty">
              <Music2 size={23} />
              <h3>{!hasActiveShow ? "A apresentação ainda não começou" : "O repertório está sendo preparado"}</h3>
              <p>{!hasActiveShow
                ? "Volte quando o músico abrir a apresentação para ver o repertório disponível."
                : "As músicas aparecem aqui depois de aprovadas no catálogo central."}</p>
            </div>
          ) : (
            <div className="public-song-list">
              {songs.map((song) => (
                <div className="public-song-row" key={song.id}>
                  <span className="public-song-icon"><Music2 size={16} /></span>
                  <span className="public-song-copy"><strong>{song.title}</strong><span>{song.artist}</span></span>
                  {performanceId && requestsReady ? (
                    <form action={submitSongRequestAction}>
                      <input type="hidden" name="performance_id" value={performanceId} />
                      <input type="hidden" name="song_id" value={song.id} />
                      <input type="hidden" name="slug" value={slug} />
                      <button
                        className="button button-primary button-small public-request-button"
                        type="submit"
                        disabled={!requestsReady || (song.price_cents > 0 && !mockPaymentsEnabled)}
                      >
                        {song.price_cents === 0 ? "Pedir grátis" : `Pedir · ${(song.price_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
                      </button>
                    </form>
                  ) : <span className="public-song-note">Pedidos indisponíveis</span>}
                  {song.price_cents > 0 && !mockPaymentsEnabled && <span className="public-song-note">Cobrança indisponível</span>}
                </div>
              ))}
            </div>
          )}

          {hasActiveShow && songs.length > 0 && (
            <p className="public-request-hint">
              {mockPaymentsEnabled
                ? "Pedidos pagos só entram na fila após a confirmação do teste. Nenhum valor real será cobrado neste ambiente."
                : "Pedidos pagos só estarão disponíveis quando a cobrança real estiver configurada. Pedidos gratuitos continuam disponíveis."}
            </p>
          )}
        </section>

        <p className="public-footer">
          <ShieldCheck size={13} /> O público vê títulos. As cifras ficam no acesso autenticado do músico.
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
