import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CursoreSoglia } from "@/components/cursore-soglia";
import { ProductShell } from "@/components/product-shell";
import {
  MINUTI_IN_CACHE,
  MOSTRATI,
  RUOLI,
  SCHEDE,
  gareDaGiocareOggi,
  giocatoriDelGiorno,
  type Richiesta,
} from "@/server/iqstats/giocatori-del-giorno";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Giocatori delle gare di oggi",
  description:
    "Marcatori, ammoniti e falli fra i giocatori delle gare di oggi, sulle soglie che scegli "
    + "tu, con il campione scritto accanto a ogni numero.",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** I minuti di stagione sotto cui un per 90' e' troppo rumoroso anche corretto. */
const MINUTI = { minimo: MINUTI_IN_CACHE, massimo: 1800, passo: 90, predefinito: 180 } as const;

function scalare(valore: string | string[] | undefined): string {
  return typeof valore === "string" ? valore : "";
}

/** Un numero dall'indirizzo, dentro i suoi limiti; se non c'e' o non e' un numero, il predefinito. */
function numero(testo: string, minimo: number, massimo: number, predefinito: number): number {
  if (testo === "") return predefinito;
  const valore = Number(testo);
  return Number.isFinite(valore) ? Math.min(massimo, Math.max(minimo, valore)) : predefinito;
}

function cifra(valore: number): string {
  return valore.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function orario(iso: string): string {
  return new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome",
  });
}

export default async function GiocatoriOggiPage({ searchParams }: Props) {
  const parametri = await searchParams;
  const scheda = SCHEDE.find((s) => s.chiave === scalare(parametri.scheda)) ?? SCHEDE[0]!;
  const ruolo = RUOLI.find((r) => r.chiave === scalare(parametri.ruolo))?.chiave ?? null;
  const oggi = await gareDaGiocareOggi();
  const legaChiesta = Number(scalare(parametri.lega));
  const lega = oggi.leghe.find((l) => l.id === legaChiesta)?.id ?? null;
  const richiesta: Richiesta = {
    scheda,
    valori: scheda.soglie.map((s) =>
      numero(scalare(parametri[s.chiave]), 0, s.massimo, s.predefinita)),
    minutiMinimi: numero(
      scalare(parametri.minuti), MINUTI.minimo, MINUTI.massimo, MINUTI.predefinito,
    ),
    ruolo,
    leagueId: lega,
  };
  // Lo stato dei cursori riparte da capo a ogni richiesta diversa, compreso «Azzera».
  const chiaveModulo = JSON.stringify([scheda.chiave, richiesta.valori, richiesta.minutiMinimi, ruolo, lega]);

  return (
    <ProductShell activeSection="teams">
      <section className="oggi" aria-labelledby="giocatori-oggi-title">
        <div className="oggi-eyebrow">
          <span className="oggi-kick">Giocatori</span>
          <span className="oggi-line" aria-hidden="true" />
          <span className="oggi-src">
            {oggi.gare.length} gare ancora da giocare oggi
          </span>
        </div>

        <h1 id="giocatori-oggi-title" className="squad-title">
          I giocatori delle gare di oggi
        </h1>
        <p className="home-lede">
          Scegli che cosa cerchi e fin dove. Ogni numero è ogni 90 minuti di stagione, corretto
          sul campione verso la media della sua squadra, con il valore grezzo accanto.
        </p>

        <nav className="partite-index filtro-schede" aria-label="Che cosa cerchi">
          {SCHEDE.map((s) => (
            <Link
              className="partite-index-link"
              key={s.chiave}
              href={`/giocatori/oggi?scheda=${s.chiave}${lega === null ? "" : `&lega=${lega}`}`}
              aria-current={s.chiave === scheda.chiave ? "page" : undefined}
            >
              {s.nome}
            </Link>
          ))}
        </nav>

        <form className="filtro" method="get" action="/giocatori/oggi" key={chiaveModulo}>
          <input type="hidden" name="scheda" value={scheda.chiave} />
          {scheda.soglie.map((s, i) => (
            <CursoreSoglia
              key={s.chiave}
              nome={s.chiave}
              etichetta={s.nome}
              massimo={s.massimo}
              passo={s.passo}
              valore={richiesta.valori[i]!}
            />
          ))}
          <CursoreSoglia
            nome="minuti"
            etichetta="Minuti giocati in stagione"
            minimo={MINUTI.minimo}
            massimo={MINUTI.massimo}
            passo={MINUTI.passo}
            valore={richiesta.minutiMinimi}
            unita="'"
          />
          <div className="filtro-scelte">
            <div className="signals-field">
              <label htmlFor="filtro-ruolo">Ruolo</label>
              <select id="filtro-ruolo" name="ruolo" defaultValue={ruolo ?? ""}>
                <option value="">Tutti</option>
                {RUOLI.map((r) => <option key={r.chiave} value={r.chiave}>{r.nome}</option>)}
              </select>
            </div>
            <div className="signals-field">
              <label htmlFor="filtro-lega">Campionato</label>
              <select id="filtro-lega" name="lega" defaultValue={lega ?? ""}>
                <option value="">Tutti</option>
                {oggi.leghe.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="filtro-azioni">
            <Link className="filtro-azzera" href={`/giocatori/oggi?scheda=${scheda.chiave}`}>
              Azzera
            </Link>
            <button className="filtro-cerca" type="submit">Cerca</button>
          </div>
        </form>

        {scheda.chiave === "ammoniti" ? (
          <p className="filtro-nota">
            <b>Un ritardo lungo non rende il giallo più probabile.</b> Su 162.934 casi, a parità
            di gialli ogni 90&apos;, chi è da più gare senza cartellino ne prende meno, non di
            più. Per questo le gare dall&apos;ultimo giallo sono scritte in ogni riga, ma non
            sono un filtro.
          </p>
        ) : null}

        <Suspense
          fallback={
            <p className="filtro-attesa" role="status">
              Leggo le rose delle squadre in campo oggi…
            </p>
          }
        >
          <Risultati richiesta={richiesta} />
        </Suspense>
      </section>
    </ProductShell>
  );
}

async function Risultati({ richiesta }: Readonly<{ richiesta: Richiesta }>) {
  const esito = await giocatoriDelGiorno(richiesta);
  const mostrati = esito.trovati.slice(0, MOSTRATI);

  if (esito.gare === 0) {
    return (
      <div className="oggi-empty">
        <h2>Nessuna gara ancora da giocare oggi</h2>
        <p>
          {esito.elencoParziale
            ? "L'elenco delle gare non è arrivato completo dalla fonte: riprova fra qualche minuto."
            : "Le gare di oggi sono cominciate o finite, oppure in questo campionato oggi non si gioca."}
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="filtro-conto" role="status">
        <b>{esito.trovati.length}</b>{" "}
        {esito.trovati.length === 1 ? "giocatore passa" : "giocatori passano"} i filtri
        {esito.trovati.length > MOSTRATI ? `, qui i primi ${MOSTRATI}` : ""}.
      </p>

      {mostrati.length === 0 ? (
        <div className="oggi-empty">
          <h2>Nessuno arriva a queste soglie</h2>
          <p>Abbassa un cursore o i minuti di stagione, oppure togli il ruolo o il campionato.</p>
        </div>
      ) : (
        <ol className="filtro-lista">
          {mostrati.map((g) => {
            const prima = g.misure[0]!;
            return (
              <li className="uomini-riga filtro-riga" key={`${g.gara.id}-${g.giocatoreId}`}>
                <Link className="uomini-nome" href={`/giocatori/${g.giocatoreId}`}>{g.nome}</Link>
                <span className="uomini-cifre">
                  <b>{cifra(prima.corretto)}</b>
                  <span className="uomini-unita">{prima.nome.toLowerCase()}</span>
                </span>
                <span className="uomini-nota">
                  {g.squadra} {g.casa ? "in casa con" : "in trasferta con"}{" "}
                  <Link href={`/match/${g.gara.id}`}>{g.avversario}</Link>
                  {" · "}{orario(g.gara.inizio)}
                  {g.gara.lega ? ` · ${g.gara.lega}` : ""}
                </span>
                <span className="filtro-perche">
                  <b>Perché è qui.</b>{" "}
                  {g.misure.map((m, i) => (
                    <span key={m.nome}>
                      {i > 0 ? "; " : ""}
                      {m.nome} {cifra(m.corretto)}
                      {m.scelta ? `, sopra la soglia di ${cifra(richiesta.valori[i]!)}` : ""}
                      {" "}(grezzo {cifra(m.grezzo)}
                      {m.totale !== null ? `, ${m.totale.toLocaleString("it-IT")} in stagione` : ""})
                    </span>
                  ))}
                  . Campione: {g.presenze} presenze, {g.minuti.toLocaleString("it-IT")} minuti.
                  {richiesta.scheda.chiave === "ammoniti"
                    ? g.ultimoGiallo === null
                      ? " Nessun giallo nelle gare lette."
                      : g.ultimoGiallo === 0
                        ? " Ultimo giallo nell'ultima presenza."
                        : ` Ultimo giallo ${g.ultimoGiallo} ${g.ultimoGiallo === 1 ? "presenza" : "presenze"} fa.`
                    : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <p className="dossier-src">
        Fonte: rose di stagione della fonte, righe per gara, lette oggi {esito.data} ·{" "}
        {esito.gare} gare, {esito.rose - esito.roseMancanti} rose su {esito.gare * 2}
        {esito.roseMancanti > 0 ? ` (${esito.roseMancanti} non arrivate: quelle squadre mancano)` : ""}
        {esito.elencoParziale ? " · elenco gare incompleto" : ""}. I gialli per giocatore della
        fonte perdono il 4-5% dei cartellini rispetto alla cronaca della gara, misurato il 18
        settembre 2026. La correzione avvicina un per 90&apos; alla media della sua squadra
        quanto più il campione è piccolo, con un peso di tre gare.
      </p>
    </>
  );
}
