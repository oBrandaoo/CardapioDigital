// Authorization basis approved by the product owner on 2026-11-11 for publishing
// factual metadata (title, artist, genre) in bulk. It never covers chord sheets,
// lyrics or audio. The text is fixed on the server; the browser cannot change it.

export const FACTUAL_METADATA_AUTHORIZATION = {
  reference:
    "Decisão interna nº 1/2026 (11/11/2026) — Dados principais do MusicBrainz sob CC0 1.0: https://musicbrainz.org/doc/About/Data_License",
  basis:
    "Exibição somente de título, artista e gênero, como dados factuais, obtidos do MusicBrainz (dados principais em domínio público, CC0 1.0). " +
    "Não inclui letra, cifra, partitura, áudio nem capa. Não cobre execução pública das obras (ECAD), que é responsabilidade do músico ou do local do show.",
  // 12 months from the decision. After this date the public catalog hides these
  // songs (RLS) and new bulk publications are refused until a new decision.
  validUntil: "2027-11-11",
} as const;

export const MAX_BULK_CATALOG_SELECTION = 100;

export function factualMetadataAuthorizationExpired(today = new Date().toISOString().slice(0, 10)) {
  return today > FACTUAL_METADATA_AUTHORIZATION.validUntil;
}
