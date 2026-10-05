import Link from "next/link";
import { Music2, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { signInAction } from "@/app/entrar/actions";
import { getSupabaseConfig } from "@/lib/supabase/env";

type LoginPageProps = {
  searchParams: Promise<{ estado?: string }>;
};

const messages: Record<string, string> = {
  configuracao: "Conecte este projeto ao Supabase antes de entrar.",
  campos: "Informe um e-mail e uma senha válidos.",
  credenciais: "Não foi possível entrar com esses dados. Confira o e-mail e a senha.",
  convite: "Não foi possível validar o convite. Solicite à equipe um novo link de acesso.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { estado } = await searchParams;
  const configured = Boolean(getSupabaseConfig());

  return (
    <main className="auth-page">
      <header className="public-header auth-header">
        <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
        <Link className="text-link" href="/">Voltar ao início</Link>
      </header>

      <div className="auth-content">
        <div className="auth-intro">
          <span className="artist-avatar auth-avatar"><Music2 size={24} /></span>
          <h1>Entre no ritmo do seu show.</h1>
          <p>Acesse seu painel para organizar o repertório e compartilhar o QR code com o público.</p>
        </div>

        {!configured && (
          <div className="auth-alert" role="status">
            <ShieldCheck size={18} />
            <span>Autenticação ainda não conectada. Configure as chaves do Supabase no arquivo <code>.env.local</code>.</span>
          </div>
        )}

        {estado && messages[estado] && (
          <div className={`auth-alert ${estado === "confirmar" ? "auth-alert-success" : ""}`} role="status">
            <ShieldCheck size={18} />
            <span>{messages[estado]}</span>
          </div>
        )}

        <section className="auth-card">
          <div className="auth-card-heading">
            <h2>Acesso do músico</h2>
            <p>Use as credenciais fornecidas pela equipe da plataforma.</p>
          </div>
          <form action={signInAction} className="auth-form">
            <label htmlFor="login-email">E-mail</label>
            <input id="login-email" name="email" type="email" autoComplete="email" required disabled={!configured} />
            <label htmlFor="login-password">Senha</label>
            <input id="login-password" name="password" type="password" autoComplete="current-password" required disabled={!configured} />
            <button className="button button-primary" type="submit" disabled={!configured}>Entrar</button>
          </form>
        </section>

        <p className="auth-footnote">Contas de músicos e liberação de acesso são gerenciadas internamente pela equipe.</p>
      </div>
    </main>
  );
}
