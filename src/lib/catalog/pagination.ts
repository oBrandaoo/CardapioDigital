export type SearchParamValue = string | string[] | undefined;
export const CATALOG_PAGE_SIZE = 30;

export function firstSearchParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeCatalogSearch(value: SearchParamValue) {
  return (firstSearchParam(value) ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
}

export function parseCatalogPage(value: SearchParamValue) {
  const rawPage = firstSearchParam(value) ?? "";
  if (!/^\d+$/.test(rawPage)) return 1;

  const page = Number(rawPage);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function catalogPageHref(pathname: string, searchTerm: string, page: number, extraParams: Record<string, string> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(extraParams)) {
    if (value) params.set(key, value);
  }
  if (searchTerm) params.set("q", searchTerm);
  if (page > 1) params.set("pagina", String(page));
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
