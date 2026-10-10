import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { requireAdmin } from "@/lib/auth/require-admin";
import { firstSearchParam } from "@/lib/catalog/pagination";
import { publishCatalogSongAction } from "./actions";

type PublishPageProps = {
  params: Promise<{ songId: string }>;
  searchParams: Promise<{ estado?: string | string[] }>;
};

export default async function PublishCatalogSongPage({ params, searchParams }: PublishPageProps) {
  const [{ songId }, query] = await Promise.all([params, searchParams]);
  const { supabase } = await requireAdmin();
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(songId)) notFound();
  const { data: song } = await supabase.from("catalog_songs")
    .select("id, title, artist, chord_sheet, metadata_reviewed_at, authorization_reference, rights_basis, rights_valid_until, rights_status")
    .eq("id", songId)
    .maybeSingle();
  if (!song) notFound();
  const canPublish = song.rights_status === "pending" && Boolean(song.metadata_reviewed_at);
  const state = firstSearchParam(query.estado);

  return (
    <main className="dashboard-page">
      <div className="dashboard-wrap">
        <header className="dashboard-topbar">
          <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
          <Link className="button button-outline button-small" href="/admin/catalogo?situacao=metadata_reviewed"><ArrowLeft size={15} /> Catálogo</Link>
        </header>
        <div className="dashboard-title-row"><div><h1>Publicar música</h1><p>{song.title} · {song.artist}</p></div></div>
        {state === "campos" && <p className="dashboard-flash" role="status">Informe a referência, os termos de autorização e confirme a revisão. A validade, se houver, precisa estar vigente.</p>}
        {state === "bloqueada" && <p className="dashboard-flash" role="status">Valide os dados antes de publicar.</p>}
        {state === "erro" && <p className="dashboard-flash" role="status">Não foi possível publicar. Confira o registro e tente novamente.</p>}
        <section className="panel admin-catalog-form-panel">
          <div className="panel-heading"><div><h2>Autorização para exibição</h2><p>Este passo é separado da validação dos dados. Documente a permissão para exibir os dados da música e, quando houver cifra, para armazená-la e mostrá-la ao músico.</p></div></div>
          {!song.metadata_reviewed_at && <p>Os dados ainda não foram validados. <Link href={`/admin/catalogo/${song.id}`}>Revisar dados</Link></p>}
          {!song.chord_sheet.trim() && <p>Esta música não tem cifra. Ela pode ser publicada apenas com título e artista, desde que esses dados tenham autorização de exibição.</p>}
          {song.rights_status !== "pending" && <p>Este registro não está pendente de publicação.</p>}
          {canPublish && (
            <form action={publishCatalogSongAction} className="catalog-admin-form">
              <input type="hidden" name="song_id" value={song.id} />
              <label className="catalog-sheet-field">Referência da autorização
                <input name="authorization_reference" defaultValue={song.authorization_reference ?? ""} minLength={5} maxLength={1000} required placeholder="Link ou identificador do documento/licença" />
              </label>
              <label className="catalog-sheet-field">Base e limites de uso
                <textarea name="rights_basis" defaultValue={song.rights_basis ?? ""} rows={4} maxLength={2000} required placeholder="Titular, usos permitidos e restrições" />
              </label>
              <label>Validade da autorização (se houver)
                <input name="rights_valid_until" type="date" defaultValue={song.rights_valid_until ?? ""} />
              </label>
              <label className="rights-confirmation">
                <input name="rights_confirmed" type="checkbox" value="yes" required />
                <span>Confirmei que a documentação cobre a exibição dos dados da música{song.chord_sheet.trim() ? " e o armazenamento e a exibição da cifra ao músico autenticado" : ""}.</span>
              </label>
              <button className="button button-primary" type="submit">Aprovar publicação</button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
