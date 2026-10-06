import Link from "next/link";

export default function NotFound() {
  return (
    <main className="public-page" style={{ display: "grid", placeItems: "center" }}>
      <section className="public-section" style={{ width: "min(460px, 100%)", textAlign: "center" }}>
        <h1 style={{ marginTop: 0 }}>Essa página não está disponível</h1>
        <p style={{ color: "var(--ink-soft)" }}>Confira o endereço da página ou volte ao início.</p>
        <Link className="button button-primary" href="/">Voltar ao início</Link>
      </section>
    </main>
  );
}
