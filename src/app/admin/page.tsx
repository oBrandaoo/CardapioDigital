import Link from "next/link";
import { ArrowRight, BookOpen, ShieldCheck, Users } from "lucide-react";
import { Brand } from "@/components/brand";
import { signOutAction } from "@/app/entrar/actions";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function AdminHomePage() {
  await requireAdmin();

  return (
    <main className="dashboard-page">
      <div className="dashboard-wrap">
        <header className="dashboard-topbar">
          <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
          <form action={signOutAction}><button className="button button-outline button-small" type="submit">Sair</button></form>
        </header>

        <div className="dashboard-title-row">
          <div>
            <h1>Administração</h1>
            <p>Gerencie o acesso dos músicos e o catálogo central da plataforma.</p>
          </div>
          <span className="status-live"><ShieldCheck size={13} /> Equipe da plataforma</span>
        </div>

        <section className="admin-home-grid" aria-label="Áreas administrativas">
          <Link className="panel admin-home-card" href="/admin/licencas">
            <span className="admin-home-icon"><Users size={22} /></span>
            <h2>Músicos e licenças</h2>
            <p>Convide músicos, ative licenças anuais e acompanhe os períodos de acesso.</p>
            <span className="admin-home-action">Abrir gestão de músicos <ArrowRight size={15} /></span>
          </Link>
          <Link className="panel admin-home-card" href="/admin/catalogo">
            <span className="admin-home-icon"><BookOpen size={22} /></span>
            <h2>Catálogo central</h2>
            <p>Cadastre músicas e cifras com a autorização de uso documentada.</p>
            <span className="admin-home-action">Abrir catálogo <ArrowRight size={15} /></span>
          </Link>
        </section>

        <p className="admin-home-note">O músico usa o próprio painel para repertório, apresentações, QR code e pedidos.</p>
      </div>
    </main>
  );
}
