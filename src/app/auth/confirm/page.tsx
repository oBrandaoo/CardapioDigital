import Link from "next/link";
import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { confirmAuthLinkAction } from "@/app/auth/confirm/actions";

type ConfirmInvitePageProps = {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
};

export default async function ConfirmInvitePage({ searchParams }: ConfirmInvitePageProps) {
  const { token_hash: tokenHash, type } = await searchParams;
  if ((type !== "invite" && type !== "recovery") || !tokenHash || tokenHash.length > 512) {
    redirect(`/entrar?estado=${type === "recovery" ? "recuperacao" : "convite"}`);
  }
  const isRecovery = type === "recovery";

  return (
    <main className="auth-page">
      <header className="public-header auth-header">
        <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
      </header>

      <div className="auth-content">
        <div className="auth-intro">
          <span className="artist-avatar auth-avatar"><MailCheck size={22} /></span>
          <h1>{isRecovery ? "Redefina sua senha" : "Confirme seu convite"}</h1>
          <p>{isRecovery ? "Confirme o link seguro para escolher uma nova senha." : "Confirme o acesso para continuar e definir sua senha do Cardápio Musical."}</p>
        </div>

        <section className="auth-card">
          <form action={confirmAuthLinkAction} className="auth-form">
            <input type="hidden" name="token_hash" value={tokenHash} />
            <input type="hidden" name="type" value={type} />
            <button className="button button-primary" type="submit">{isRecovery ? "Continuar para definir senha" : "Aceitar convite e continuar"}</button>
          </form>
        </section>
      </div>
    </main>
  );
}
