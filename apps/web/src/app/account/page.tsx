import Link from "next/link";

import { signOutAction } from "@/app/actions/session";
import { eliminaAccountAction } from "@/app/actions/account";
import { PortaleFatturazione } from "@/components/portale-fatturazione";
import { ProductShell } from "@/components/product-shell";
import { getBillingPageData } from "@/server/billing/catalog";
import { createSupabaseServerClient } from "@/server/supabase/server";

/**
 * Il profilo.
 *
 * **La regola della pagina.** Ogni voce porta a qualcosa che esiste. Le funzioni che non
 * ci sono ancora non diventano voci grigie: stanno in fondo, dette per nome, con il motivo
 * per cui mancano. Una voce che apre il vuoto e' peggio di una voce che non c'e'.
 *
 * **La rotta.** L'architettura informativa chiama questa funzione `/impostazioni`; il codice
 * ha gia' `/account/billing` e la sezione `account` nello shell, e il repository vince sullo
 * stato del codice. La discrepanza resta da sanare nel documento.
 */
export const dynamic = "force-dynamic";

function dataItaliana(valore: string) {
  return new Date(valore).toLocaleDateString("it-IT", { dateStyle: "long", timeZone: "Europe/Rome" });
}

export default async function AccountPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const parametri = await searchParams;
  const esitoEliminazione = typeof parametri.elimina === "string" ? parametri.elimina : null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = error ? null : data?.claims;
  const email = typeof claims?.email === "string" ? claims.email : null;

  if (!claims?.sub) {
    return (
      <ProductShell activeSection="account">
        <div className="oggi-backdrop" aria-hidden="true" />
        <section className="data-state" aria-labelledby="account-auth-title">
          <p className="eyebrow">Accesso richiesto</p>
          <h2 id="account-auth-title">Il profilo si apre dopo essere entrati.</h2>
          <p>Senza una sessione non c&apos;è nessun profilo da mostrare.</p>
          <Link className="button-link" href="/accedi">
            Accedi
          </Link>
        </section>
      </ProductShell>
    );
  }

  const fatturazione = await getBillingPageData();
  const catalogoLetto = fatturazione.kind === "ready";
  const abbonamento = fatturazione.kind === "ready" ? fatturazione.currentSubscription : null;

  return (
    <ProductShell activeSection="account">
      <div className="oggi-backdrop" aria-hidden="true" />

      <section className="page-intro" aria-labelledby="account-title">
        <p className="eyebrow">Profilo</p>
        <h1 id="account-title">Il tuo accesso, e come si governa.</h1>
        <p>
          Quello che vedi qui viene dal tuo account, non da questa pagina. Ogni voce porta a
          qualcosa che esiste: quello che manca è scritto in fondo, con il motivo.
        </p>
      </section>

      <section className="account-voce" aria-labelledby="account-identita-title">
        <h2 id="account-identita-title">Chi sei</h2>
        <p>
          Sei entrato come <b>{email ?? "un account senza indirizzo dichiarato"}</b>. Non
          chiediamo altri dati personali, e non ce ne sono altri da mostrare.
        </p>
        <form action={signOutAction}>
          <button type="submit" className="account-esci">
            Esci da questo dispositivo
          </button>
        </form>
      </section>

      <section className="account-voce" aria-labelledby="account-abbonamento-title">
        <h2 id="account-abbonamento-title">Abbonamento</h2>
        {!catalogoLetto ? (
          <p role="status" aria-live="polite">
            Non riusciamo a leggere lo stato dell&apos;abbonamento in questo momento. Non
            mettiamo uno stato al posto di quello vero: riprova fra poco.
          </p>
        ) : abbonamento ? (
          <p>
            <b>{abbonamento.planName ?? "Piano commerciale attivo"}</b>, valido fino al{" "}
            {dataItaliana(abbonamento.currentPeriodEnd)}.
            {abbonamento.cancelAtPeriodEnd ? " Il rinnovo è disattivato al termine del periodo." : ""}
          </p>
        ) : (
          <p>
            Nessun piano attivo. Le sezioni che un piano comprende restano chiuse finché il
            pagamento non risulta andato a buon fine.
          </p>
        )}
        <Link className="button-link" href="/account/billing">
          {abbonamento ? "Vedi i piani" : "Scegli un piano"}
        </Link>
      </section>

      <section className="account-voce" aria-labelledby="account-fatturazione-title">
        <h2 id="account-fatturazione-title">Fatturazione</h2>
        <p>
          Metodo di pagamento e ricevute si gestiscono nel portale di <b>Stripe</b>, che
          tratta i pagamenti per noi: il pulsante ti porta fuori da IQstatS, e al termine ti
          riporta qui. Non c&apos;è niente da disdire, perché nessun piano si rinnova da
          solo: ogni acquisto vale per il suo periodo e alla scadenza finisce.
        </p>
        <PortaleFatturazione />
      </section>

      <section className="account-voce" aria-labelledby="account-preferenze-title">
        <h2 id="account-preferenze-title">Preferenze</h2>
        <p>
          L&apos;unica preferenza che salviamo sono i <b>campionati preferiti</b>, che salgono
          in cima al calendario. Si scelgono con la stella, dal calendario stesso, e restano{" "}
          <b>su questo dispositivo</b>: non seguono l&apos;account, perché legarli a te
          richiederebbe una tabella nuova che non è stata ancora aperta.
        </p>
        <Link className="button-link" href="/partite">
          Vai al calendario
        </Link>
      </section>

      <section className="account-voce" aria-labelledby="account-installazione-title">
        <h2 id="account-installazione-title">Sulla schermata home</h2>
        <p>
          IQstatS si aggiunge alla schermata home e si apre a schermo pieno, senza la barra
          del browser. Su Android e su computer il comando sta nel menu del browser, alla voce{" "}
          <b>Installa</b>; su iPhone si tocca <b>Condividi</b> e poi{" "}
          <b>Aggiungi alla schermata Home</b>. Resta una pagina web: senza rete non mostra
          nulla, perché i numeri si leggono al momento.
        </p>
      </section>

      {/* Quello che non c'e' si dice per nome. Elencarlo come voce disabilitata sarebbe
          promettere una data che non abbiamo; tacerlo sarebbe far cercare a vuoto. */}
      <section className="account-voce" aria-labelledby="account-dati-title">
        <h2 id="account-dati-title">I tuoi dati</h2>
        <p>
          Scarica tutto quello che IQstatS conserva su di te, in un file leggibile anche da
          un altro programma: l&apos;indirizzo email, il profilo, il cliente di fatturazione,
          gli abbonamenti e le funzioni a cui hai diritto. Preferiti e guida già vista stanno
          solo nel tuo browser e non arrivano a noi, quindi non sono nel file.
        </p>
        <a className="button-link" href="/api/account/dati" download>
          Scarica i miei dati
        </a>
      </section>

      {/* L'eliminazione sta in fondo, dopo tutto il resto: e' l'unica azione della pagina
          che non si puo' disfare, e non va incontrata mentre si cerca altro. */}
      <section className="account-voce account-elimina" aria-labelledby="account-elimina-title">
        <h2 id="account-elimina-title">Elimina il tuo account</h2>
        <p>
          Cancella l&apos;account e con esso profilo, dati di fatturazione, abbonamenti e
          diritti. <b>Non si può annullare</b>, e non è una disattivazione: le righe vengono
          rimosse. Restano solo i documenti di pagamento presso Stripe, che la legge impone
          di conservare e che non sono nostri da cancellare.
        </p>
        {esitoEliminazione === "indirizzo-non-corrisponde" ? (
          <p className="account-errore" role="alert">
            L&apos;indirizzo scritto non è quello di questo account. Non è stato cancellato
            niente.
          </p>
        ) : esitoEliminazione === "non-riuscita" ? (
          <p className="account-errore" role="alert">
            La cancellazione non è riuscita e il tuo account è ancora qui. Riprova, e se
            succede di nuovo scrivi al canale di assistenza.
          </p>
        ) : null}
        <form action={eliminaAccountAction} className="account-elimina-form">
          <label htmlFor="conferma">
            Per confermare, scrivi il tuo indirizzo: <b>{email}</b>
          </label>
          <input
            id="conferma"
            name="conferma"
            type="email"
            required
            autoComplete="off"
            placeholder="il tuo indirizzo email"
          />
          <button type="submit">Elimina definitivamente</button>
        </form>
      </section>

      <section className="account-mancanze" aria-labelledby="account-mancanze-title">
        <p className="eyebrow">Non c&apos;è ancora</p>
        <h2 id="account-mancanze-title">Una cosa che questa pagina non sa fare.</h2>
        <ul>
          <li>
            <b>Salvataggi</b>: non c&apos;è niente da salvare, perché IQstatS non tiene
            schedine né selezioni.
          </li>
        </ul>
      </section>
    </ProductShell>
  );
}
