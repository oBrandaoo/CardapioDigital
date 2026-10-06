import Link from "next/link";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { catalogPageHref } from "@/lib/catalog/pagination";

type CatalogListControlsProps = {
  pathname: string;
  inputId: string;
  searchTerm: string;
  page: number;
  pageCount: number;
  resultCount: number;
};

export function CatalogListControls({
  pathname,
  inputId,
  searchTerm,
  page,
  pageCount,
  resultCount,
}: CatalogListControlsProps) {
  const formattedCount = new Intl.NumberFormat("pt-BR").format(resultCount);

  return (
    <div className="catalog-list-controls">
      <form action={pathname} method="get" className="catalog-search-form" role="search">
        <label htmlFor={inputId}>Buscar por título, artista ou compositor</label>
        <div className="catalog-search-row">
          <input
            id={inputId}
            name="q"
            type="search"
            maxLength={100}
            defaultValue={searchTerm}
            placeholder="Ex.: nome da música ou artista"
          />
          <button className="button button-primary button-small" type="submit"><Search size={15} /> Buscar</button>
          {searchTerm && <Link className="button button-outline button-small" href={pathname}>Limpar</Link>}
        </div>
      </form>

      <div className="catalog-list-status">
        <p aria-live="polite">
          {searchTerm
            ? `${formattedCount} resultado${resultCount === 1 ? "" : "s"} para “${searchTerm}”`
            : `${formattedCount} música${resultCount === 1 ? "" : "s"}`}
        </p>
        {pageCount > 1 && (
          <nav className="catalog-pagination" aria-label="Paginação do catálogo">
            {page > 1 ? (
              <Link
                className="button button-outline button-small"
                href={catalogPageHref(pathname, searchTerm, page - 1)}
                aria-label="Página anterior"
              ><ArrowLeft size={14} /> Anterior</Link>
            ) : <span />}
            <span aria-current="page">Página {page} de {pageCount}</span>
            {page < pageCount ? (
              <Link
                className="button button-outline button-small"
                href={catalogPageHref(pathname, searchTerm, page + 1)}
                aria-label="Próxima página"
              >Próxima <ArrowRight size={14} /></Link>
            ) : <span />}
          </nav>
        )}
      </div>
    </div>
  );
}
