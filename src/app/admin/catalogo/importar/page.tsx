import Link from "next/link";
import { ArrowLeft, FileText, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CatalogImportForm } from "./import-form";

export default async function CatalogImportPage() {
  await requireAdmin();

  return (
    <main className="dashboard-page">
      <div className="dashboard-wrap">
        <header className="dashboard-topbar">
          <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
          <Link className="button button-outline button-small" href="/admin/catalogo"><ArrowLeft size={15} /> Voltar ao catálogo</Link>
        </header>

        <div className="dashboard-title-row">
          <div><h1>Importar músicas</h1><p>Carregue metadados e cifras em pequenos lotes para revisão.</p></div>
          <span className="status-live"><ShieldCheck size={13} /> Administração</span>
        </div>

        <section className="panel catalog-import-panel">
          <div className="panel-heading">
            <div>
              <h2>Prepare os arquivos</h2>
              <p>O lote aceita até 10 músicas. Todas entram como pendentes e permanecem fora da página pública.</p>
            </div>
          </div>
          <ol>
            <li><a href="/modelo-catalogo.csv" download>Baixe o modelo CSV</a> e preencha uma linha por música e versão.</li>
            <li>Salve cada cifra em um arquivo TXT UTF-8. O nome deve ser igual ao campo <code>arquivo_txt</code> da planilha.</li>
            <li>Informe a referência verificável da autorização e seus termos de uso. Use validade no formato <code>AAAA-MM-DD</code>, ou deixe em branco se não houver vencimento documentado. A versão interna será “Original”.</li>
            <li>Guarde o documento da autorização. A importação registra a referência e os termos informados, mas não aprova a publicação.</li>
          </ol>
          <p className="catalog-import-note"><FileText size={16} /> Use ponto e vírgula como separador. Coloque valores com ponto e vírgula entre aspas duplas.</p>
          <CatalogImportForm />
        </section>
      </div>
    </main>
  );
}
