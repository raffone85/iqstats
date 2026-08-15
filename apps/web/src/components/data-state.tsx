import type { PageApiIssue } from "@/server/iqstats/page-api";

const issueCopy: Readonly<Record<PageApiIssue, { readonly title: string; readonly body: string }>> = {
  unauthenticated: {
    title: "Accesso richiesto",
    body: "Accedi con un account autorizzato per consultare le partite. L'interfaccia non sostituisce il controllo lato server.",
  },
  not_entitled: {
    title: "Funzione non inclusa nel piano",
    body: "Il tuo piano non abilita questa lettura. Nessun dato viene mostrato come sostituto.",
  },
  rate_limited: {
    title: "Limite temporaneo raggiunto",
    body: "La richiesta è stata limitata lato server. Attendi prima di riprovare.",
  },
  not_found: {
    title: "Gara non disponibile",
    body: "La gara richiesta non è presente nella fonte normalizzata in questo momento.",
  },
  invalid_request: {
    title: "Filtri da correggere",
    body: "Controlla data, ID campionato e stato prima di cercare di nuovo.",
  },
  unavailable: {
    title: "Dati temporaneamente non disponibili",
    body: "La fonte o la verifica del dato non è disponibile. Non viene mostrato alcun contenuto dimostrativo.",
  },
};

export function DataState({ issue }: Readonly<{ issue: PageApiIssue }>) {
  const copy = issueCopy[issue];

  return (
    <section className="data-state" role="status" aria-live="polite">
      <p className="eyebrow">Stato della richiesta</p>
      <h2>{copy.title}</h2>
      <p>{copy.body}</p>
    </section>
  );
}
