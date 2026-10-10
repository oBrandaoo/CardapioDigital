"use client";

import { useState } from "react";
import { savePendingSongAction, validateSongMetadataAction } from "./actions";

type ReviewSong = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  chord_sheet: string;
  metadata_reviewed_at: string | null;
};

export function SongReviewForm({ song }: { song: ReviewSong }) {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [genre, setGenre] = useState(song.genre);
  const [chord, setChord] = useState(song.chord_sheet);
  const [message, setMessage] = useState("");

  async function loadTxt(file: File | undefined) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".txt") || file.size > 160_000) {
      setMessage("Escolha um arquivo .txt de até 160 KB.");
      return;
    }
    try {
      const content = await file.text();
      if (content.length > 40_000) {
        setMessage("A cifra ultrapassa o limite de 40.000 caracteres.");
        return;
      }
      setChord(content);
      setMessage("TXT carregado no formulário. Salve o rascunho ou aprove para registrar a cifra.");
    } catch {
      setMessage("Não foi possível ler o TXT. Tente outro arquivo.");
    }
  }

  return (
    <form action={savePendingSongAction} className="catalog-review-form">
      <input type="hidden" name="song_id" value={song.id} />
      <div className="catalog-review-checklist">
        <strong>{song.metadata_reviewed_at ? "Dados já validados" : "Validação dos dados"}</strong>
        <p>Confira título, artista e gênero. A cifra é opcional nesta etapa. Validar os dados não publica a música.</p>
      </div>

      <section className="catalog-review-section">
        <div className="catalog-review-section-heading"><h3>Dados da música</h3><p>Corrija o cadastro importado, se necessário.</p></div>
        <div className="catalog-review-grid">
          <label>Título<input name="title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} required /></label>
          <label>Artista<input name="artist" value={artist} onChange={(event) => setArtist(event.target.value)} maxLength={160} required /></label>
          <label>Gênero principal<input name="genre" value={genre} onChange={(event) => setGenre(event.target.value)} maxLength={80} required /></label>
        </div>
      </section>

      <section className="catalog-review-section">
        <div className="catalog-review-section-heading"><h3>Cifra opcional</h3><p>Se tiver uma cifra autorizada, cole o texto ou carregue um arquivo .txt. O arquivo só será gravado ao salvar.</p></div>
        <label className="catalog-review-file">Carregar arquivo TXT
          <input type="file" accept=".txt,text/plain" onChange={(event) => { void loadTxt(event.target.files?.[0]); event.target.value = ""; }} />
        </label>
        <label>Cifra em texto simples
          <textarea name="chord_sheet" rows={16} maxLength={40000} value={chord} onChange={(event) => setChord(event.target.value)} placeholder="Cole ou carregue a cifra autorizada." />
        </label>
        <small>{chord.length.toLocaleString("pt-BR")} de 40.000 caracteres</small>
      </section>

      {message && <p className="dashboard-flash" role="status">{message}</p>}
      <div className="catalog-review-actions">
        <button className="button button-outline" type="submit">Salvar rascunho</button>
        <button className="button button-primary" type="submit" formAction={validateSongMetadataAction}>Validar dados</button>
      </div>
    </form>
  );
}
