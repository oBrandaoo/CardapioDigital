import Link from "next/link";
import { Music2, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { signInAction, signUpAction } from "@/app/entrar/actions";
import { getSupabaseConfig } from "@/lib/supabase/env";

type LoginPageProps = {
  searchParams: Promise<{ estado?: string }>;
};

const messages: Record<string, string> = {
  configuracao: "Conecte este projeto ao Supabase antes de criar uma conta.",
  campos: "Confira o nome, o e-mail e a senha. A senha precisa ter pelo menos 8 caracteres.",
  credenciais: "Não foi possível entrar com esses dados. Confira o e-mail e a senha.",
  cadastro: "Não foi possível criar a conta. Confira os dados ou tente outro e-mail.",
  confirmar: "Conta criada. Confira seu e-mail para confirmar o cadastro antes de entrar.",
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
          <p>Crie seu perfil, organize o repertório e compartilhe o QR code com o público.</p>
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
            <h2>Já tem uma conta?</h2>
            <p>Acesse seu painel de músico.</p>
          </div>
          <form action={signInAction} className="auth-form">
            <label htmlFor="login-email">E-mail</label>
            <input id="login-email" name="email" type="email" autoComplete="email" required disabled={!configured} />
            <label htmlFor="login-password">Senha</label>
            <input id="login-password" name="password" type="password" autoComplete="current-password" required disabled={!configured} />
            <button className="button button-primary" type="submit" disabled={!configured}>Entrar</button>
          </form>
        </section>

        <section className="auth-card">
          <div className="auth-card-heading">
            <h2>Primeira vez por aqui?</h2>
            <p>Comece com seu perfil de palco.</p>
          </div>
          <form action={signUpAction} className="auth-form">
            <label htmlFor="signup-name">Nome artístico</label>
            <input id="signup-name" name="stage_name" type="text" autoComplete="nickname" minLength={2} maxLength={80} required disabled={!configured} />
            <label htmlFor="signup-email">E-mail</label>
            <input id="signup-email" name="email" type="email" autoComplete="email" required disabled={!configured} />
            <label htmlFor="signup-password">Senha</label>
            <input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={8} required disabled={!configured} />
            <button className="button button-outline" type="submit" disabled={!configured}>Criar conta de músico</button>
          </form>
        </section>

        <p className="auth-footnote">O cadastro começa com licença pendente. A equipe ativa o acesso pelo controle interno.</p>
      </div>
    </main>
  );
}
