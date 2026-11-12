// Turns what people type into words that match catalog_songs.search_text
// (lowercase, without accents or punctuation; see migration 202611120001).
// "Evidências" and "evidencias" both become ["evidencias"].
const MAX_WORDS = 6;

export function catalogSearchWords(term: string): string[] {
  return term
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, MAX_WORDS);
}

// Every word must appear somewhere in title, artist or composers, in any order.
export function catalogSearchPatterns(term: string): string[] {
  return catalogSearchWords(term).map((word) => `%${word}%`);
}
