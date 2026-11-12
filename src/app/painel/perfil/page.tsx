import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { updateMusicianProfileAction } from "@/app/painel/actions";
import { requireActiveMusician } from "@/lib/auth/require-active-musician";
import { firstSearchParam } from "@/lib/catalog/pagination";

type ProfilePageProps = {
  searchParams: Promise<{ estado?: string | string[] }>;
};

const messages: Record<string, string> = {
  perfil: "Não foi possível atualizar o perfil. Tente novamente.",
  perfil_salvo: "Dados do perfil atualizados.",
  perfil_campos: "Confira o nome artístico, a cidade e a descrição.",
  endereco_invalido: "Use um endereço com letras minúsculas, números e hífens.",
  endereco_em_uso: "Esse endereço público já está sendo usado por outro músico.",
};

export default async function MusicianProfilePage({ searchParams }: ProfilePageProps) {
  const estado = firstSearchParam((await searchParams).estado);
  const { supabase, musicianId } = await requireActiveMusician();
  const { data: musician } = await supabase
    .from("musicians")
    .select("slug, stage_name, bio, city")
    .eq("id", musicianId)
    .maybeSingle();

  return (
    <main className="dashboard-page">
      <div className="dashboard-wrap">
        <header className="dashboard-topbar">
          <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
          <Link className="button button-outline button-small" href="/painel"><ArrowLeft size={15} /> Voltar ao painel</Link>
        </header>

        <div className="dashboard-title-row">
          <div><h1>Perfil do palco</h1><p>Essas informações aparecem na sua página pública.</p></div>
        </div>

        {estado && messages[estado] && <p className="dashboard-flash" role="status">{messages[estado]}</p>}

        <article className="panel">
          <form action={updateMusicianProfileAction} className="profile-edit-form">
            <div className="profile-edit-grid">
              <label className="profile-edit-field">
                <span>Nome artístico</span>
                <input name="stage_name" type="text" minLength={2} maxLength={80} defaultValue={musician?.stage_name ?? ""} autoComplete="nickname" required />
              </label>
              <label className="profile-edit-field">
                <span>Endereço público</span>
                <span className="profile-slug-control">
                  <span className="profile-slug-prefix">/m/</span>
                  <input
                    name="slug"
                    type="text"
                    minLength={3}
                    maxLength={60}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    autoCapitalize="none"
                    spellCheck={false}
                    defaultValue={musician?.slug ?? ""}
                    aria-describedby="profile-slug-help"
                    required
                  />
                </span>
                <small id="profile-slug-help">Use letras minúsculas sem acento, números e hífens. Se mudar, o QR code impresso antigo deixa de funcionar.</small>
              </label>
              <label className="profile-edit-field">
                <span>Cidade</span>
                <input name="city" type="text" maxLength={100} defaultValue={musician?.city ?? ""} />
              </label>
              <label className="profile-edit-field profile-edit-field-wide">
                <span>Descrição</span>
                <textarea name="bio" maxLength={500} rows={3} defaultValue={musician?.bio ?? ""} />
              </label>
            </div>
            <div className="profile-edit-actions">
              <button className="button button-primary button-small" type="submit">Salvar perfil</button>
            </div>
          </form>
        </article>
      </div>
    </main>
  );
}
