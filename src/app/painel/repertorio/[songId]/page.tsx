import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { requireActiveMusician } from "@/lib/auth/require-active-musician";
import {
  catalogPageHref,
  normalizeCatalogSearch,
  parseCatalogPage,
} from "@/lib/catalog/pagination";

type ChordSheetPageProps = {
  params: Promise<{ songId: string }>;
  searchParams: Promise<{ q?: string | string[]; pagina?: string | string[] }>;
};

export default async function ChordSheetPage({ params, searchParams }: ChordSheetPageProps) {
  const [{ songId }, query] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(songId)) notFound();

  const { supabase } = await requireActiveMusician();
  const { data: song, error } = await supabase
    .from("catalog_songs")
    .select("id, title, artist, composers, version_label, original_key, chord_sheet")
    .eq("id", songId)
    .eq("rights_status", "approved")
    .maybeSingle();

  if (error || !song) notFound();

  const searchTerm = normalizeCatalogSearch(query.q);
  const page = parseCatalogPage(query.pagina);
  const returnHref = catalogPageHref("/painel/repertorio", searchTerm, page);

  return (
    <main className="dashboard-page">
      <div className="dashboard-wrap">
        <header className="dashboard-topbar">
          <Link href="/" aria-label="Cardápio Musical, início"><Brand /></Link>
          <Link className="button button-outline button-small" href={returnHref}><ArrowLeft size={15} /> Voltar ao repertório</Link>
        </header>

        <div className="dashboard-title-row chord-sheet-title-row">
          <div>
            <h1>{song.title}</h1>
            <p>{song.artist}{song.original_key ? ` · Tom original ${song.original_key}` : ""}</p>
          </div>
          <span className="status-live"><ShieldCheck size={13} /> Conteúdo revisado</span>
        </div>

        <section className="panel chord-sheet-detail">
          <div className="chord-sheet-detail-heading">
            <div>
              <h2>{song.version_label}</h2>
              {song.composers.length > 0 && <p>Composição: {song.composers.join(", ")}</p>}
            </div>
          </div>
          <pre className="chord-sheet">{song.chord_sheet}</pre>
          <p className="rights-footnote"><ShieldCheck size={13} /> Cifra disponível a músicos autenticados conforme a revisão de direitos registrada pela plataforma.</p>
        </section>
      </div>
    </main>
  );
}
