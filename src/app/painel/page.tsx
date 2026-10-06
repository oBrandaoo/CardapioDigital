import Link from "next/link";
import { redirect } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowUpRight,
  CircleHelp,
  ClipboardList,
  ExternalLink,
  Music2,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "@/components/brand";
import {
  closePerformanceAction,
  createPerformanceAction,
  setPublicProfileAction,
  updateMusicianProfileAction,
  updateRequestStatusAction,
} from "@/app/painel/actions";
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
  perfil_salvo: "Dados do perfil atualizados.",
  perfil_campos: "Confira o nome artístico, a cidade e a descrição.",
  endereco_invalido: "Use um endereço com letras minúsculas, números e hífens.",
  endereco_em_uso: "Esse endereço público já está sendo usado por outro músico.",
  pedido: "Não foi possível atualizar esse pedido.",
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
        .select("id, requester_name, price_cents, payment_status, status, created_at, catalog_songs(title, artist)")
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
            <Link className="button button-outline button-small" href="/demo">Ver prévia</Link>
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
                  <button className="button button-outline button-small" type="submit">Encerrar apresentação</button>
                </form>
              )}
            </article>

            <article className="panel">
              <div className="panel-heading">
                <div><h2>Perfil do palco</h2><p>Essas informações aparecem na sua página pública.</p></div>
              </div>
              <form action={updateMusicianProfileAction} className="profile-edit-form">
                <div className="profile-edit-grid">
                  <label className="profile-edit-field">
                    <span>Nome artístico</span>
                    <input
                      name="stage_name"
                      type="text"
                      minLength={2}
                      maxLength={80}
                      defaultValue={musician.stage_name}
                      autoComplete="nickname"
                      required
                    />
                  </label>
                  <label className="profile-edit-field">
                    <span>Endereço público</span>
                    <span className="profile-slug-control">
                      <span className="profile-slug-prefix">/m/</span>
                      <input
                        name="slug"
                        type="text"
                        minLength={3}
                        maxLength={60}
                        pattern="[a-z0-9]+(-[a-z0-9]+)*"
                        autoCapitalize="none"
                        spellCheck={false}
                        defaultValue={musician.slug}
                        aria-describedby="profile-slug-help"
                        required
                      />
                    </span>
                    <small id="profile-slug-help">Use letras minúsculas sem acento, números e hífens.</small>
                  </label>
                  <label className="profile-edit-field">
                    <span>Cidade</span>
                    <input name="city" type="text" maxLength={100} defaultValue={musician.city ?? ""} />
                  </label>
                  <label className="profile-edit-field profile-edit-field-wide">
                    <span>Descrição</span>
                    <textarea name="bio" maxLength={500} rows={3} defaultValue={musician.bio ?? ""} />
                  </label>
                </div>
                <div className="profile-edit-actions">
                  <button className="button button-primary button-small" type="submit">Salvar perfil</button>
                </div>
              </form>
            </article>

            <article className="panel">
              <div className="panel-heading">
                <div><h2>Fila de pedidos</h2><p>Pedidos pagos aparecem após a confirmação do pagamento.</p></div>
                <span className="preview-pill">Grátis e pagos</span>
              </div>
              {pendingRequests.length === 0 ? (
                <div className="empty-queue">
                  <span className="empty-queue-art"><ClipboardList size={25} /></span>
                  <h3>Nenhum pedido na fila</h3>
                  <p>Compartilhe o QR code depois de publicar o perfil e adicionar músicas aprovadas ao repertório.</p>
                </div>
              ) : (
                <table className="dashboard-table">
                  <thead><tr><th>Música</th><th>Pedido por</th><th>Ações</th></tr></thead>
                  <tbody>
                    {pendingRequests.map((request) => {
                      const song = Array.isArray(request.catalog_songs) ? request.catalog_songs[0] : request.catalog_songs;
                      return (
                        <tr key={request.id}>
                          <td>
                            <strong>{song?.title ?? "Música do catálogo"}</strong><br />
                            <span>{song?.artist ?? ""}</span><br />
                            <span className="request-payment-label">
                              {request.payment_status === "mock_paid" ? "Pagamento simulado" : request.payment_status === "paid" ? "Pago" : "Gratuito"}
                              {request.price_cents > 0 && ` · ${(request.price_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
                            </span>
                          </td>
                          <td>{request.requester_name || "Público"}</td>
                          <td>
                            <div className="request-row-actions">
                              <form action={updateRequestStatusAction}>
                                <input type="hidden" name="request_id" value={request.id} />
                                <input type="hidden" name="status" value="played" />
                                <button className="button button-primary button-small" type="submit">Tocada</button>
                              </form>
                              {request.payment_status === "not_required" && (
                                <form action={updateRequestStatusAction}>
                                  <input type="hidden" name="request_id" value={request.id} />
                                  <input type="hidden" name="status" value="cancelled" />
                                  <button className="button button-outline button-small" type="submit">Cancelar</button>
                                </form>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </article>

            <article className="panel">
              <div className="panel-heading">
                <div><h2>Seu repertório</h2><p>As músicas vêm do catálogo central revisado.</p></div>
                <span className="status-live"><Music2 size={13} /> {enabledSongs.length} selecionadas</span>
              </div>
              {enabledSongs.length === 0 && (
                <div className="catalog-admin-callout">
                  <ShieldCheck size={17} />
                  <span>O catálogo central ainda não tem cifras liberadas. Só músicas com origem e autorização documentadas serão publicadas.</span>
                </div>
              )}
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
                  <div className="qr-frame"><QRCodeSVG value={publicUrl} size={140} level="M" includeMargin /></div>
                  <span className="qr-url">{publicUrl.replace(/^https?:\/\//, "")}</span>
                  <Link className="button button-primary button-small" href={`/m/${musician.slug}`} target="_blank" rel="noreferrer">
                    Ver página pública <ExternalLink size={14} />
                  </Link>
                  <form action={setPublicProfileAction} className="profile-toggle-form">
                    <input type="hidden" name="is_public" value="false" />
                    <button className="button button-outline button-small" type="submit">Ocultar perfil</button>
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
              <span>O público vê título e artista. A cifra fica no acesso autenticado do músico.</span>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
