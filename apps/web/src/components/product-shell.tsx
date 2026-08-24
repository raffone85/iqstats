import Link from "next/link";

import { signOutAction } from "@/app/actions/session";
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
  | "billing"
  | "account";

type ProductShellProps = Readonly<{
  children: React.ReactNode;
  activeSection?: ProductSection;
}>;

/**
 * Solo le pagine che esistono davvero. Le entità confermate il 23 agosto — Arbitri,
 * Squadre, Giocatori, Expected — stanno sulle tessere della dashboard ed entrano qui una
 * alla volta, quando la loro pagina c'è: Arbitri è entrata lo stesso giorno. Il tetto
 * resta cinque destinazioni, come vuole l'architettura informativa su mobile.
 */
const PRIMARY_NAV: ReadonlyArray<{ section: ProductSection; href: string; label: string; short: string }> = [
  { section: "home", href: "/", label: "Home", short: "Home" },
  { section: "matches", href: "/partite", label: "Partite", short: "Partite" },
  { section: "referees", href: "/arbitri", label: "Arbitri", short: "Arbitri" },
  { section: "teams", href: "/squadre", label: "Squadre", short: "Squadre" },
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
            <nav className="product-subnav" aria-label="Sezioni secondarie">
              <Link href="/account/billing" aria-current={activeSection === "billing" ? "page" : undefined}>
                Piani
              </Link>
            </nav>
            {authenticated ? (
              <div className="product-account">
                <span className="product-avatar" aria-hidden="true">
                  {initialOf(email ?? "?")}
                </span>
                <span className="product-account-id">
                  <small>Sessione attiva</small>
                  <strong>{email ?? "accesso verificato"}</strong>
                </span>
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
      </main>
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
