"use client";

import Link from "next/link";
import { useState } from "react";
import { updateSongGenreAction, validateCatalogMetadataBatchAction, withdrawSongAction } from "./actions";

export type AdminCatalogSong = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  version_label: string;
  rights_status: string;
  rights_valid_until: string | null;
  metadata_reviewed_at: string | null;
};

export function CatalogSongList({ songs }: { songs: AdminCatalogSong[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const eligible = songs.filter((song) => song.rights_status === "pending" && !song.metadata_reviewed_at).map((song) => song.id);

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <>
      {eligible.length > 0 && (
        <div className="catalog-bulk-review">
          <div><strong>Validar dados em lote</strong><p>Confira as músicas desta página, selecione as corretas e valide juntas. Isso não publica as músicas.</p></div>
          <div className="catalog-bulk-review-actions">
            <button className="button button-outline button-small" type="button" onClick={() => setSelected(eligible)} disabled={selected.length === eligible.length}>Selecionar todas desta página</button>
            {selected.length > 0 && <button className="button button-outline button-small" type="button" onClick={() => setSelected([])}>Limpar seleção</button>}
            <form action={validateCatalogMetadataBatchAction}>
              {selected.map((id) => <input key={id} type="hidden" name="song_id" value={id} />)}
              <button className="button button-primary button-small" type="submit" disabled={selected.length === 0}>Validar {selected.length} selecionada(s)</button>
            </form>
          </div>
        </div>
      )}
      <div className="admin-license-list">
        {songs.map((song) => {
          const canSelect = eligible.includes(song.id);
          return (
            <article className="panel admin-license-card" key={song.id}>
              <div className="admin-license-heading">
                <div className="catalog-song-title">
                  {canSelect && <input type="checkbox" checked={selected.includes(song.id)} onChange={() => toggle(song.id)} aria-label={`Selecionar ${song.title}, ${song.artist}`} />}
                  <div><h2>{song.title}</h2><p>{song.artist} · {song.version_label}</p></div>
                </div>
                <span className={song.rights_status === "approved" ? "status-live" : "demo-label"}>{song.rights_status === "approved" ? "Publicada" : song.rights_status === "pending" ? "Privada" : song.rights_status}</span>
              </div>
              {song.rights_status === "pending" && (
                <div className="catalog-song-review-row">
                  <span className={song.metadata_reviewed_at ? "catalog-metadata-reviewed" : "catalog-metadata-pending"}>{song.metadata_reviewed_at ? "Dados validados" : "Dados a revisar"}</span>
                  <Link className="button button-outline button-small" href={`/admin/catalogo/${song.id}`}>{song.metadata_reviewed_at ? "Editar dados" : "Revisar música"}</Link>
                  {song.metadata_reviewed_at && <Link className="button button-outline button-small" href={`/admin/catalogo/${song.id}/publicar`}>Publicação</Link>}
                </div>
              )}
              <div className="catalog-record-foot">
                <span>{song.rights_valid_until ? `Autorização até ${new Date(`${song.rights_valid_until}T12:00:00`).toLocaleDateString("pt-BR")}` : "Sem vencimento informado"}</span>
                {song.rights_status === "approved" && (
                  <form action={withdrawSongAction}>
                    <input type="hidden" name="song_id" value={song.id} />
                    <button className="button button-outline button-small" type="submit">Retirar do público</button>
                  </form>
                )}
              </div>
              <form action={updateSongGenreAction} className="catalog-genre-form">
                <input type="hidden" name="song_id" value={song.id} />
                <label>Gênero principal
                  <input name="genre" type="text" maxLength={80} defaultValue={song.genre} required />
                </label>
                <button className="button button-outline button-small" type="submit">Salvar gênero</button>
              </form>
            </article>
          );
        })}
      </div>
    </>
  );
}
