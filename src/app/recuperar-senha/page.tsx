import Link from "next/link";
import { KeyRound } from "lucide-react";
import { Brand } from "@/components/brand";
import { sendPasswordRecoveryAction } from "@/app/recuperar-senha/actions";
import { getSupabaseConfig } from "@/lib/supabase/env";

type RecoveryPageProps = {
  searchParams: Promise<{ estado?: string }>;
};

const messages: Record<string, string> = {
  dados: "Informe um endereço de e-mail válido.",
  configuracao: "Conecte este projeto ao Supabase antes de solicitar a recuperação.",
  enviado: "Se esse e-mail estiver cadastrado, enviaremos um link para redefinir a senha. Confira também o spam.",
  erro: "Não foi possível enviar o link agora. Tente novamente em alguns minutos.",
};

export default async function RecoveryPage({ searchParams }: RecoveryPageProps) {
  const { estado } = await searchParams;
  const configured = Boolean(getSupabaseConfig());

  return (
    <main className="auth-page">
      <header className="public-header auth-header">
        <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
        <Link className="text-link" href="/entrar">Voltar ao login</Link>
      </header>

      <div className="auth-content">
        <div className="auth-intro">
          <span className="artist-avatar auth-avatar"><KeyRound size={22} /></span>
          <h1>Redefina sua senha</h1>
          <p>Informe o e-mail da sua conta para receber um link seguro.</p>
        </div>

        {estado && messages[estado] && <div className="auth-alert" role="status">{messages[estado]}</div>}

        <section className="auth-card">
          <form action={sendPasswordRecoveryAction} className="auth-form">
            <label htmlFor="recovery-email">E-mail</label>
            <input id="recovery-email" name="email" type="email" autoComplete="email" maxLength={254} required disabled={!configured} />
            <button className="button button-primary" type="submit" disabled={!configured}>Enviar link de recuperação</button>
          </form>
        </section>
      </div>
    </main>
  );
}
