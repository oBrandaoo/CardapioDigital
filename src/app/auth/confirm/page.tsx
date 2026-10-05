import Link from "next/link";
import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { confirmInviteAction } from "@/app/auth/confirm/actions";

type ConfirmInvitePageProps = {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
};

export default async function ConfirmInvitePage({ searchParams }: ConfirmInvitePageProps) {
  const { token_hash: tokenHash, type } = await searchParams;
  if (type !== "invite" || !tokenHash || tokenHash.length > 512) {
    redirect("/entrar?estado=convite");
  }

  return (
    <main className="auth-page">
      <header className="public-header auth-header">
        <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
      </header>

      <div className="auth-content">
        <div className="auth-intro">
          <span className="artist-avatar auth-avatar"><MailCheck size={22} /></span>
          <h1>Confirme seu convite</h1>
          <p>Confirme o acesso para continuar e definir sua senha do Cardápio Musical.</p>
        </div>

        <section className="auth-card">
          <form action={confirmInviteAction} className="auth-form">
            <input type="hidden" name="token_hash" value={tokenHash} />
            <button className="button button-primary" type="submit">Aceitar convite e continuar</button>
          </form>
        </section>
      </div>
    </main>
  );
}
