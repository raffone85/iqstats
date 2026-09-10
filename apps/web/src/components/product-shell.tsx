import Link from "next/link";

import { signOutAction } from "@/app/actions/session";
import { InstallaApp } from "@/components/installa-app";
import { TITOLARE } from "@/lib/titolare";
import { createSupabaseServerClient } from "@/server/supabase/server";

/** `teams` è entrata nella barra il 24 agosto 2026, quando `/squadre` è diventata una
 *  pagina vera: la regola stabilita con Arbitri è che una voce entra quando la sua pagina
 *  esiste, e una voce che apre il vuoto è peggio di una voce che non c'è. Con Squadre la
 *  barra arriva a cinque voci, che è il tetto dichiarato dall'architettura informativa. */
type ProductSection =
  | "home"
  /** Il dossier di una gara **non appartiene a nessuna voce**, ed e' il valore predefinito
   *  della cornice. Ci si arriva da cinque sezioni diverse - Oggi, Pronostici, Partite,
   *  Squadre, Arbitri - e accendere una voce fissa direbbe il falso quattro volte su cinque.
   *  Fino al 3 settembre 2026 il valore si chiamava `matches` e puntava a «Partite», che
   *  nella barra non c'e' piu': non accendeva nulla per coincidenza, non per intenzione. */
  | "match"
  | "predictions"
  | "expected"
  | "teams"
  | "referees"
  | "method"
  | "search"
  | "billing"
  | "account"
  /** Privacy e termini non stanno nella barra: si raggiungono dal piede, e questa voce
   *  serve solo a non accendere «Partite» su una pagina che con le partite non c'entra. */
  | "legal";

type ProductShellProps = Readonly<{
  children: React.ReactNode;
  activeSection?: ProductSection;
}>;

/**
 * L'albero del cassetto laterale: tutte le destinazioni in un posto solo.
 *
 * **Perche' un cassetto e non una barra piu' lunga.** La barra ha un tetto di cinque voci -
 * scritto qui sopra dal 24 agosto - e sotto quel tetto restano fuori Partite, Giocatori,
 * Expected e Cerca, che esistono e nessuno trova. Un cassetto non ha tetto: si apre, si
 * legge tutto, si chiude.
 *
 * **Solo `<details>` nativi.** Niente stato client, niente libreria, niente JavaScript: la
 * shell e' un componente server e resta tale. Tastiera e lettori di schermo funzionano
 * senza che ci si metta mano.
 *
 * **Le voci sono solo quelle che esistono.** Classifiche, Confronto e Quote sono nella
 * ricognizione di PowerStats e nella raccolta quote, ma le loro pagine non ci sono ancora:
 * una voce che apre il vuoto e' peggio di una voce che non c'e'. Entrano quando la pagina
 * esiste, come e' entrata Squadre.
 */
const MENU: ReadonlyArray<{
  readonly label: string;
  readonly href?: string;
  readonly section?: ProductSection;
  readonly voci?: ReadonlyArray<{ label: string; href: string; section: ProductSection }>;
}> = [
  { label: "Oggi", href: "/", section: "home" },
  { label: "Pronostici", href: "/pronostici", section: "predictions" },
  {
    label: "Partite",
    voci: [
      { label: "Calendario", href: "/partite", section: "match" },
      { label: "Expected", href: "/expected", section: "expected" },
    ],
  },
  {
    label: "Squadre",
    voci: [
      { label: "Elenco", href: "/squadre", section: "teams" },
      { label: "Cerca", href: "/cerca", section: "search" },
    ],
  },
  { label: "Giocatori", href: "/giocatori", section: "teams" },
  { label: "Arbitri", href: "/arbitri", section: "referees" },
  { label: "Metodo", href: "/metodo", section: "method" },
];

/** L'iniziale sostituisce una fotografia che non abbiamo: nessun avatar inventato. */
function initialOf(email: string) {
  const first = email.trim().charAt(0);
  return first === "" ? "?" : first.toUpperCase();
}

export async function ProductShell({ children, activeSection = "match" }: ProductShellProps) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = error ? null : data?.claims;
  const email = typeof claims?.email === "string" ? claims.email : null;
  const authenticated = Boolean(claims?.sub);

  return (
    <div className="product-shell">
      <a className="skip-link" href="#main-content">
        Salta al contenuto
      </a>
      <header className="product-header">
        <div className="product-header-inner">
          <details className="menu-cassetto">
            <summary aria-label="Menu">
              <span className="menu-hamburger" aria-hidden="true">
                <i /><i /><i />
              </span>
              <span className="menu-hamburger-testo">Menu</span>
            </summary>
            <nav className="menu-pannello" aria-label="Navigazione">
              {MENU.map((voce) => (
                voce.voci === undefined ? (
                  <Link
                    key={voce.label}
                    className={`menu-voce${activeSection === voce.section ? " menu-voce-attiva" : ""}`}
                    href={voce.href ?? "/"}
                    aria-current={activeSection === voce.section ? "page" : undefined}
                  >
                    {voce.label}
                  </Link>
                ) : (
                  <details className="menu-gruppo" key={voce.label}>
                    <summary className="menu-voce">{voce.label}</summary>
                    {voce.voci.map((sotto) => (
                      <Link
                        key={sotto.href}
                        className={`menu-sotto${activeSection === sotto.section ? " menu-voce-attiva" : ""}`}
                        href={sotto.href}
                        aria-current={activeSection === sotto.section ? "page" : undefined}
                      >
                        {sotto.label}
                      </Link>
                    ))}
                  </details>
                )
              ))}
            </nav>
          </details>
          <Link className="product-wordmark" href="/" aria-label="IQstatS, home">
            <span className="product-mark" aria-hidden="true">IQ</span>
            <span>
              <strong>IQstatS</strong>
              <small>football intelligence</small>
            </span>
          </Link>
          <div className="product-header-right">
            {/* **Cercare e' un'azione, non una destinazione.** Sta nella testata di ogni
                pagina e non nella barra, dove occupava uno dei cinque posti riservati alle
                sezioni di contenuto. Porta a `/cerca`, che non cambia: nessuna esperienza
                di ricerca nuova. L'etichetta sparisce sotto i 640 px e resta la lente, che
                porta con se' il nome accessibile. */}
            <Link
              className="product-cerca"
              href="/cerca"
              aria-label="Cerca"
              aria-current={activeSection === "search" ? "page" : undefined}
            >
              <svg viewBox="0 0 20 20" width="17" height="17" aria-hidden="true" focusable="false">
                <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <line x1="13.5" y1="13.5" x2="18" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span className="product-cerca-testo">Cerca</span>
            </Link>
            <nav className="product-subnav" aria-label="Sezioni secondarie">
              <Link href="/account" aria-current={activeSection === "account" ? "page" : undefined}>
                Profilo
              </Link>
              <Link href="/account/billing" aria-current={activeSection === "billing" ? "page" : undefined}>
                Piani
              </Link>
            </nav>
            {authenticated ? (
              <div className="product-account">
                {/* Il cluster era statico: diceva chi sei e non portava da nessuna parte.
                    Ora e' la porta del profilo, ed e' l'unica su telefono, dove la subnav
                    e' nascosta sotto i 1024 px. */}
                {/* `aria-label` perche' sotto i 640 px l'etichetta e' nascosta e l'avatar e'
                    aria-hidden: misurato il 30 agosto, il collegamento restava senza nome
                    accessibile a 375 px, ed e' l'unica porta al profilo su telefono. */}
                <Link
                  className="product-account-link"
                  href="/account"
                  aria-label="Profilo"
                  aria-current={activeSection === "account" ? "page" : undefined}
                >
                  <span className="product-avatar" aria-hidden="true">
                    {initialOf(email ?? "?")}
                  </span>
                  <span className="product-account-id">
                    <small>Profilo</small>
                    <strong>{email ?? "accesso verificato"}</strong>
                  </span>
                </Link>
                <form action={signOutAction}>
                  <button type="submit" className="product-signout">
                    Esci
                  </button>
                </form>
              </div>
            ) : (
              <Link
                className="product-signin"
                href="/accedi"
                aria-current={activeSection === "account" ? "page" : undefined}
              >
                Accedi
              </Link>
            )}
          </div>
        </div>
      </header>
      <main id="main-content" className="product-main" tabIndex={-1}>
        {children}
        {/* In coda al contenuto, non sopra: un invito che copre la pagina e' pubblicita',
            uno che aspetta la fine e' un'offerta. Si mostra da solo soltanto dove c'e'
            qualcosa da installare, e una volta chiuso non torna. */}
        <InstallaApp />
      </main>
      {/* Le avvertenze stanno su ogni pagina di prodotto, non in una pagina defilata: sono
          la cornice di ogni lettura, e una cornice che si trova solo cercandola non e' una
          cornice. Non accanto a ogni singola lettura: in un dossier da diciassette capitoli
          la stessa frase ripetuta diventa rumore, e il rumore si smette di leggere.
          Il numero e' verificato alla fonte (Istituto Superiore di Sanità), non a memoria. */}
      <footer className="product-avvertenze">
        <p>
          <b>IQstatS pubblica analisi statistiche, non consigli di scommessa.</b> Nessun
          numero in queste pagine è un invito a giocare, e nessuna lettura è una previsione
          garantita.
        </p>
        <p>
          Vietato ai minori di diciotto anni. Il gioco d&apos;azzardo può causare dipendenza
          patologica. Telefono Verde Nazionale{" "}
          <a href="tel:800558822">800 55 88 22</a>, gratuito e anonimo, dal lunedì al venerdì
          dalle 10 alle 16, Istituto Superiore di Sanità.
        </p>
        {/* Chi risponde del sito sta in fondo, piccolo e in minuscolo: non e' un'insegna,
            e' il modo di sapere con chi si ha a che fare da qualsiasi pagina senza dover
            aprire l'informativa. Il minuscolo lo fa il foglio di stile, non la stringa:
            il nome resta scritto giusto per chi legge con la voce. */}
        <p className="product-titolare">{TITOLARE.nome}</p>
        {/* Le pagine legali stanno qui e non nella barra: si cercano quando servono, e
            quando servono si devono trovare da qualsiasi pagina. */}
        <p className="product-legale">
          <Link href="/privacy">Informativa privacy</Link>
          <Link href="/termini">Termini di servizio</Link>
          <a href={TITOLARE.telegramUrl}>Assistenza</a>
        </p>
      </footer>
    </div>
  );
}
