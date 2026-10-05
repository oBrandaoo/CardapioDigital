import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowLeft,
  CircleHelp,
  ClipboardList,
  ExternalLink,
  Music2,
  QrCode,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "@/components/brand";

export default function DashboardDemo() {
  const profileUrl = "http://localhost:3000/m/banda-mare";

  return (
    <main className="dashboard-page">
      <div className="dashboard-wrap">
        <header className="dashboard-topbar">
          <Link href="/" aria-label="Voltar ao início"><Brand /></Link>
          <span className="demo-label"><CircleHelp size={14} /> Prévia do produto · sem dados reais</span>
        </header>

        <div className="dashboard-title-row">
          <div>
            <h1>Boa noite, músico.</h1>
            <p>Seu palco e seu repertório, reunidos em um só lugar.</p>
          </div>
          <Link className="button button-outline button-small" href="/m/banda-mare">
            Abrir página pública <ExternalLink size={15} />
          </Link>
        </div>

        <div className="dashboard-grid">
          <section className="dashboard-main" aria-label="Painel do músico">
            <article className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Apresentação</h2>
                  <p>Controle o acesso do público à sua fila.</p>
                </div>
                <span className="status-live"><span className="live-dot" /> Aberta</span>
              </div>
              <div className="show-card">
                <div>
                  <strong>Noite de voz e violão</strong>
                  <span>Perfil de demonstração · Campinas, SP</span>
                </div>
                <div className="queue-counter"><strong>0</strong><span>na fila</span></div>
              </div>
            </article>

            <article className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Fila de pedidos</h2>
                  <p>Os pedidos confirmados aparecem nesta lista.</p>
                </div>
                <span className="preview-pill">Pedidos gratuitos</span>
              </div>
              <div className="empty-queue">
                <span className="empty-queue-art"><ClipboardList size={25} /></span>
                <h3>Nenhum pedido ainda</h3>
                <p>Compartilhe seu QR code. Quando houver músicas aprovadas no repertório, o público poderá escolher uma para pedir.</p>
              </div>
            </article>

            <article className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Seu repertório</h2>
                  <p>As músicas vêm do catálogo central revisado.</p>
                </div>
                <span className="status-live"><Music2 size={13} /> 0 liberadas</span>
              </div>
              <div className="catalog-admin-callout">
                <ShieldCheck size={17} />
                <span>O catálogo está sendo preparado. Só cifras com origem e autorização de uso confirmadas serão publicadas.</span>
              </div>
            </article>
          </section>

          <aside className="dashboard-aside" aria-label="Acesso e licença">
            <article className="panel qr-panel">
              <div className="panel-heading">
                <div>
                  <h2>Seu QR code</h2>
                  <p>Pronto para compartilhar.</p>
                </div>
                <QrCode size={18} color="#31786c" />
              </div>
              <div className="qr-frame">
                <QRCodeSVG value={profileUrl} size={140} level="M" includeMargin />
              </div>
              <span className="qr-url">/m/banda-mare</span>
              <Link className="button button-primary button-small" href="/m/banda-mare">
                Ver como público <ExternalLink size={14} />
              </Link>
            </article>

            <article className="license-panel">
              <span>Licença anual</span>
              <strong>Controle interno</strong>
              <p>O período da licença será acompanhado pela plataforma.</p>
            </article>

            <div className="catalog-note" style={{ marginTop: 0 }}>
              <Radio size={17} />
              <span>Sem reprodução de áudio. Apenas conteúdo musical autorizado.</span>
            </div>
          </aside>
        </div>
        <p className="dashboard-bottom">Esta prévia usa conteúdo fictício e não envia pedidos nem pagamentos.</p>
      </div>
    </main>
  );
}
