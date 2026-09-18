"use client";

import { useState } from "react";

/**
 * Un cursore dentro un modulo `GET`: il valore viaggia con il modulo anche senza
 * JavaScript. Il client serve solo a scrivere la cifra mentre la si sposta.
 */
export function CursoreSoglia({
  nome,
  etichetta,
  minimo = 0,
  massimo,
  passo,
  valore,
  unita,
}: Readonly<{
  nome: string;
  etichetta: string;
  /** Sopra lo zero la soglia e' sempre attiva: non esiste «nessun filtro». */
  minimo?: number;
  massimo: number;
  passo: number;
  valore: number;
  unita?: string;
}>) {
  const [attuale, setAttuale] = useState(valore);
  const id = `cursore-${nome}`;
  return (
    <div className="cursore">
      <label htmlFor={id}>{etichetta}</label>
      <output htmlFor={id} className="cursore-valore">
        {attuale === 0 ? "nessun filtro" : `almeno ${attuale.toLocaleString("it-IT", { minimumFractionDigits: passo < 1 ? 2 : 0 })}${unita ?? ""}`}
      </output>
      <input
        id={id}
        name={nome}
        type="range"
        min={minimo}
        max={massimo}
        step={passo}
        value={attuale}
        onChange={(evento) => setAttuale(Number(evento.target.value))}
      />
    </div>
  );
}
