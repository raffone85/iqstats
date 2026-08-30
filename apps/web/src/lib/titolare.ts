/**
 * Chi risponde di IQstatS, in un posto solo.
 *
 * Le pagine legali non tengono questi valori nel testo: un nome scritto in due punti
 * diventa due nomi il giorno che cambia. Qui stanno una volta.
 *
 * ponytail: `nome` e `email` sono vuoti finche' l'utente non li fornisce. Le pagine
 * dichiarano l'assenza invece di inventare un titolare, e `TITOLARE_COMPLETO` dice se
 * si puo' pubblicare. Non pubblicare con `nome` vuoto: un'informativa senza titolare
 * non identifica nessuno, ed e' il motivo per cui la pagina esiste.
 */
export const TITOLARE = {
  nome: "",
  email: "",
  telegram: "Assistenza_Strategacalcio",
  telegramUrl: "https://t.me/Assistenza_Strategacalcio",
} as const;

export const TITOLARE_COMPLETO = TITOLARE.nome !== "" && TITOLARE.email !== "";

/** Data dell'ultima revisione dei testi legali, scritta a mano quando si toccano. */
export const LEGALE_AGGIORNATO = "30 agosto 2026";
