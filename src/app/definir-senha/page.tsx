import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Brand } from "@/components/brand";
import { setInitialPasswordAction } from "@/app/definir-senha/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type SetPasswordPageProps = {
  searchParams: Promise<{ estado?: string }>;
};

const messages: Record<string, string> = {
  senha: "A senha precisa ter pelo menos 8 caracteres.",
  divergente: "As senhas não correspondem.",
  erro: "Não foi possível salvar a senha. Tente novamente.",
};

export default async function SetPasswordPage({ searchParams }: SetPasswordPageProps) {
  const { estado } = await searchParams;
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/entrar?estado=configuracao");

  const { data } = await supabase.auth.getClaims();
  if (typeof data?.claims?.sub !== "string") redirect("/entrar?estado=convite");

  return (
    <main className="auth-page">
      <header className="public-header auth-header">
        <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
      </header>

      <div className="auth-content">
        <div className="auth-intro">
          <span className="artist-avatar auth-avatar"><KeyRound size={22} /></span>
          <h1>Defina sua senha</h1>
          <p>Seu acesso foi criado pela equipe. Escolha uma senha para entrar no painel do músico.</p>
        </div>

        {estado && messages[estado] && <div className="auth-alert" role="status">{messages[estado]}</div>}

        <section className="auth-card">
          <form action={setInitialPasswordAction} className="auth-form">
            <label htmlFor="new-password">Nova senha</label>
            <input id="new-password" name="password" type="password" autoComplete="new-password" minLength={8} required />
            <label htmlFor="password-confirmation">Confirme a senha</label>
            <input id="password-confirmation" name="password_confirmation" type="password" autoComplete="new-password" minLength={8} required />
            <button className="button button-primary" type="submit">Salvar senha e continuar</button>
          </form>
        </section>
      </div>
    </main>
  );
}
