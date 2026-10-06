import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { signInAction } from "@/app/entrar/actions";
import { getSupabaseConfig } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LoginPageProps = {
  searchParams: Promise<{ estado?: string }>;
};

const messages: Record<string, string> = {
  configuracao: "Conecte este projeto ao Supabase antes de entrar.",
  campos: "Informe um e-mail e uma senha válidos.",
  credenciais: "Não foi possível entrar com esses dados. Confira o e-mail e a senha.",
  convite: "Não foi possível validar o convite. Solicite à equipe um novo link de acesso.",
  recuperacao: "Não foi possível validar o link de recuperação. Solicite um novo e-mail.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { estado } = await searchParams;
  const configured = Boolean(getSupabaseConfig());
  const supabase = configured ? await createSupabaseServerClient() : null;
  const { data: authData } = supabase ? await supabase.auth.getClaims() : { data: null };
  if (typeof authData?.claims?.sub === "string") {
    redirect(authData.claims.app_metadata?.role === "admin" ? "/admin" : "/painel");
  }

  return (
    <main className="auth-page">
      <header className="public-header auth-header">
        <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
        <Link className="text-link" href="/">Voltar ao início</Link>
      </header>

      <div className="auth-content">
        <div className="auth-intro">
          <span className="artist-avatar auth-avatar"><KeyRound size={24} /></span>
          <h1>Entre no Cardápio Musical.</h1>
          <p>Músicos e equipe usam o mesmo acesso. Cada conta abre sua área após o login.</p>
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
            <h2>Acesse sua conta</h2>
            <p>Use o e-mail e a senha da sua conta.</p>
          </div>
          <form action={signInAction} className="auth-form">
            <label htmlFor="login-email">E-mail</label>
            <input id="login-email" name="email" type="email" autoComplete="email" required disabled={!configured} />
            <label htmlFor="login-password">Senha</label>
            <input id="login-password" name="password" type="password" autoComplete="current-password" required disabled={!configured} />
            <button className="button button-primary" type="submit" disabled={!configured}>Entrar</button>
          </form>
          <Link className="text-link" href="/recuperar-senha">Esqueci minha senha</Link>
        </section>

        <p className="auth-footnote">Músicos gerenciam shows e repertório. A equipe administra contas, licenças e catálogo. O cadastro público está desativado.</p>
      </div>
    </main>
  );
}
