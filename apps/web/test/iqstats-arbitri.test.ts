// Prove d'integrazione dell'area Arbitri: girano solo con una connessione al livello dati.
//
// Senza `IQSTATS_PROJECTION_DATABASE_URL` si saltano invece di fallire, come fa
// `test:projection-store`: un test che non puo' girare non deve diventare un rosso che
// nessuno sa spiegare.
//
// Quello che verificano non e' «il numero e' questo» — cambia a ogni passata — ma che gli
// invarianti reggano: campione sopra la soglia, medie non negative, posizione dentro la
// scala, e la somma dei due lati che torna al totale.
import assert from "node:assert/strict";
import test from "node:test";

import {
  classificaArbitri,
  competizioniConArbitri,
  profiloArbitro,
} from "../src/server/iqstats/referees.ts";

const COLLEGATO = Boolean(process.env.IQSTATS_PROJECTION_DATABASE_URL?.trim());
const opzioni = { skip: COLLEGATO ? false : "serve IQSTATS_PROJECTION_DATABASE_URL" };

test("le competizioni hanno almeno tre arbitri e gare coerenti", opzioni, async () => {
  const competizioni = await competizioniConArbitri();
  assert.ok(competizioni.length > 0, "nessuna competizione: il livello dati non risponde?");
  for (const c of competizioni) {
    assert.ok(c.arbitri >= 3, `${c.nome} ha ${c.arbitri} arbitri, sotto la soglia dichiarata`);
    assert.ok(c.gare >= c.arbitri * 5, `${c.nome}: ${c.gare} gare per ${c.arbitri} arbitri`);
    assert.ok(c.nome.length > 0);
  }
});

test("la classifica rispetta la soglia e l'ordine dichiarati", opzioni, async () => {
  const competizioni = await competizioniConArbitri();
  const classifica = await classificaArbitri(competizioni[0].sourceId, "gialli");
  assert.ok(classifica.length >= 3);
  for (const r of classifica) {
    assert.ok(r.gare >= 5, `${r.nome} ha ${r.gare} gare, sotto le cinque dichiarate`);
    assert.ok(r.falli >= 0 && r.gialli >= 0 && r.rossi >= 0, `${r.nome} ha una media negativa`);
    // Un nome che resta segnaposto vuol dire anagrafica non caricata: la pagina lo
    // mostrerebbe cosi' com'e', ed e' esattamente cio' che non deve succedere.
    assert.ok(!r.nome.includes("segnaposto"), `${r.nome}: anagrafica non caricata`);
  }
  for (let i = 1; i < classifica.length; i += 1) {
    assert.ok(
      classifica[i].gialli <= classifica[i - 1].gialli,
      `ordine rotto fra ${classifica[i - 1].nome} e ${classifica[i].nome}`,
    );
  }
});

test("il profilo torna coerente con la sua classifica", opzioni, async () => {
  const competizioni = await competizioniConArbitri();
  const classifica = await classificaArbitri(competizioni[0].sourceId, "gialli");
  const primo = classifica[0];
  const p = await profiloArbitro(primo.sourceId);

  assert.ok(p !== null, `profilo mancante per ${primo.nome}`);
  assert.equal(p.nome, primo.nome);
  assert.ok(p.gare >= 5);

  // I due lati sono una scomposizione del totale, non due misure indipendenti.
  const sommaFalli = p.falliControCasa + p.falliControTrasferta;
  assert.ok(
    Math.abs(sommaFalli - p.media.falli) < 1e-6,
    `casa ${p.falliControCasa} + ospite ${p.falliControTrasferta} != totale ${p.media.falli}`,
  );
  const sommaGialli = p.gialliControCasa + p.gialliControTrasferta;
  assert.ok(Math.abs(sommaGialli - p.media.gialli) < 1e-6);

  for (const posizione of [p.posizioneFalli, p.posizioneGialli]) {
    if (posizione === null) continue;
    assert.ok(posizione.quota >= 0 && posizione.quota <= 1, `quota ${posizione.quota}`);
    assert.ok(posizione.colleghi >= 3);
  }

  // Chi guida la classifica dei gialli deve stare in alto anche nella sua posizione.
  if (p.posizioneGialli !== null) {
    assert.ok(
      p.posizioneGialli.quota >= 0.5,
      `il primo per gialli sta al ${Math.round(p.posizioneGialli.quota * 100)}%`,
    );
  }
});

test("lo storico non supera le gare dichiarate", opzioni, async () => {
  const competizioni = await competizioniConArbitri();
  const classifica = await classificaArbitri(competizioni[0].sourceId, "falli");
  const p = await profiloArbitro(classifica[0].sourceId);
  assert.ok(p !== null);
  assert.ok(p.storico.length > 0, "un arbitro con gare deve avere uno storico");
  assert.ok(p.storico.length <= p.gare, "lo storico non puo' avere piu' righe delle gare");
  for (const g of p.storico) {
    assert.ok(g.casa.length > 0 && g.trasferta.length > 0);
    assert.ok(g.falli >= 0 && g.gialli >= 0 && g.rossi >= 0);
  }
  // Ordinato dalla piu' recente: e' quello che la pagina promette.
  for (let i = 1; i < p.storico.length; i += 1) {
    assert.ok(p.storico[i].quando <= p.storico[i - 1].quando, "storico fuori ordine");
  }
});

test("un arbitro che non esiste non diventa un profilo vuoto", opzioni, async () => {
  assert.equal(await profiloArbitro(999_999_999), null);
});
