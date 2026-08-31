/**
 * Chi risponde di IQstatS, in un posto solo.
 *
 * Le pagine legali non tengono questi valori nel testo: un nome scritto in due punti
 * diventa due nomi il giorno che cambia. Qui stanno una volta.
 *
 * `TITOLARE_COMPLETO` resta il guardiano: con `nome` o `email` vuoti le pagine legali
 * dichiarano da sole di non essere pubblicabili, invece di inventare un titolare.
 * Un'informativa senza titolare non identifica nessuno, ed e' il motivo per cui esiste.
 *
 * ponytail: l'indirizzo geografico non c'e' perche' non serve ancora. Diventa obbligatorio
 * quando passano pagamenti veri, cioe' quando Stripe esce dalla modalita' di prova.
 */
/** Tipo esplicito e non `as const`: con i valori letterali il confronto con la
 *  stringa vuota diventa un errore di compilazione, e il guardiano sparirebbe. */
export const TITOLARE: { nome: string; email: string; telegram: string; telegramUrl: string } = {
  nome: "Raffaele Fontana",
  email: "raffaelefontana85@gmail.com",
  telegram: "Assistenza_Strategacalcio",
  telegramUrl: "https://t.me/Assistenza_Strategacalcio",
};

export const TITOLARE_COMPLETO = TITOLARE.nome !== "" && TITOLARE.email !== "";

/** Data dell'ultima revisione dei testi legali, scritta a mano quando si toccano. */
export const LEGALE_AGGIORNATO = "30 agosto 2026";
