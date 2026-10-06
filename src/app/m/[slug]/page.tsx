import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, Music2, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { firstSearchParam } from "@/lib/catalog/pagination";
import { getSupabaseConfig } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";

type PublicMusicianPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pedido?: string | string[] }>;
};

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
    return { title: "Banda Maré — página de demonstração" };
  }

  const supabase = createSupabasePublicClient();
  if (!supabase) return { title: "Página do músico" };

  const { data: musician } = await supabase
    .from("musicians")
    .select("stage_name")
    .eq("slug", slug)
    .maybeSingle();

  return { title: musician ? `${musician.stage_name} — página do público` : "Músico não encontrado" };
}

export default async function PublicMusicianPage({ params, searchParams }: PublicMusicianPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const pedido = firstSearchParam(query.pedido);
  let musician: { stage_name: string; city: string | null; bio: string | null };
  let hasActiveShow = false;

  if (!getSupabaseConfig() && slug === "banda-mare") {
    musician = { stage_name: "Banda Maré", city: "Campinas, SP", bio: "Voz e violão · página de demonstração" };
    hasActiveShow = true;
  } else {
    const supabase = createSupabasePublicClient();
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
              <p>{hasActiveShow
                ? "Pesquise no repertório do cantor ou explore o catálogo por gênero."
                : "Explore o catálogo. Os pedidos abrem quando a apresentação começar."}</p>
            </div>
            <span className="public-free-pill">Grátis ou até R$ 5</span>
          </div>

          {pedido && requestMessages[pedido] && (
            <p className={`public-request-message ${pedido === "enviado" ? "success" : ""}`} role="status">
              {requestMessages[pedido]}
            </p>
          )}

          <Link className="button button-primary public-search-open" href={`/m/${slug}/musicas`}>
            <Music2 size={18} /> {hasActiveShow ? "Buscar música para pedir" : "Explorar músicas"}
          </Link>
          <p className="public-request-hint">Somente músicas do repertório do cantor podem ser pedidas.</p>
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
