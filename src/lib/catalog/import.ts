import "server-only";
import { createHash } from "node:crypto";

const HEADERS = [
  "titulo", "artista", "genero", "tom_original",
  "arquivo_txt", "referencia_autorizacao", "autorizacao", "validade",
] as const;

export const MAX_IMPORT_ROWS = 10;
const MAX_CSV_BYTES = 64_000;
const MAX_TXT_BYTES = 70_000;

export type ImportSong = {
  line: number;
  title: string;
  artist: string;
  genre: string;
  composers: string[];
  version_label: string;
  original_key: string | null;
  filename: string;
  chord_sheet: string;
  authorization_reference: string;
  rights_basis: string;
  rights_valid_until: string | null;
  issues: string[];
};

export type ParsedImport = {
  fingerprint: string;
  songs: ImportSong[];
  issues: string[];
};

function decode(bytes: ArrayBuffer) {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"' && cell === "") {
      quoted = true;
    } else if (character === ";") {
      row.push(cell.trim());
      cell = "";
    } else if (character === "\n") {
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }
  if (quoted) throw new Error("O CSV tem aspas sem fechamento.");
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function duplicateKey(song: Pick<ImportSong, "title" | "artist" | "version_label">) {
  return [song.title, song.artist, song.version_label]
    .map((part) => part.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR"))
    .join("\u0000");
}

export async function parseImportFiles(formData: FormData): Promise<ParsedImport> {
  const csv = formData.get("catalog_csv");
  const files = formData.getAll("sheets").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const issues: string[] = [];
  const songs: ImportSong[] = [];
  const hash = createHash("sha256");

  if (!(csv instanceof File) || csv.size === 0 || !csv.name.toLowerCase().endsWith(".csv")) {
    return { fingerprint: "", songs, issues: ["Envie uma planilha .csv."] };
  }
  if (csv.size > MAX_CSV_BYTES) issues.push("O CSV deve ter no máximo 64 KB.");
  if (files.length > MAX_IMPORT_ROWS) issues.push(`Envie no máximo ${MAX_IMPORT_ROWS} arquivos TXT por lote.`);
  if (issues.length) return { fingerprint: "", songs, issues };

  const csvBytes = await csv.arrayBuffer();
  hash.update(Buffer.from(csvBytes));
  let csvText: string;
  try {
    csvText = decode(csvBytes).replace(/^\uFEFF/, "");
  } catch {
    return { fingerprint: "", songs, issues: ["O CSV precisa estar em UTF-8."] };
  }

  let rows: string[][];
  try {
    rows = parseCsv(csvText);
  } catch (error) {
    return { fingerprint: "", songs, issues: [(error as Error).message] };
  }
  if (!rows.length || HEADERS.some((header, index) => rows[0][index] !== header) || rows[0].length !== HEADERS.length) {
    return { fingerprint: "", songs, issues: ["O cabeçalho do CSV não corresponde ao modelo fornecido."] };
  }
  const dataRows = rows.slice(1);
  if (dataRows.length === 0) issues.push("O CSV não contém músicas.");
  if (dataRows.length > MAX_IMPORT_ROWS) issues.push(`O lote pode conter no máximo ${MAX_IMPORT_ROWS} músicas.`);
  if (issues.length) return { fingerprint: "", songs, issues };

  const fileMap = new Map<string, string>();
  for (const file of files) {
    const filename = file.name.trim();
    const key = filename.toLocaleLowerCase("pt-BR");
    if (!filename.toLowerCase().endsWith(".txt") || filename.includes("/") || filename.includes("\\")) {
      issues.push(`Arquivo inválido: ${filename}. Use somente .txt.`);
      continue;
    }
    if (fileMap.has(key)) {
      issues.push(`Arquivo TXT repetido: ${filename}.`);
      continue;
    }
    if (file.size > MAX_TXT_BYTES) {
      issues.push(`${filename} excede 70 KB.`);
      continue;
    }
    const bytes = await file.arrayBuffer();
    hash.update(filename);
    hash.update(Buffer.from(bytes));
    try {
      fileMap.set(key, decode(bytes));
    } catch {
      issues.push(`${filename} precisa estar em UTF-8.`);
    }
  }

  const seenSongs = new Set<string>();
  const usedFiles = new Set<string>();
  for (const [index, row] of dataRows.entries()) {
    const line = index + 2;
    if (row.length !== HEADERS.length) {
      issues.push(`Linha ${line}: esperado ${HEADERS.length} colunas; encontrado ${row.length}.`);
      continue;
    }
    const [title, artist, genre, originalKey, filename,
      authorizationReference, rightsBasis, rawValidUntil] = row;
    const composers: string[] = [];
    const versionLabel = "Original";
    const chordSheet = fileMap.get(filename.toLocaleLowerCase("pt-BR")) ?? "";
    const rowIssues: string[] = [];

    if (title.length < 1 || title.length > 160) rowIssues.push("título inválido");
    if (artist.length < 1 || artist.length > 160) rowIssues.push("artista inválido");
    if (genre.length < 1 || genre.length > 80) rowIssues.push("gênero inválido");
    if (originalKey.length > 8) rowIssues.push("tom muito longo");
    if (!filename.toLowerCase().endsWith(".txt") || !chordSheet.trim()) rowIssues.push("TXT ausente ou vazio");
    if (chordSheet.length > 40_000 || chordSheet.includes("\u0000")) rowIssues.push("TXT inválido ou longo demais");
    if (authorizationReference.length < 5 || authorizationReference.length > 1000) rowIssues.push("referência da autorização deve ter 5 a 1000 caracteres");
    if (rightsBasis.length < 5 || rightsBasis.length > 2000) rowIssues.push("autorização deve ter 5 a 2000 caracteres");
    if (rawValidUntil && !validDate(rawValidUntil)) rowIssues.push("validade deve ser AAAA-MM-DD");

    const song: ImportSong = {
      line, title, artist, genre, composers, version_label: versionLabel,
      original_key: originalKey || null, filename, chord_sheet: chordSheet,
      authorization_reference: authorizationReference, rights_basis: rightsBasis,
      rights_valid_until: rawValidUntil || null,
      issues: rowIssues,
    };
    const key = duplicateKey(song);
    if (seenSongs.has(key)) song.issues.push("música duplicada neste CSV");
    seenSongs.add(key);
    const fileKey = filename.toLocaleLowerCase("pt-BR");
    if (usedFiles.has(fileKey)) song.issues.push("TXT associado a mais de uma linha");
    usedFiles.add(fileKey);
    songs.push(song);
  }
  for (const filename of fileMap.keys()) {
    if (!usedFiles.has(filename)) issues.push(`TXT sem linha correspondente: ${filename}.`);
  }

  return { fingerprint: hash.digest("hex"), songs, issues };
}
