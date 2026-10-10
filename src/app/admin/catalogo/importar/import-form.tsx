"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import {
  commitCatalogImportAction,
  previewCatalogImportAction,
  type ImportPreview,
} from "./actions";

export function CatalogImportForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState("");
  const [imported, setImported] = useState(false);
  const [pending, startTransition] = useTransition();
  const hasErrors = !preview || preview.issues.length > 0 || preview.rows.some((row) => row.issues.length > 0);

  function previewFiles() {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    setMessage("");
    setImported(false);
    startTransition(async () => {
      try {
        setPreview(await previewCatalogImportAction(formData));
      } catch {
        setPreview(null);
        setMessage("Não foi possível gerar a prévia. Confira os arquivos e tente novamente.");
      }
    });
  }

  function importFiles() {
    if (!formRef.current || !preview || hasErrors) return;
    const formData = new FormData(formRef.current);
    formData.set("fingerprint", preview.fingerprint);
    startTransition(async () => {
      try {
        const result = await commitCatalogImportAction(formData);
        setMessage(result.message);
        setImported(result.ok);
        if (result.ok) {
          formRef.current?.reset();
          setPreview(null);
        } else {
          setPreview(null);
        }
      } catch {
        setPreview(null);
        setImported(false);
        setMessage("A importação falhou. Nenhuma música foi publicada.");
      }
    });
  }

  return (
    <div>
      <form
        ref={formRef}
        className="catalog-import-form"
        onChange={() => { setPreview(null); setMessage(""); setImported(false); }}
        onSubmit={(event) => event.preventDefault()}
      >
        <label>Planilha CSV (UTF-8, separada por ponto e vírgula)
          <input name="catalog_csv" type="file" accept=".csv,text/csv" required />
        </label>
        <label>Cifras em TXT (opcionais, até 10 arquivos)
          <input name="sheets" type="file" accept=".txt,text/plain" multiple />
        </label>
        <div className="catalog-import-actions">
          <button className="button button-outline" type="button" disabled={pending} onClick={previewFiles}>
            {pending ? "Processando…" : "Ver prévia"}
          </button>
          <button className="button button-primary" type="button" disabled={pending || hasErrors || !preview?.rows.length} onClick={importFiles}>
            Importar como pendente
          </button>
        </div>
      </form>

      {message && <p className="dashboard-flash" role="status">{message}{imported && <> <Link href="/admin/catalogo?situacao=metadata_pending">Abrir fila de revisão</Link></>}</p>}

      {preview && (
        <section className="catalog-import-preview" aria-label="Prévia do lote">
          <h2>Prévia do lote</h2>
          {preview.issues.length > 0 && (
            <ul className="catalog-import-errors">
              {preview.issues.map((issue, index) => <li key={`${index}-${issue}`}>{issue}</li>)}
            </ul>
          )}
          {preview.rows.length > 0 && (
            <div className="catalog-import-rows">
              {preview.rows.map((row) => (
                <div className="catalog-import-row" key={row.line}>
                  <div>
                    <strong>Linha {row.line}: {row.title || "Sem título"}</strong>
                    <span>{row.artist || "Sem artista"} · {row.genre || "Sem gênero"} · {row.filename || "Sem cifra"}</span>
                  </div>
                  {row.issues.length ? (
                    <ul className="catalog-import-errors">
                      {row.issues.map((issue) => <li key={issue}>{issue}</li>)}
                    </ul>
                  ) : <span className="catalog-import-ok">Pronta para importar como pendente</span>}
                </div>
              ))}
            </div>
          )}
          {hasErrors && <p>Corrija todos os apontamentos e gere uma nova prévia antes de importar.</p>}
        </section>
      )}
    </div>
  );
}
