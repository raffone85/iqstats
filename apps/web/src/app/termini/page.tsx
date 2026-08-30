import type { Metadata } from "next";
import Link from "next/link";

import { ProductShell } from "@/components/product-shell";
import { LEGALE_AGGIORNATO, TITOLARE, TITOLARE_COMPLETO } from "@/lib/titolare";

export const metadata: Metadata = {
  title: "Termini di servizio",
  description:
    "Che cos'è IQstatS e che cosa non è, come funzionano account e abbonamento, che cosa non promettiamo e come si chiude.",
};

/**
 * I termini dicono quello che Stripe fa davvero, che e' il criterio del piano.
 * Oggi Stripe e' in modalita' di prova: nessun addebito reale passa, e la pagina lo
 * scrive invece di descrivere un pagamento che non avviene. Quando la modalita' cambia,
 * cambia anche la sezione «Abbonamento e pagamenti».
 */
export default function TerminiPage() {
  return (
    <ProductShell activeSection="legal">
      <section className="page-intro" aria-labelledby="termini-title">
        <p className="eyebrow">Termini di servizio</p>
        <h1 id="termini-title">Che cosa ti diamo, e che cosa non ti promettiamo.</h1>
        <p>
          IQstatS pubblica analisi statistiche sul calcio. Non è un servizio di scommesse,
          non vende pronostici garantiti e non accetta giocate. Usando il sito accetti quanto
          segue. Aggiornati al {LEGALE_AGGIORNATO}.
        </p>
      </section>

      <article className="legale">
        {!TITOLARE_COMPLETO && (
          <p className="legale-mancante" role="note">
            <b>Questa pagina non è ancora completa.</b> Il nome di chi fornisce il servizio e
            il suo indirizzo email non sono stati inseriti. Finché mancano, questi termini non
            vanno considerati pubblicati.
          </p>
        )}

        <h2>Chi fornisce il servizio</h2>
        <p>
          IQstatS è fornito da{" "}
          {TITOLARE.nome === "" ? (
            <b>non ancora dichiarato in questa pagina</b>
          ) : (
            <b>{TITOLARE.nome}</b>
          )}
          , persona fisica. Assistenza su Telegram:{" "}
          <a href={TITOLARE.telegramUrl}>@{TITOLARE.telegram}</a>
          {TITOLARE.email !== "" && (
            <>
              {" "}
              o all&apos;indirizzo <a href={`mailto:${TITOLARE.email}`}>{TITOLARE.email}</a>
            </>
          )}
          .
        </p>

        <h2>Che cosa è, e che cosa non è</h2>
        <ul className="legale-elenco">
          <li>È un servizio di analisi: numeri calcolati su partite passate, con dichiarata la fonte, la freschezza e il campione su cui poggiano.</li>
          <li>Non è un consiglio di scommessa, non è una previsione garantita e non è consulenza finanziaria.</li>
          <li>Non accetta giocate, non le inoltra a nessuno e non rimanda a operatori di gioco.</li>
          <li>È vietato ai minori di diciotto anni.</li>
        </ul>

        <h2>Account</h2>
        <p>
          Si entra con un codice a sei cifre inviato al tuo indirizzo email: non c&apos;è una
          password da custodire, ma la casella di posta diventa la chiave dell&apos;account, e
          tenerla al sicuro tocca a te. L&apos;account è personale: le credenziali non si
          condividono e l&apos;accesso non si rivende.
        </p>

        <h2>Abbonamento e pagamenti</h2>
        <p>
          <b>Oggi nessun pagamento reale viene incassato.</b> Il sistema di pagamento è
          collegato in modalità di prova: la pagina dell&apos;abbonamento mostra i piani e il
          percorso di acquisto funziona, ma non produce alcun addebito. Quando i pagamenti
          verranno attivati davvero, questa pagina lo dirà prima.
        </p>
        <p>
          Quando saranno attivi: l&apos;abbonamento si rinnova da sé alla scadenza del
          periodo, il prezzo è quello mostrato al momento dell&apos;acquisto e la disdetta si
          fa dal portale di fatturazione raggiungibile dal tuo profilo. Una disdetta ferma il
          rinnovo successivo e lascia attivo il periodo già pagato.
        </p>
        <p>
          <b>Recesso.</b> Come consumatore hai quattordici giorni per ripensarci. Chiedendo di
          usare subito il servizio, e ottenendolo, quel diritto si esaurisce per la parte già
          fruita: è la regola dei contratti a distanza sui contenuti digitali, e te la
          ricordiamo qui invece di lasciarla implicita.
        </p>

        <h2>Che cosa non promettiamo</h2>
        <ul className="legale-elenco">
          <li>Nessun risultato. Una frequenza osservata su cento partite passate non dice che cosa succederà stasera.</li>
          <li>Nessuna continuità assoluta del servizio: dipende da fornitori terzi e può interrompersi.</li>
          <li>Nessuna garanzia sui dati di partenza. Arrivano da una fonte esterna, e quando mancano lo dichiariamo invece di riempirli.</li>
          <li>Le sezioni che non hanno dati spariscono o dichiarano l&apos;assenza. Non è un difetto: è la regola.</li>
        </ul>

        <h2>Come si usa, e come no</h2>
        <ul className="legale-elenco">
          <li>Puoi consultare, leggere e usare i numeri per farti un&apos;idea.</li>
          <li>Non puoi estrarre i contenuti in massa con strumenti automatici, né rivenderli o ripubblicarli come tuoi.</li>
          <li>Non puoi tentare di aggirare i limiti tecnici, i controlli di accesso o le funzioni riservate agli abbonati.</li>
        </ul>

        <h2>Sospensione e chiusura</h2>
        <p>
          Puoi chiudere il tuo account quando vuoi scrivendo al canale di assistenza. Possiamo
          sospendere un account che usa il servizio contro queste regole, dopo avertelo detto,
          salvo i casi in cui il danno sia già in corso.
        </p>

        <h2>Responsabilità</h2>
        <p>
          Rispondiamo dei danni causati da nostro dolo o colpa grave, e di quanto la legge non
          consente di escludere. Restano fuori le perdite legate a decisioni di gioco prese
          leggendo queste pagine: il servizio pubblica analisi, non inviti a giocare.
        </p>

        <h2>Legge e foro</h2>
        <p>
          Si applica la legge italiana. Se sei un consumatore, resta competente il giudice del
          luogo in cui risiedi o hai domicilio, e restano salve le tutele che la legge ti
          riconosce a prescindere da questi termini.
        </p>

        <h2>Se questi termini cambiano</h2>
        <p>
          La data in cima dice quando sono stati rivisti. Un cambiamento che tocca prezzo,
          durata o contenuto dell&apos;abbonamento viene comunicato prima che diventi
          efficace, e ti lascia libero di disdire.
        </p>

        <p className="legale-vicino">
          Vedi anche l&apos;<Link href="/privacy">informativa privacy</Link> e il{" "}
          <Link href="/metodo">metodo</Link>.
        </p>
      </article>
    </ProductShell>
  );
}
