import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  CircleHelp,
  ClipboardList,
  ExternalLink,
  Music2,
  QrCode,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { Brand } from "@/components/brand";
import {
  closePerformanceAction,
  createPerformanceAction,
  setPublicProfileAction,
  updateRequestStatusAction,
} from "@/app/painel/actions";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { QrShare } from "@/components/qr-share";
import { QueueLiveRefresh } from "@/components/queue-live-refresh";
import { getSiteUrl, getSupabaseConfig } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isLicenseActive } from "@/lib/auth/is-license-active";
import { signOutAction } from "@/app/entrar/actions";

type DashboardPageProps = {
  searchParams: Promise<{ estado?: string }>;
};

const statusMessages: Record<string, string> = {
  titulo: "Dê um nome de 2 a 120 caracteres para a apresentação.",
  apresentacao: "Não foi possível atualizar a apresentação. Confira se já existe outra aberta.",
  aberta: "Apresentação aberta.",
  fechada: "Apresentação encerrada.",
  perfil: "Não foi possível atualizar a visibilidade do perfil.",
  publicado: "Seu perfil público está no ar.",
  oculto: "Seu perfil foi ocultado.",
  pedido: "Não foi possível atualizar esse pedido.",
  licenca: "Sua licença não está ativa. Fale com a equipe da plataforma.",
  tocada: "Música marcada como tocada.",
  cancelada: "Pedido cancelado.",
};

function SetupState() {
  return (
    <main className="account-state">
      <span className="account-state-icon"><ShieldCheck size={23} /></span>
      <h1>Conecte o banco de dados</h1>
      <p>Configure o projeto Supabase e aplique a migração inicial para liberar o painel real. Enquanto isso, você pode explorar a prévia do produto.</p>
      <div className="license-state-note">Veja o passo a passo no README.md e copie as chaves públicas para <code>.env.local</code>.</div>
      <Link className="button button-primary" href="/demo">Abrir prévia <ArrowUpRight size={16} /></Link>
    </main>
  );
}

function PendingLicenseState() {
  return (
    <main className="account-state license-state">
      <Brand />
      <span className="account-state-icon"><ShieldCheck size={23} /></span>
      <h1>Aguardando liberação da licença</h1>
      <p>Seu cadastro foi criado. A equipe ativa o período anual pelo controle interno antes de liberar o painel e a página pública.</p>
      <div className="license-state-note">A licença é controlada separadamente dos pedidos de música. Ela não é cobrada por este painel.</div>
      <form action={signOutAction}><button className="button button-outline" type="submit">Sair da conta</button></form>
    </main>
  );
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { estado } = await searchParams;
  if (!getSupabaseConfig()) return <SetupState />;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return <SetupState />;

  const { data: authData } = await supabase.auth.getClaims();
  const claims = authData?.claims;
  const musicianId = claims?.sub;
  if (typeof musicianId !== "string") redirect("/entrar");
  if (claims?.app_metadata?.role === "admin") redirect("/admin");

  const [{ data: musician }, { data: license }] = await Promise.all([
    supabase
      .from("musicians")
      .select("id, slug, stage_name, bio, city, profile_is_public")
      .eq("id", musicianId)
      .maybeSingle(),
    supabase
      .from("musician_licenses")
      .select("status, starts_at, ends_at")
      .eq("musician_id", musicianId)
      .maybeSingle(),
  ]);

  if (!musician) {
    return (
      <main className="account-state">
        <span className="account-state-icon"><CircleHelp size={23} /></span>
        <h1>Perfil ainda não criado</h1>
        <p>Aplique a migração do banco e entre novamente para criar o perfil de músico automaticamente.</p>
      </main>
    );
  }

  if (!isLicenseActive(license)) return <PendingLicenseState />;

  const [{ data: performance }, { data: repertoire }] = await Promise.all([
    supabase
      .from("performances")
      .select("id, title, starts_at")
      .eq("musician_id", musicianId)
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("repertoire_items")
      .select("id, song_id, price_cents")
      .eq("musician_id", musicianId)
      .eq("is_enabled", true),
  ]);

  const { data: requests } = performance
    ? await supabase
        .from("music_requests")
        .select("id, song_id, requester_name, price_cents, payment_status, status, created_at, catalog_songs(title, artist)")
        .eq("performance_id", performance.id)
        .eq("status", "queued")
        .order("created_at", { ascending: true })
    : { data: [] };

  const publicUrl = `${getSiteUrl()}/m/${musician.slug}`;
  const licenseEndDate = license?.ends_at ? new Date(license.ends_at) : null;
  const pendingRequests = requests ?? [];
  const enabledSongs = repertoire ?? [];

  return (
    <main className="dashboard-page">
      <div className="dashboard-wrap">
        <header className="dashboard-topbar">
          <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
          <div className="dashboard-header-actions">
            <Link className="button button-outline button-small" href="/painel/repertorio"><Music2 size={15} /> Repertório</Link>
            <Link className="button button-outline button-small" href="/painel/apresentacoes"><ClipboardList size={15} /> Histórico</Link>
            <Link className="button button-outline button-small" href="/painel/perfil"><UserRound size={15} /> Perfil</Link>
            <form action={signOutAction}><button className="button button-outline button-small" type="submit">Sair</button></form>
          </div>
        </header>

        <div className="dashboard-title-row">
          <div>
            <h1>Painel do músico</h1>
            <p>Olá, {musician.stage_name}. Organize seu show, repertório e pedidos.</p>
          </div>
          <span className="status-live"><ShieldCheck size={13} /> Licença ativa até {licenseEndDate?.toLocaleDateString("pt-BR")}</span>
        </div>

        {estado && statusMessages[estado] && <p className="dashboard-flash" role="status">{statusMessages[estado]}</p>}

        {performance && <QueueLiveRefresh performanceId={performance.id} />}

        <div className="dashboard-grid">
          <section className="dashboard-main" aria-label="Painel do músico">
            <article className="panel">
              <div className="panel-heading">
                <div><h2>Apresentação</h2><p>Controle o acesso do público à sua fila.</p></div>
                {performance && <span className="status-live"><span className="live-dot" /> Aberta</span>}
              </div>
              {performance ? (
                <div className="show-card">
                  <div>
                    <strong>{performance.title}</strong>
                    <span>Aberta em {new Date(performance.starts_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                  </div>
                  <div className="queue-counter"><strong>{pendingRequests.length}</strong><span>na fila</span></div>
                </div>
              ) : (
                <form action={createPerformanceAction} className="dashboard-form">
                  <input name="title" type="text" minLength={2} maxLength={120} placeholder="Ex.: Voz e violão de sexta" aria-label="Nome da apresentação" required />
                  <button className="button button-primary button-small" type="submit">Abrir apresentação</button>
                </form>
              )}
              {performance && (
                <form action={closePerformanceAction} className="profile-toggle-form">
                  <input type="hidden" name="performance_id" value={performance.id} />
                  <input type="hidden" name="slug" value={musician.slug} />
                  <ConfirmSubmitButton
                    className="button button-outline button-small"
                    message="Encerrar a apresentação? O público deixa de conseguir fazer pedidos."
                  >Encerrar apresentação</ConfirmSubmitButton>
                </form>
              )}
            </article>

            <article className="panel">
              <div className="panel-heading">
                <div><h2>Fila de pedidos</h2><p>{performance ? "Atualiza sozinha quando chega um pedido." : "Abra uma apresentação para receber pedidos."}</p></div>
                {pendingRequests.length > 0 && <span className="preview-pill">{pendingRequests.length} na fila</span>}
              </div>
              {pendingRequests.length === 0 ? (
                <div className="empty-queue">
                  <span className="empty-queue-art"><ClipboardList size={25} /></span>
                  <h3>Nenhum pedido na fila</h3>
                  <p>{enabledSongs.length === 0
                    ? "Monte seu repertório e publique o perfil para o público conseguir pedir."
                    : musician.profile_is_public
                      ? "Compartilhe o QR code com o público para receber pedidos."
                      : "Publique o perfil para liberar o QR code."}</p>
                </div>
              ) : (
                <ol className="queue-list">
                  {pendingRequests.map((request, index) => {
                    const song = Array.isArray(request.catalog_songs) ? request.catalog_songs[0] : request.catalog_songs;
                    const paymentLabel = request.payment_status === "mock_paid" ? "Pagamento simulado" : request.payment_status === "paid" ? "Pago" : "Gratuito";
                    return (
                      <li className="queue-item" key={request.id}>
                        <span className="queue-position" aria-label={`Posição ${index + 1}`}>{index + 1}</span>
                        <div className="queue-item-copy">
                          <strong>{song?.title ?? "Música do catálogo"}</strong>
                          {song?.artist && <span>{song.artist}</span>}
                          <span className="queue-item-meta">
                            {request.requester_name || "Público"} · {new Date(request.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {paymentLabel}
                            {request.price_cents > 0 && ` · ${(request.price_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
                          </span>
                        </div>
                        <div className="queue-item-actions">
                          <form action={updateRequestStatusAction}>
                            <input type="hidden" name="request_id" value={request.id} />
                            <input type="hidden" name="status" value="played" />
                            <button className="button button-primary button-small" type="submit"><Check size={14} /> Tocada</button>
                          </form>
                          {song && <Link className="button button-outline button-small" href={`/painel/repertorio/${request.song_id}`} prefetch={false}><BookOpen size={14} /> Ver</Link>}
                          {request.payment_status === "not_required" && (
                            <form action={updateRequestStatusAction}>
                              <input type="hidden" name="request_id" value={request.id} />
                              <input type="hidden" name="status" value="cancelled" />
                              <ConfirmSubmitButton className="button button-outline button-small" message="Cancelar este pedido?">Cancelar</ConfirmSubmitButton>
                            </form>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </article>

            <article className="panel">
              <div className="panel-heading">
                <div><h2>Seu repertório</h2><p>As músicas vêm do catálogo central revisado.</p></div>
                <span className="status-live"><Music2 size={13} /> {enabledSongs.length} {enabledSongs.length === 1 ? "música" : "músicas"}</span>
              </div>
              {enabledSongs.length === 0 && (
                <div className="catalog-admin-callout">
                  <ShieldCheck size={17} />
                  <span>Você ainda não escolheu músicas. O público só consegue pedir o que estiver no seu repertório.</span>
                </div>
              )}
              <Link className="button button-outline button-small" href={enabledSongs.length ? "/painel/repertorio?aba=meu" : "/painel/repertorio"}>
                {enabledSongs.length ? "Gerenciar repertório" : "Montar repertório"} <ArrowUpRight size={14} />
              </Link>
            </article>
          </section>

          <aside className="dashboard-aside" aria-label="Acesso público e licença">
            <article className="panel qr-panel">
              <div className="panel-heading">
                <div><h2>Seu QR code</h2><p>Leva ao seu perfil público.</p></div>
                <QrCode size={18} color="#31786c" />
              </div>
              {musician.profile_is_public ? (
                <>
                  <QrShare url={publicUrl} stageName={musician.stage_name} slug={musician.slug} />
                  <Link className="button button-primary button-small" href={`/m/${musician.slug}`} target="_blank" rel="noreferrer">
                    Ver página pública <ExternalLink size={14} />
                  </Link>
                  <form action={setPublicProfileAction} className="profile-toggle-form">
                    <input type="hidden" name="is_public" value="false" />
                    <ConfirmSubmitButton
                      className="button button-outline button-small"
                      message="Ocultar o perfil? O QR code deixa de abrir sua página até você publicar de novo."
                    >Ocultar perfil</ConfirmSubmitButton>
                  </form>
                </>
              ) : (
                <>
                  <div className="public-empty">
                    <QrCode size={23} />
                    <h3>Seu perfil ainda está privado</h3>
                    <p>Publique-o quando estiver pronto para compartilhar o QR code.</p>
                  </div>
                  <form action={setPublicProfileAction} className="profile-toggle-form">
                    <input type="hidden" name="is_public" value="true" />
                    <button className="button button-primary button-small" type="submit">Publicar perfil</button>
                  </form>
                </>
              )}
            </article>

            <article className="license-panel">
              <span>Licença anual · controle interno</span>
              <strong>Ativa</strong>
              <p>Período até {licenseEndDate?.toLocaleDateString("pt-BR")}.</p>
            </article>

            <div className="catalog-note" style={{ marginTop: 0 }}>
              <ShieldCheck size={17} />
              <span>O público vê título e artista. Quando existir, a cifra fica no acesso autenticado do músico.</span>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
