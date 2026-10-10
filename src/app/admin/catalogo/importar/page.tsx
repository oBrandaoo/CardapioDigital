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
          <div><h1>Importar músicas</h1><p>Carregue metadados e cifras opcionais em pequenos lotes para revisão.</p></div>
          <span className="status-live"><ShieldCheck size={13} /> Administração</span>
        </div>

        <div className="catalog-import-entry">
          <div><strong>Buscar metadados no MusicBrainz</strong><p>Selecione gravações por artista. Elas entram como rascunhos privados, sem cifra nem autorização.</p></div>
          <Link className="button button-outline button-small" href="/admin/catalogo/musicbrainz">Abrir busca</Link>
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
            <li>Se houver cifra, salve-a em TXT UTF-8 e informe o nome em <code>arquivo_txt</code>. Caso contrário, deixe o campo vazio.</li>
            <li>Os campos de autorização podem ficar vazios nesta etapa. Se já tiver documentação, informe a referência, os termos e a validade em <code>AAAA-MM-DD</code>.</li>
            <li>A importação não aprova a publicação. Depois de validar os dados, registre a autorização na etapa separada de publicação.</li>
          </ol>
          <p className="catalog-import-note"><FileText size={16} /> Use ponto e vírgula como separador. Coloque valores com ponto e vírgula entre aspas duplas.</p>
          <CatalogImportForm />
        </section>
      </div>
    </main>
  );
}
