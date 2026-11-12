"use client";

import { useEffect, useRef } from "react";

const STORAGE_KEY = "cardapio:nome-pedido";

// One optional name field for every request button on the page. It fills the
// hidden `requester_name` input of each request form and is remembered on this
// device only, so regulars do not retype it.
function syncForms(value: string) {
  document.querySelectorAll<HTMLInputElement>("input[data-requester-name]").forEach((input) => {
    input.value = value;
  });
}

export function RequesterNameField() {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let saved = "";
    try { saved = localStorage.getItem(STORAGE_KEY) ?? ""; } catch { /* armazenamento indisponível */ }
    if (saved && input.current && !input.current.value) input.current.value = saved;
    syncForms(input.current?.value ?? "");
  }, []);

  return (
    <label className="requester-name-field">
      <span>Seu nome ou recado (opcional)</span>
      <input
        ref={input}
        type="text"
        maxLength={60}
        autoComplete="given-name"
        placeholder="Ex.: Ana, mesa 4"
        onInput={(event) => {
          const value = event.currentTarget.value;
          syncForms(value);
          try { localStorage.setItem(STORAGE_KEY, value.trim()); } catch { /* armazenamento indisponível */ }
        }}
      />
      <small>Aparece para o músico junto com o pedido.</small>
    </label>
  );
}
