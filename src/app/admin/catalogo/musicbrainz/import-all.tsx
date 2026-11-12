"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { importAllMusicBrainzPageAction } from "./actions";

type Progress = {
  artistId: string;
  genre: string;
  nextPage: number;
  count: number;
  scanned: number;
  imported: number;
  skipped: number;
  invalid: number;
};

function storageKey(artistId: string) {
  return `cardapio:musicbrainz:import:${artistId}`;
}

function readSaved(artistId: string): string | null {
  try {
    return localStorage.getItem(storageKey(artistId));
  } catch {
    return null; // O armazenamento local é opcional; a importação também funciona sem ele.
  }
}

function subscribeToStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function parseSaved(saved: string | null, artistId: string): Progress | null {
  if (!saved) return null;
  try {
    const value = JSON.parse(saved) as Progress;
    return value.artistId === artistId && Number.isSafeInteger(value.nextPage) && value.nextPage >= 1 ? value : null;
  } catch {
    return null;
  }
}

// The parent renders this with key={artistId}, so state starts fresh for each artist.
export function ImportAllMusicBrainz({ artistId, recordingCount }: { artistId: string; recordingCount: number }) {
  const saved = useSyncExternalStore(subscribeToStorage, () => readSaved(artistId), () => null);
  const savedProgress = useMemo(() => parseSaved(saved, artistId), [saved, artistId]);
  const [localProgress, setProgress] = useState<Progress | null>(null);
  const [genreInput, setGenre] = useState<string | null>(null);
  const [localMessage, setMessage] = useState<string | null>(null);
  const [running, startTransition] = useTransition();
  const stopRequested = useRef(false);

  const progress = localProgress ?? savedProgress;
  const genre = genreInput ?? savedProgress?.genre ?? "Sertanejo";
  const message = localMessage ?? (savedProgress ? "Importação anterior encontrada. Clique em Continuar para retomar." : "");

  function save(next: Progress) {
    setProgress(next);
    try { localStorage.setItem(storageKey(artistId), JSON.stringify(next)); } catch { /* armazenamento indisponível */ }
  }

  function run(initial: Progress) {
    stopRequested.current = false;
    setMessage("");
    startTransition(async () => {
      let current = initial;
      while (!stopRequested.current) {
        let result;
        try {
          result = await importAllMusicBrainzPageAction(artistId, current.genre, current.nextPage);
        } catch {
          setMessage("A conexão falhou. O progresso foi guardado neste navegador; clique em Continuar para tentar de novo.");
          break;
        }
        if (!result.ok) {
          setMessage(result.message ?? "A importação parou. Clique em Continuar para tentar de novo.");
          break;
        }
        current = {
          ...current,
          nextPage: result.nextPage,
          count: result.count,
          scanned: current.scanned + result.scanned,
          imported: current.imported + result.imported,
          skipped: current.skipped + result.skipped,
          invalid: current.invalid + result.invalid,
        };
        save(current);
        if (result.done) {
          try { localStorage.removeItem(storageKey(artistId)); } catch { /* armazenamento indisponível */ }
          setMessage("Importação concluída. Os novos registros estão pendentes de revisão.");
          break;
        }
      }
      if (stopRequested.current) setMessage("Importação pausada. Clique em Continuar para retomar da próxima página.");
    });
  }

  function start() {
    const cleanedGenre = genre.trim();
    if (!cleanedGenre || cleanedGenre.length > 80) {
      setMessage("Informe um gênero com até 80 caracteres.");
      return;
    }
    const initial = { artistId, genre: cleanedGenre, nextPage: 1, count: recordingCount, scanned: 0, imported: 0, skipped: 0, invalid: 0 };
    save(initial);
    run(initial);
  }

  const done = message.startsWith("Importação concluída");
  return (
    <section className="musicbrainz-bulk" aria-label="Importar todas as gravações do artista">
      <h3>Importar todas as gravações</h3>
      <p>Processa as {recordingCount.toLocaleString("pt-BR")} gravações em lotes de 25. Títulos repetidos são ignorados. Mantenha esta página aberta; se a conexão falhar, você poderá continuar deste navegador.</p>
      <div className="musicbrainz-import-actions">
        <label>Gênero principal
          <input value={genre} onChange={(event) => setGenre(event.target.value)} maxLength={80} disabled={running || Boolean(progress && !done)} required />
        </label>
        {!running && (!progress || done) && <button className="button button-primary" type="button" onClick={start}>Importar todas</button>}
        {!running && progress && !done && <button className="button button-primary" type="button" onClick={() => run(progress)}>Continuar importação</button>}
        {running && <button className="button button-outline" type="button" onClick={() => { stopRequested.current = true; }}>Pausar após este lote</button>}
      </div>
      {progress && (
        <p role="status">
          {Math.min(progress.scanned, progress.count).toLocaleString("pt-BR")} de {progress.count.toLocaleString("pt-BR")} verificadas · {progress.imported.toLocaleString("pt-BR")} importadas · {progress.skipped.toLocaleString("pt-BR")} repetidas ignoradas · {progress.invalid.toLocaleString("pt-BR")} inválidas ignoradas
        </p>
      )}
      {message && <p className="dashboard-flash" role="status">{message} {done && <Link href="/admin/catalogo?situacao=pending">Abrir fila de revisão</Link>}</p>}
    </section>
  );
}
