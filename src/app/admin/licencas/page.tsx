import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { requireAdmin } from "@/lib/auth/require-admin";
import { updateLicenseAction } from "@/app/admin/licencas/actions";

type AdminLicensesPageProps = {
  searchParams: Promise<{ estado?: string }>;
};

const notices: Record<string, string> = {
  salva: "Controle da licença atualizado.",
  erro: "Não foi possível atualizar essa licença. Confira os dados.",
  periodo: "Para ativar a licença, informe um início e um vencimento válidos.",
};

function toLocalDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

export default async function AdminLicensesPage({ searchParams }: AdminLicensesPageProps) {
  const { estado } = await searchParams;
  const { supabase } = await requireAdmin();
  const [{ data: musicians }, { data: licenses }] = await Promise.all([
    supabase.from("musicians").select("id, stage_name, slug, created_at").order("created_at", { ascending: false }),
    supabase.from("musician_licenses").select("musician_id, status, starts_at, ends_at, internal_note"),
  ]);
  const licenseByMusician = new Map((licenses ?? []).map((license) => [license.musician_id, license]));

  return (
    <main className="dashboard-page">
      <div className="dashboard-wrap">
        <header className="dashboard-topbar">
          <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
          <div className="dashboard-header-actions">
            <Link className="button button-outline button-small" href="/admin/catalogo">Catálogo central</Link>
            <Link className="button button-outline button-small" href="/painel"><ArrowLeft size={15} /> Voltar</Link>
          </div>
        </header>
        <div className="dashboard-title-row">
          <div><h1>Licenças anuais</h1><p>Controle interno de acesso dos músicos.</p></div>
          <span className="status-live"><ShieldCheck size={13} /> Administração</span>
        </div>
        {estado && notices[estado] && <p className="dashboard-flash" role="status">{notices[estado]}</p>}

        {musicians?.length ? (
          <div className="admin-license-list">
            {musicians.map((musician) => {
              const license = licenseByMusician.get(musician.id);
              return (
                <article className="panel admin-license-card" key={musician.id}>
                  <div className="admin-license-heading">
                    <div>
                      <h2>{musician.stage_name}</h2>
                      <p>/{musician.slug}</p>
                    </div>
                    <span className={license?.status === "active" ? "status-live" : "demo-label"}>
                      {license?.status ?? "sem licença"}
                    </span>
                  </div>
                  <form action={updateLicenseAction} className="license-admin-form">
                    <input type="hidden" name="musician_id" value={musician.id} />
                    <label>Status
                      <select name="status" defaultValue={license?.status ?? "pending"}>
                        <option value="pending">Pendente</option>
                        <option value="active">Ativa</option>
                        <option value="expired">Expirada</option>
                        <option value="suspended">Suspensa</option>
                      </select>
                    </label>
                    <label>Início
                      <input name="starts_at" type="datetime-local" defaultValue={toLocalDateTime(license?.starts_at)} />
                    </label>
                    <label>Vencimento
                      <input name="ends_at" type="datetime-local" defaultValue={toLocalDateTime(license?.ends_at)} />
                    </label>
                    <label className="license-note-field">Nota interna
                      <input name="internal_note" type="text" maxLength={1000} defaultValue={license?.internal_note ?? ""} placeholder="Referência interna opcional" />
                    </label>
                    <button className="button button-primary button-small" type="submit">Salvar licença</button>
                  </form>
                </article>
              );
            })}
          </div>
        ) : (
          <section className="panel catalog-empty-panel">
            <span className="empty-queue-art"><ShieldCheck size={25} /></span>
            <h2>Nenhum músico cadastrado</h2>
            <p>Contas novas aparecem aqui depois do primeiro cadastro.</p>
          </section>
        )}
      </div>
    </main>
  );
}
