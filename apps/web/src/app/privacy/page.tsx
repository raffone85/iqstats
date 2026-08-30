import type { Metadata } from "next";
import Link from "next/link";

import { ProductShell } from "@/components/product-shell";
import { LEGALE_AGGIORNATO, TITOLARE, TITOLARE_COMPLETO } from "@/lib/titolare";

export const metadata: Metadata = {
  title: "Informativa privacy",
  description:
    "Quali dati IQstatS raccoglie, perché, dove stanno, per quanto tempo e come si chiede di vederli o di cancellarli.",
};

/**
 * Ogni affermazione tecnica di questa pagina e' stata letta nel codice, non dedotta.
 * Le fonti, per chi la rivede:
 *  - i dati dell'account e dell'abbonamento: `src/server/supabase/database.types.ts`
 *    (`profiles`, `billing_customers`, `subscriptions`, `entitlements`, `billing_events`);
 *  - i tre valori tenuti nel browser: cercati in `src` come chiavi di `localStorage`;
 *  - la regione del database: progetto Supabase `iqStats`, `eu-west-1` (Irlanda);
 *  - il luogo di esecuzione del server: intestazione `X-Vercel-Id` della produzione,
 *    `fra1::iad1`, cioe' funzioni eseguite a Washington (Stati Uniti);
 *  - l'assenza di analitiche: nessun pacchetto di misurazione in `package.json`.
 * Se una di queste cose cambia, cambia anche la pagina.
 */
export default function PrivacyPage() {
  return (
    <ProductShell activeSection="legal">
      <section className="page-intro" aria-labelledby="privacy-title">
        <p className="eyebrow">Informativa privacy</p>
        <h1 id="privacy-title">Che cosa sappiamo di te, e perché.</h1>
        <p>
          IQstatS raccoglie poco: un indirizzo email per farti entrare e, se ti abboni, lo
          stato dell&apos;abbonamento. Non c&apos;è pubblicità, non c&apos;è profilazione, non
          c&apos;è nessuno strumento di misurazione del comportamento. Aggiornata al{" "}
          {LEGALE_AGGIORNATO}.
        </p>
      </section>

      <article className="legale">
        {!TITOLARE_COMPLETO && (
          <p className="legale-mancante" role="note">
            <b>Questa pagina non è ancora completa.</b> Il nome del titolare del trattamento e
            il suo indirizzo email non sono stati inseriti. Finché mancano, questa informativa
            non identifica chi risponde dei tuoi dati e non va considerata pubblicata.
          </p>
        )}

        <h2>Chi tratta i tuoi dati</h2>
        <p>
          Il titolare del trattamento è{" "}
          {TITOLARE.nome === "" ? (
            <b>non ancora dichiarato in questa pagina</b>
          ) : (
            <b>{TITOLARE.nome}</b>
          )}
          , persona fisica. Per qualsiasi richiesta sui tuoi dati scrivi su Telegram a{" "}
          <a href={TITOLARE.telegramUrl}>@{TITOLARE.telegram}</a>
          {TITOLARE.email !== "" && (
            <>
              {" "}
              oppure all&apos;indirizzo <a href={`mailto:${TITOLARE.email}`}>{TITOLARE.email}</a>
            </>
          )}
          .
        </p>

        <h2>Che cosa raccogliamo, e perché</h2>
        <dl className="legale-dati">
          <dt>Il tuo indirizzo email</dt>
          <dd>
            Serve a farti entrare: l&apos;accesso avviene con un codice a sei cifre inviato
            per email, senza password. Base giuridica: esecuzione del contratto. Senza email
            non c&apos;è account.
          </dd>

          <dt>Un profilo minimo</dt>
          <dd>
            Un identificativo interno, la data di creazione e, se lo imposti, un nome da
            mostrare. Nient&apos;altro.
          </dd>

          <dt>Lo stato dell&apos;abbonamento</dt>
          <dd>
            Se ti abboni: piano scelto, stato, periodo in corso, disdetta programmata e gli
            identificativi che Stripe assegna al cliente e all&apos;abbonamento. Base
            giuridica: esecuzione del contratto e obblighi di legge sulla contabilità.
          </dd>

          <dt>Le funzioni a cui hai diritto</dt>
          <dd>
            Una riga per ogni funzione aperta dal tuo piano, con la data di inizio e di fine.
            Serve a far funzionare l&apos;abbonamento, non a osservarti.
          </dd>

          <dt>I registri tecnici</dt>
          <dd>
            I fornitori che ospitano il sito e il database conservano per un periodo limitato
            le richieste ricevute, che comprendono l&apos;indirizzo IP. È il funzionamento
            ordinario di un server, e serve a sicurezza e diagnosi. Base giuridica: interesse
            legittimo a mantenere il servizio in piedi e protetto.
          </dd>
        </dl>

        <h2>Che cosa non facciamo</h2>
        <ul className="legale-elenco">
          <li>Nessun cookie di terze parti e nessun pannello di consenso: gli unici cookie sono quelli tecnici che tengono aperta la tua sessione.</li>
          <li>Nessuno strumento di analisi o di misurazione del comportamento, di nessun fornitore.</li>
          <li>Nessuna profilazione pubblicitaria, nessun invio dei tuoi dati a inserzionisti.</li>
          <li>Nessuna vendita né cessione dei tuoi dati a chiunque.</li>
          <li>Nessun dato personale viene inviato alla fonte dei dati sportivi: quelle richieste riguardano partite e squadre, mai persone.</li>
        </ul>

        <h2>Chi li tratta per noi, e dove stanno</h2>
        <dl className="legale-dati">
          <dt>Supabase</dt>
          <dd>
            Database e sistema di accesso, oltre all&apos;invio dell&apos;email con il codice.
            Il progetto è ospitato nella regione <code>eu-west-1</code>, in Irlanda:{" "}
            <b>i tuoi dati di account restano nell&apos;Unione europea</b>.
          </dd>

          <dt>Stripe</dt>
          <dd>
            Pagamenti e fatturazione. I dati della carta li tratta Stripe e{" "}
            <b>non passano mai da noi</b>: noi conserviamo soltanto gli identificativi che
            Stripe ci restituisce.
          </dd>

          <dt>Vercel</dt>
          <dd>
            Ospita il sito. Le pagine vengono servite dall&apos;Europa, ma{" "}
            <b>il codice del server viene eseguito negli Stati Uniti</b> (regione di
            Washington). È un trasferimento fuori dall&apos;Unione europea, coperto dalle
            garanzie contrattuali del fornitore.
          </dd>
        </dl>

        <h2>Che cosa resta nel tuo browser</h2>
        <p>
          Tre valori sono salvati sul tuo dispositivo e <b>non arrivano mai a noi</b>: i
          campionati che hai messo tra i preferiti, il fatto che tu abbia già visto la guida
          del calendario e il fatto che tu abbia chiuso l&apos;invito a installare l&apos;app.
          Si cancellano svuotando i dati del sito dal browser.
        </p>

        <h2>Per quanto li teniamo</h2>
        <p>
          I dati dell&apos;account restano finché l&apos;account esiste. Quando lo elimini,
          spariscono con lui: profilo, cliente di fatturazione, abbonamenti e diritti se ne
          vanno nello stesso momento, perché il database li lega alla tua utenza. Restano soltanto i
          documenti che la legge impone di conservare per la contabilità, e restano presso
          Stripe secondo i suoi tempi. I registri tecnici dei fornitori si cancellano da soli
          nei tempi che il fornitore applica.
        </p>

        <h2>I tuoi diritti</h2>
        <p>
          Puoi chiedere di vedere i tuoi dati, di correggerli, di cancellarli, di limitarne
          l&apos;uso, di riceverne una copia in un formato leggibile e di opporti al
          trattamento. Si chiede sul canale di assistenza qui sopra, e la risposta arriva
          entro un mese.
        </p>
        <p>
          <b>Due li puoi esercitare da solo, subito.</b> Dal tuo{" "}
          <Link href="/account">profilo</Link> scarichi tutti i tuoi dati in un file
          leggibile anche da un altro programma, e cancelli l&apos;account: la cancellazione
          rimuove profilo, dati di fatturazione, abbonamenti e diritti, e non è una
          disattivazione. Per tutto il resto scrivi al canale di assistenza.
        </p>
        <p>
          Se ritieni che il trattamento violi il regolamento europeo puoi rivolgerti al{" "}
          <b>Garante per la protezione dei dati personali</b>, che raccoglie i reclami sul suo
          sito <a href="https://www.garanteprivacy.it">garanteprivacy.it</a>.
        </p>

        <h2>Se questa pagina cambia</h2>
        <p>
          La data in cima dice quando è stata rivista l&apos;ultima volta. Se cambia qualcosa
          che ti riguarda davvero, per esempio un nuovo destinatario dei dati, lo trovi
          scritto qui e non nascosto in una riga.
        </p>

        <p className="legale-vicino">
          Vedi anche i <Link href="/termini">termini di servizio</Link> e il{" "}
          <Link href="/metodo">metodo</Link>.
        </p>
      </article>
    </ProductShell>
  );
}
