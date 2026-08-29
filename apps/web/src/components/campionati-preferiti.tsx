"use client";

import { useMemo, useSyncExternalStore } from "react";

import { LeagueIdentity } from "@/components/league-identity";

export type VoceCampionato = Readonly<{
  id: number | null;
  nome: string | null;
  codice: string | null;
  gare: number;
}>;

/**
 * I campionati del giorno, con i preferiti in cima.
 *
 * **Perche' servono.** In un giorno pieno l'indice porta trentanove campionati: chi ne segue
 * tre li cerca ogni volta. La stella li fa salire, e non nasconde nulla: l'elenco resta
 * intero, cambia solo l'ordine.
 *
 * **Restano su questo dispositivo, e la pagina lo dice.** Legarli all'account vorrebbe dire
 * una tabella nuova sul livello dati in linea, che non si tocca senza una decisione
 * esplicita: finche' non c'e', prometterli «ovunque tu sia» sarebbe falso.
 *
 * **La memoria del browser e' uno stato esterno, e si legge come tale.** `useSyncExternalStore`
 * e' il modo previsto: il server rende sempre l'elenco nell'ordine naturale, il client
 * riordina quando conosce la memoria, e non c'e' nessun `setState` dentro un effetto.
 */
const CHIAVE = "iqstats.preferiti.campionati";

/** Nessun preferito: e' anche cio' che il server rende, che non ha una memoria da leggere. */
const VUOTO = "[]";

const ascoltatori = new Set<() => void>();

function sottoscrivi(avvisa: () => void): () => void {
  ascoltatori.add(avvisa);
  // L'evento nativo copre le altre schede; quelle stesse non lo ricevono, e per loro
  // bastano gli ascoltatori qui sopra.
  window.addEventListener("storage", avvisa);
  return () => {
    ascoltatori.delete(avvisa);
    window.removeEventListener("storage", avvisa);
  };
}

function istantanea(): string {
  try {
    return window.localStorage.getItem(CHIAVE) ?? VUOTO;
  } catch {
    // Memoria disabilitata o piena: nessun preferito, invece di far cadere l'indice.
    return VUOTO;
  }
}

function scrivi(valore: readonly number[]): void {
  try {
    window.localStorage.setItem(CHIAVE, JSON.stringify(valore));
  } catch {
    // Se la memoria non accetta, l'ordine vale per questa visita e basta.
  }
  for (const avvisa of ascoltatori) avvisa();
}

function elenco(grezzo: string): readonly number[] {
  try {
    const letto: unknown = JSON.parse(grezzo);
    return Array.isArray(letto) ? letto.filter((v): v is number => typeof v === "number") : [];
  } catch {
    return [];
  }
}

export function CampionatiPreferiti({ voci }: { readonly voci: readonly VoceCampionato[] }) {
  const grezzo = useSyncExternalStore(sottoscrivi, istantanea, () => VUOTO);
  const preferiti = useMemo(() => elenco(grezzo), [grezzo]);

  const ordinate = useMemo(() => {
    if (preferiti.length === 0) return voci;
    return [...voci].sort((a, b) => {
      const primo = a.id !== null && preferiti.includes(a.id) ? 0 : 1;
      const secondo = b.id !== null && preferiti.includes(b.id) ? 0 : 1;
      return primo - secondo;
    });
  }, [voci, preferiti]);

  return (
    <>
      <nav className="partite-index" aria-label="Vai a un campionato">
        {ordinate.map((v) => {
          const scelto = v.id !== null && preferiti.includes(v.id);
          return (
            <span className="partite-index-coppia" key={v.id ?? "altre"}>
              <a className="partite-index-link" href={`#lega-${v.id ?? "altre"}`}>
                <LeagueIdentity leagueId={v.id} name={v.nome ?? "Altre"} code={v.codice} size="sm" />
                <i>{v.gare}</i>
              </a>
              {v.id === null ? null : (
                <button
                  type="button"
                  className={scelto ? "partite-stella is-scelta" : "partite-stella"}
                  aria-pressed={scelto}
                  aria-label={scelto
                    ? `Togli ${v.nome ?? "questo campionato"} dai preferiti`
                    : `Metti ${v.nome ?? "questo campionato"} fra i preferiti`}
                  onClick={() => {
                    const id = v.id as number;
                    scrivi(scelto ? preferiti.filter((x) => x !== id) : [...preferiti, id]);
                  }}
                >
                  {scelto ? "★" : "☆"}
                </button>
              )}
            </span>
          );
        })}
      </nav>
      {/* Dove restano si dice sempre, non solo quando ce n'e' uno: e' una promessa, e una
          promessa non dichiarata si scopre solo cambiando telefono. */}
      <p className="partite-preferiti-nota">
        La stella fa salire un campionato in cima all&apos;elenco. I preferiti restano{" "}
        <b>su questo dispositivo</b>: non seguono l&apos;account.
      </p>
    </>
  );
}
