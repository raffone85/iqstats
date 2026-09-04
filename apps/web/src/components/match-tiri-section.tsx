import { affidabilita } from "@/lib/affidabilita";
import type { DaDoveTirano, ProfiloDiTiro, VoceDiTiro } from "@/server/iqstats/tiri-mappa";

/** Percentuale o metri, come si legge: 63% e 17,7 m, non 0,6312 e 17,742. */
function cifra(v: VoceDiTiro, valore: number): string {
  return v.quota
    ? `${Math.round(valore * 100)}%`
    : `${valore.toFixed(v.chiave === "peso" ? 2 : 1).replace(".", ",")}${v.chiave === "distanza" ? " m" : ""}`;
}

/**
 * Le tre voci di una squadra, ciascuna con il suo metro accanto.
 *
 * **Il numero da solo non dice niente.** Una quota del 63% di conclusioni dall'area e'
 * alta o bassa a seconda di come si tira in quella competizione, quindi il metro sta
 * sempre nella stessa riga. Dove lo scarto non supera l'errore la riga porta il numero
 * e tace: la parola compare solo quando i numeri la reggono.
 */
function Voci({ profilo }: { readonly profilo: ProfiloDiTiro }) {
  return (
    <div className="dossier-recent">
      <p className="engine-metric">
        {profilo.nome}
        <span className="engine-obs">
          {profilo.gare} gare · {profilo.tiri} tiri
          {affidabilita(profilo.gare) === null ? null : ` · ${affidabilita(profilo.gare)}`}
        </span>
      </p>
      <ul className="engine-splits">
        {profilo.voci.map((v) => (
          <li className="engine-split" key={v.chiave}>
            <span className="affronto-parola">{v.nome}</span>
            <span className="affronto-prova-fonte">
              {cifra(v, v.valore)} · media della lega {cifra(v, v.metro)}
              {v.parola === null ? <> · dentro l&apos;errore</> : <> · {v.parola}</>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * **Da dove tirano.** Non quanto concludono - quello lo dice gia' «Come si affrontano» -
 * ma da dove: quanto vicino, quanto pesa il tiro, quanto vive di palla ferma.
 *
 * **Il verdetto in cima e' il punto.** Chi apre la gara deve capire per prima cosa che
 * partita sara': una squadra che tira da fuori contro una che cerca l'area e' una gara
 * diversa da due che fanno la stessa cosa. I numeri sotto reggono quella frase.
 *
 * **Da dati gia' archiviati**, che il motore usa gia' come feature e che la pagina non
 * mostrava: nessuna chiamata nuova alla fonte.
 */
export function MatchTiriSection({ tiri }: { readonly tiri: DaDoveTirano | null }) {
  if (tiri === null) return null;
  return (
    <section className="dossier-panel" aria-labelledby="tiri-title">
      <p className="dossier-kick">Da dove tirano</p>
      <h2 id="tiri-title" className="squad-section-title">{tiri.titolo}</h2>

      <Voci profilo={tiri.casa} />
      <Voci profilo={tiri.trasferta} />

      <p className="affronto-nota">
        Dalla mappa dei tiri delle gare già giocate, con la posizione di ogni conclusione:
        sono partite avvenute, non una previsione, e non entrano in nessun mercato. Il
        confronto è con la media della competizione nello stesso periodo, perché una quota
        non è alta o bassa in assoluto. Dove lo scarto da quella media non supera l&apos;errore
        la riga lo dichiara. La quota di tiri respinti resta fuori: è la meno stabile delle
        sei e la più difficile da leggere.
      </p>
    </section>
  );
}
