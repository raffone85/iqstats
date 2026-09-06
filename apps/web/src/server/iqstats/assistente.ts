// Server-only: l'assistente che risponde soltanto con numeri che una pagina sa gia' mostrare.
//
// **Non genera testo e non genera numeri, e non e' una limitazione: e' il criterio.** La
// voce 19 del piano chiede che l'assistente risponda solo con numeri che la pagina saprebbe
// mostrare. Un modello che scrive la risposta puo' sempre inventare una cifra, e servirebbe
// una guardia da misurare; qui la domanda sceglie **quale** scheda mostrare, e i numeri
// escono dalle stesse funzioni che disegnano le pagine. Inventare e' impossibile perche'
// niente viene scritto: viene solo scelto.
//
// **Quello che non capisce lo dice.** Nessuna risposta approssimata, nessun «forse
// intendevi»: se la domanda non corrisponde a una scheda, l'assistente lo dichiara e mostra
// le tre cose che sa fare. Una risposta vaga sarebbe peggio di nessuna risposta.
import "server-only";

import { cerca } from "./ricerca.ts";
import { profiloArbitro } from "./referees.ts";
import { profiloSquadra } from "./team-stats.ts";

export interface RigaDiRisposta {
  readonly etichetta: string;
  readonly valore: string;
  /** Il campione, o la finestra: un numero senza il suo campione non si mostra. */
  readonly nota: string | null;
}

export interface Risposta {
  /** Falso quando la domanda non corrisponde a nessuna scheda: si dichiara, non si indovina. */
  readonly capito: boolean;
  readonly titolo: string;
  readonly righe: readonly RigaDiRisposta[];
  /** La pagina che mostra questi stessi numeri per esteso. */
  readonly collegamento: { readonly href: string; readonly testo: string } | null;
  readonly spiegazione: string;
}

/** Le parole che nominano un arbitro. Se compaiono, la domanda riguarda chi dirige. */
const PAROLE_ARBITRO = ["arbitro", "arbitra", "direttore", "fischia", "designato"];

function normalizza(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Il nome cercato dentro la domanda.
 *
 * Non si prova a capire la frase: si tolgono le parole di servizio e si cerca cio' che
 * resta. E' grezzo, e lo e' apposta - un riconoscitore piu' furbo sbaglierebbe in silenzio,
 * mentre questo o trova un'entita' che esiste nel nostro livello dati o non trova niente.
 */
const PAROLE_DI_SERVIZIO = new Set([
  "come", "quanto", "quanti", "quante", "quale", "quali", "chi", "cosa", "che", "dove",
  "e", "ed", "il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "di", "del", "della",
  "dei", "delle", "da", "in", "con", "su", "per", "tra", "fra", "a", "al", "allo", "alla",
  "ai", "agli", "alle", "sta", "stanno", "fa", "fanno", "gioca", "giocano", "va", "vanno",
  "mi", "dimmi", "dammi", "sai", "puoi", "dire", "sapere", "media", "medie", "statistiche",
  "numeri", "dati", "stagione", "partita", "partite", "gara", "gare", "squadra", "squadre",
  // I nomi dei bersagli sono parole del dominio, non nomi propri: senza queste, «quanti
  // falli fischia Orsato» cercava «falli orsato» e non trovava nessuno. Trovato provando
  // domande vere, non leggendo il codice.
  "falli", "fallo", "gialli", "giallo", "cartellini", "cartellino", "rossi", "rosso",
  "tiri", "tiro", "corner", "parate", "parata", "fuorigioco", "gol", "reti", "porta",
  ...PAROLE_ARBITRO,
]);

export function nomeCercato(domanda: string): string {
  return normalizza(domanda)
    .split(" ")
    .filter((parola) => parola.length > 1 && !PAROLE_DI_SERVIZIO.has(parola))
    .join(" ");
}

function numero(valore: number, cifre: number): string {
  return valore.toFixed(cifre).replace(".", ",");
}

const NON_CAPITO: Risposta = {
  capito: false,
  titolo: "Questa non la so leggere",
  righe: [
    { etichetta: "Come arbitra un direttore di gara", valore: "«come arbitra Maresca»", nota: null },
    { etichetta: "Che numeri fa una squadra", valore: "«come sta il Napoli»", nota: null },
    { etichetta: "Chi guida un campionato", valore: "dalla rosa di una squadra, voce «Giocatori»", nota: null },
  ],
  collegamento: { href: "/cerca", testo: "Cerca una squadra o un arbitro" },
  spiegazione:
    "Rispondo soltanto con numeri che una pagina di IQstatS sa già mostrare, e li prendo da "
    + "lì: quando non riconosco la domanda lo dico, invece di rispondere qualcosa di simile.",
};

/**
 * La risposta a una domanda, o la dichiarazione di non averla capita.
 *
 * L'ordine dei tentativi non e' casuale: prima l'arbitro, perche' la domanda lo nomina con
 * parole sue («arbitra», «fischia»), poi la squadra, che e' il caso generale.
 */
export async function rispondi(domanda: string): Promise<Risposta> {
  const testo = normalizza(domanda);
  if (testo.length < 3) return NON_CAPITO;

  const nome = nomeCercato(domanda);
  if (nome.length < 2) return NON_CAPITO;

  const trovati = await cerca(nome);
  const chiedeArbitro = PAROLE_ARBITRO.some((parola) => testo.includes(parola));

  if (chiedeArbitro && trovati.arbitri.length > 0) {
    const scelto = trovati.arbitri[0];
    const profilo = await profiloArbitro(scelto.sourceId);
    if (profilo === null) {
      return {
        capito: true,
        titolo: `${scelto.nome} non ha ancora numeri`,
        righe: [],
        collegamento: { href: `/arbitri/${scelto.sourceId}`, testo: "Apri la scheda" },
        spiegazione:
          "L'arbitro esiste nel nostro archivio ma non ha abbastanza gare dirette perché una "
          + "media dica qualcosa. Nessun numero viene stimato al suo posto.",
      };
    }
    return {
      capito: true,
      titolo: `${profilo.nome}, in ${profilo.competizione}`,
      righe: [
        {
          etichetta: "Cartellini gialli a gara",
          valore: numero(profilo.media.gialli, 2),
          nota: `su ${profilo.gare} gare dirette`,
        },
        {
          etichetta: "Falli fischiati a gara",
          valore: profilo.media.falli === null ? "—" : numero(profilo.media.falli, 1),
          nota: profilo.media.falli === null ? "la competizione non porta i falli" : null,
        },
        {
          etichetta: "Falli contro la squadra di casa",
          valore: numero(profilo.falliControCasa, 1),
          nota: `contro ${numero(profilo.falliControTrasferta, 1)} all'ospite`,
        },
      ],
      collegamento: { href: `/arbitri/${profilo.sourceId}`, testo: "Tutta la scheda dell'arbitro" },
      spiegazione:
        "Sono le nostre osservazioni sulle gare che ha diretto, le stesse che la sua scheda "
        + "mostra per esteso, con il metro dei colleghi della stessa competizione.",
    };
  }

  if (trovati.squadre.length > 0) {
    const scelta = trovati.squadre[0];
    const profilo = await profiloSquadra(scelta.sourceId);
    if (profilo === null) {
      return {
        capito: true,
        titolo: `${scelta.nome} non ha ancora numeri`,
        righe: [],
        collegamento: { href: `/squadre/${scelta.sourceId}`, testo: "Apri la scheda" },
        spiegazione:
          "La squadra esiste nel nostro archivio ma non ha abbastanza gare osservate perché "
          + "una media dica qualcosa. Nessun numero viene stimato al suo posto.",
      };
    }
    const principali = profilo.voci.filter((voce) => voce.gruppo === "principale").slice(0, 4);
    return {
      capito: true,
      titolo: `${profilo.nome}, ultime ${profilo.gare} gare osservate`,
      righe: principali.map((voce) => ({
        etichetta: voce.nome,
        valore: voce.percentuale ? `${numero(voce.media, 1)}%` : numero(voce.media, 1),
        nota: `su ${voce.campione} ${voce.campione === 1 ? "gara" : "gare"}`,
      })),
      collegamento: { href: `/squadre/${profilo.sourceId}`, testo: "Tutta la scheda squadra" },
      spiegazione:
        "Sono le nostre osservazioni sulle sue gare, le stesse che la scheda squadra mostra "
        + `per esteso, dal ${profilo.dal.slice(0, 10)} al ${profilo.al.slice(0, 10)}.`,
    };
  }

  return NON_CAPITO;
}
