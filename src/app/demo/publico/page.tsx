import Link from "next/link";
import { MapPin, Music2, QrCode } from "lucide-react";
import { Brand } from "@/components/brand";

const demoSongs = [
  { title: "Demo grátis — Caminho em Dó", artist: "Exercícios do Cardápio Musical", price: "Grátis" },
  { title: "Demo paga — Ritmo em Ré", artist: "Exercícios do Cardápio Musical", price: "R$ 2,50" },
  { title: "Demo de R$ 5 — Ensaio em Sol", artist: "Exercícios do Cardápio Musical", price: "R$ 5,00" },
];

export default function PublicDemoPage() {
  return (
    <main className="public-page">
      <header className="public-header">
        <Link href="/" aria-label="Cardápio Musical, início"><Brand compact /></Link>
        <span className="demo-label"><QrCode size={14} /> Prévia do público</span>
      </header>

      <div className="public-content">
        <section className="artist-hero">
          <div className="artist-avatar" aria-hidden="true">BM</div>
          <h1>Banda Maré</h1>
          <p className="artist-subtitle">Perfil fictício para visualizar a página aberta pelo QR code.</p>
          <span className="artist-location"><MapPin size={14} /> Campinas, SP</span>
        </section>

        <section className="public-section">
          <div className="public-section-heading">
            <div><h2>Peça uma música</h2><p>Em um show real, o público escolhe uma música do repertório do artista.</p></div>
            <span className="public-free-pill">Grátis ou até R$ 5</span>
          </div>
          <div className="public-song-list">
            {demoSongs.map((song) => (
              <div className="public-song-row" key={song.title}>
                <span className="public-song-icon"><Music2 size={16} /></span>
                <span className="public-song-copy"><strong>{song.title}</strong><span>{song.artist}</span></span>
                <button className="button button-primary button-small public-request-button" type="button" disabled>
                  {song.price === "Grátis" ? "Pedir grátis" : `Pedir · ${song.price}`}
                </button>
              </div>
            ))}
          </div>
          <p className="public-request-hint">Esta prévia usa músicas sintéticas e não envia pedidos nem recebe pagamentos.</p>
        </section>

        <div className="public-demo-footer">
          <Link className="button button-outline button-small" href="/demo">Ver prévia do painel do músico</Link>
          <Link className="text-link" href="/">Voltar ao início</Link>
        </div>
      </div>
    </main>
  );
}
