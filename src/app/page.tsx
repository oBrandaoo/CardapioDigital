import Link from "next/link";
import {
  ArrowUpRight,
  ClipboardList,
  Guitar,
  QrCode,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Brand } from "@/components/brand";

const steps = [
  {
    icon: Guitar,
    title: "Monte seu repertório",
    description: "Escolha músicas do catálogo revisado para seu repertório.",
  },
  {
    icon: QrCode,
    title: "Compartilhe o QR code",
    description: "O público abre sua página direto no celular, sem criar uma conta.",
  },
  {
    icon: ClipboardList,
    title: "Acompanhe a fila",
    description: "Veja os pedidos em um só lugar enquanto você toca.",
  },
];

const areas = [
  {
    icon: QrCode,
    name: "Público",
    description: "Abre a página do músico pelo QR code, escolhe uma música e faz o pedido sem conta.",
    href: "/demo/publico",
    action: "Ver prévia do público",
  },
  {
    icon: Guitar,
    name: "Músico",
    description: "Entra com a conta criada pela equipe para organizar repertório, apresentação, QR code e fila.",
    href: "/demo",
    action: "Ver prévia do músico",
  },
  {
    icon: ShieldCheck,
    name: "Equipe administrativa",
    description: "Entra com perfil de administrador para cuidar de contas, licenças e catálogo central.",
    href: "/entrar",
    action: "Entrar como equipe",
  },
];

export default function Home() {
  return (
    <main>
      <header className="site-header">
        <Link href="/" aria-label="Cardápio Musical, início">
          <Brand />
        </Link>
        <nav className="header-links" aria-label="Navegação principal">
          <a href="#como-funciona">Como funciona</a>
          <a href="#acessos">Áreas</a>
          <Link className="button button-primary button-small" href="/entrar">Entrar</Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="hero-inner">
          <div className="hero-copy">
            <span className="hero-kicker"><span className="live-dot" /> Para quem faz o show acontecer</span>
            <h1 className="hero-title">Seu repertório.<br />A próxima música.</h1>
            <p className="hero-description">
              Um cardápio simples para o público pedir músicas e para você manter
              a fila sob controle durante o show.
            </p>
            <div className="hero-actions">
              <Link className="button button-amber" href="/entrar">
                Entrar na plataforma <ArrowUpRight size={17} />
              </Link>
              <Link className="button button-outline" href="/demo/publico">
                Ver prévia do público
              </Link>
            </div>
            <p className="hero-note">O público usa o QR code. Músicos e equipe entram com contas criadas internamente.</p>
          </div>

          <div className="show-preview" aria-label="Prévia da fila de pedidos">
            <div className="preview-topline">
              <span>Visão do músico</span>
              <span className="preview-live"><span className="live-dot" /> Apresentação aberta</span>
            </div>
            <h2 className="preview-title">Noite de voz e violão</h2>
            <p className="preview-subtitle">Sua fila de pedidos, atualizada no mesmo lugar.</p>
            <div className="preview-divider" />
            <div className="preview-empty">
              <span className="preview-empty-icon"><ClipboardList size={21} /></span>
              <strong>Fila pronta para começar</strong>
              <span>Os pedidos aparecem aqui quando o repertório estiver publicado.</span>
            </div>
            <div className="preview-foot">
              <span>Catálogo revisado pela plataforma</span>
              <span className="preview-pill">Sem áudio</span>
            </div>
          </div>
        </div>
      </section>

      <section className="access-section" id="acessos">
        <div className="section-wrap">
          <h2 className="section-heading">Quem acessa cada área</h2>
          <p className="section-intro">Cada pessoa encontra as funções necessárias para o seu papel no show.</p>
          <div className="access-map">
            {areas.map(({ icon: Icon, name, description, href, action }) => (
              <article className="access-row" key={name}>
                <span className="access-icon"><Icon size={20} /></span>
                <div className="access-copy"><h3>{name}</h3><p>{description}</p></div>
                <Link className="access-link" href={href}>{action} <ArrowUpRight size={16} /></Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="how-section" id="como-funciona">
        <div className="section-wrap">
          <h2 className="section-heading">Menos interrupção.<br />Mais música ao vivo.</h2>
          <p className="section-intro">
            O público escolhe entre músicas liberadas no seu repertório. Você
            acompanha tudo pelo painel e decide o andamento do show.
          </p>
          <div className="steps-grid">
            {steps.map(({ icon: Icon, title, description }) => (
              <article className="step-item" key={title}>
                <span className="step-icon"><Icon size={21} /></span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
          <div className="catalog-note">
            <ShieldCheck size={18} />
            <span>
              Cifras só ficam disponíveis depois da revisão e confirmação dos
              direitos de uso. O público acessa as músicas pelo QR code, sem login.
            </span>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <Brand compact />
        <span><Sparkles size={13} /> Um espaço para a música acontecer com mais leveza.</span>
      </footer>
    </main>
  );
}
