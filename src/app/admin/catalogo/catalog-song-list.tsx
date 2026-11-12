"use client";

import Link from "next/link";
import { useState } from "react";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import {
  publishFactualMetadataBatchAction,
  updateSongGenreAction,
  validateCatalogMetadataBatchAction,
  withdrawFactualMetadataAuthorizationAction,
  withdrawSongAction,
} from "./actions";

export type AdminCatalogSong = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  version_label: string;
  rights_status: string;
  rights_valid_until: string | null;
  metadata_reviewed_at: string | null;
  popularity_rank: number | null;
};

type ListState = { situacao: string; q: string; pagina: string };

type BulkPublish = { reference: string; basis: string; validUntil: string; expired: boolean };

function ListStateFields({ state }: { state: ListState }) {
  return (
    <>
      <input type="hidden" name="situacao" value={state.situacao} />
      <input type="hidden" name="q" value={state.q} />
      <input type="hidden" name="pagina" value={state.pagina} />
    </>
  );
}

export function CatalogSongList({ songs, listState, bulkPublish }: { songs: AdminCatalogSong[]; listState: ListState; bulkPublish: BulkPublish | null }) {
  const [selected, setSelected] = useState<string[]>([]);
  const toValidate = songs.filter((song) => song.rights_status === "pending" && !song.metadata_reviewed_at).map((song) => song.id);
  const toPublish = bulkPublish && !bulkPublish.expired
    ? songs.filter((song) => song.rights_status === "pending" && song.metadata_reviewed_at && song.popularity_rank).map((song) => song.id)
    : [];
  const selectable = [...toValidate, ...toPublish];
  const selectedToValidate = selected.filter((id) => toValidate.includes(id));
  const selectedToPublish = selected.filter((id) => toPublish.includes(id));
  const validUntil = bulkPublish ? new Date(`${bulkPublish.validUntil}T12:00:00`).toLocaleDateString("pt-BR") : "";

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <>
      {selectable.length > 0 && (
        <div className="catalog-bulk-review">
          <div>
            <strong>{toPublish.length ? "Validar e publicar em lote" : "Validar dados em lote"}</strong>
            <p>Confira as músicas desta página e selecione as corretas. Validar os dados não publica; a publicação é um passo separado.</p>
          </div>
          <div className="catalog-bulk-review-actions">
            {toValidate.length > 0 && <button className="button button-outline button-small" type="button" onClick={() => setSelected(toValidate)}>Selecionar dados a validar</button>}
            {toPublish.length > 0 && <button className="button button-outline button-small" type="button" onClick={() => setSelected(toPublish)}>Selecionar prontas para publicar</button>}
            {selected.length > 0 && <button className="button button-outline button-small" type="button" onClick={() => setSelected([])}>Limpar seleção</button>}
            {toValidate.length > 0 && (
              <form action={validateCatalogMetadataBatchAction}>
                <ListStateFields state={listState} />
                {selectedToValidate.map((id) => <input key={id} type="hidden" name="song_id" value={id} />)}
                <button className="button button-primary button-small" type="submit" disabled={selectedToValidate.length === 0}>Validar dados de {selectedToValidate.length}</button>
              </form>
            )}
          </div>
        </div>
      )}

      {bulkPublish && (
        <section className="panel catalog-bulk-publish">
          <h2>Publicação em lote: metadados factuais</h2>
          {bulkPublish.expired ? (
            <p>A autorização venceu em {validUntil}. Registre uma nova decisão antes de publicar em lote.</p>
          ) : (
            <>
              <p>Publica somente título, artista e gênero de músicas deste recorte com os dados já validados e <strong>sem cifra</strong>. Músicas com cifra precisam da publicação individual.</p>
              <dl>
                <dt>Referência</dt><dd>{bulkPublish.reference}</dd>
                <dt>Base e limites de uso</dt><dd>{bulkPublish.basis}</dd>
                <dt>Validade</dt><dd>até {validUntil}</dd>
              </dl>
              <form action={publishFactualMetadataBatchAction} className="catalog-bulk-publish-form">
                <ListStateFields state={listState} />
                {selectedToPublish.map((id) => <input key={id} type="hidden" name="song_id" value={id} />)}
                <label className="rights-confirmation">
                  <input name="rights_confirmed" type="checkbox" value="yes" required />
                  <span>Conferi as músicas selecionadas e confirmo que esta autorização cobre a exibição dos dados delas.</span>
                </label>
                <button className="button button-primary button-small" type="submit" disabled={selectedToPublish.length === 0}>Publicar {selectedToPublish.length} selecionada(s)</button>
              </form>
            </>
          )}
          <form action={withdrawFactualMetadataAuthorizationAction} className="catalog-bulk-withdraw">
            <ListStateFields state={listState} />
            <input type="hidden" name="withdraw_confirmed" value="yes" />
            <ConfirmSubmitButton
              className="button button-outline button-small"
              message="Retirar do catálogo público TODAS as músicas publicadas com esta autorização? Elas ficarão como contestadas e saem dos repertórios públicos."
            >
              Retirar todas publicadas com esta autorização
            </ConfirmSubmitButton>
          </form>
        </section>
      )}

      <div className="admin-license-list">
        {songs.map((song) => {
          const canSelect = selectable.includes(song.id);
          return (
            <article className="panel admin-license-card" key={song.id}>
              <div className="admin-license-heading">
                <div className="catalog-song-title">
                  {canSelect && <input type="checkbox" checked={selected.includes(song.id)} onChange={() => toggle(song.id)} aria-label={`Selecionar ${song.title}, ${song.artist}`} />}
                  <div><h2>{song.title}</h2><p>{song.artist} · {song.version_label}{song.popularity_rank ? ` · ${song.popularity_rank}ª mais ouvida` : ""}</p></div>
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
