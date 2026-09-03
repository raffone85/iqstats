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
  | "matches"
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
 * Cinque destinazioni, e il tetto torna quello dichiarato.
 *
 * **Erano sei, contro il tetto di cinque scritto qui sopra dal 24 agosto.** Su telefono
 * diventavano sei bersagli su due righe, e la barra copriva il fondo della pagina.
 *
 * Due cambi, il 3 settembre 2026. **«Cerca» esce**: cercare e' un'azione, non un posto dove
 * si va, e ora sta nella testata di ogni pagina - la route `/cerca` non cambia.
 * **«Pronostici» entra**: era una pagina intera raggiungibile solo dalle tessere della home,
 * quindi chi arrivava da un dossier condiviso non sapeva che esistesse.
 *
 * **«Partite» esce dalla barra ma non dall'app**: `/` e' la porta del giorno - porta la gara
 * in evidenza e il calendario - e da li' e dal dossier si arriva all'elenco completo, che
 * resta a `/partite` con i suoi filtri.
 */
const PRIMARY_NAV: ReadonlyArray<{ section: ProductSection; href: string; label: string; short: string }> = [
  { section: "home", href: "/", label: "Oggi", short: "Oggi" },
  { section: "predictions", href: "/pronostici", label: "Pronostici", short: "Pronostici" },
  { section: "teams", href: "/squadre", label: "Squadre", short: "Squadre" },
  { section: "referees", href: "/arbitri", label: "Arbitri", short: "Arbitri" },
  { section: "method", href: "/metodo", label: "Metodo", short: "Metodo" },
];

/** L'iniziale sostituisce una fotografia che non abbiamo: nessun avatar inventato. */
function initialOf(email: string) {
  const first = email.trim().charAt(0);
  return first === "" ? "?" : first.toUpperCase();
}

export async function ProductShell({ children, activeSection = "matches" }: ProductShellProps) {
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
          <Link className="product-wordmark" href="/" aria-label="IQstatS, home">
            <span className="product-mark" aria-hidden="true">IQ</span>
            <span>
              <strong>IQstatS</strong>
              <small>football intelligence</small>
            </span>
          </Link>
          <nav className="product-nav" aria-label="Navigazione primaria">
            {PRIMARY_NAV.map((item) => (
              <Link
                key={item.section}
                className={`product-nav-link${activeSection === item.section ? " product-nav-link-active" : ""}`}
                href={item.href}
                aria-current={activeSection === item.section ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
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
      <nav className="product-mobile-nav" aria-label="Navigazione primaria mobile">
        {PRIMARY_NAV.map((item) => (
          <Link
            key={item.section}
            href={item.href}
            aria-current={activeSection === item.section ? "page" : undefined}
          >
            {item.short}
          </Link>
        ))}
      </nav>
    </div>
  );
}
