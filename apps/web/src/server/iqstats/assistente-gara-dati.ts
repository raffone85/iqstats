// Server-only: la risposta dell'assistente della gara, leggendo solo cio' che il tema chiede.
//
// **Perche' esiste.** La risposta nasceva dentro la pagina del dossier, dagli oggetti che i
// capitoli avevano gia' calcolato: giusto per i numeri, lento per chi chiede, perche' ogni
// domanda rifaceva tutto il dossier - venti letture per mostrarne una. Qui il tema decide
// che cosa si legge: la classifica legge la classifica, l'arbitro legge l'arbitro.
//
// **I numeri restano gli stessi del dossier, e non per somiglianza.** Ogni tema chiama le
// stesse funzioni che chiama la pagina, con gli stessi argomenti, e quasi tutte conservano
// il risultato: la domanda dopo trova il dato gia' letto. La pagina stessa, quando la
// domanda arriva dall'indirizzo, passa di qui.
import "server-only";

import { readFeatureDecision } from "@/server/auth/authorization";
import { chiDelConsiglio, consiglio } from "@/components/expected-voce";

import { allenatoreDellaSquadra, idAllenatore } from "./allenatore.ts";
import type { Risposta } from "./assistente.ts";
import {
  DOMANDA_MASSIMA, FAMIGLIE_CHIESTE, interpreta, leggiDomanda, NON_DISPONIBILE,
  rispostaRiassunto, rispostaSuiGiocatori, rispostaSuiGol, rispostaSuiPrecedenti,
  rispostaSullaClassifica, rispostaSullaForma, rispostaSulleFormazioni, rispostaSulleLinee,
  rispostaSullArbitro, rispostaSulPerche,
} from "./assistente-gara.ts";
import { expectedDelleGare, quoteDiGara, quoteGolDiGara } from "./expected-famiglie.ts";
import { haTabellaDiBase, letturaGiocatori } from "./giocatori-lettura.ts";
import { isRuolo } from "./giocatori-metro.ts";
import { getMatchLineups } from "./lineups.ts";
import { getMatchDetail, getReferee } from "./match-context.ts";
import { getMatchOdds } from "./odds.ts";
import { proiezioniDellaGara } from "./projection-runtime.ts";
import { causeDellaLettura } from "./projection/cause.ts";
import {
  gareDirette, giudizioSulMetro, medieDaMostrare, metriDiLega, metroPer,
  perStagioneCompetizione, profiloArbitro,
} from "./referees.ts";
import { frasiDellaGara } from "./riassunto-gara.ts";
import { getMatchStandingRows, getTeamForm } from "./team-page.ts";
import { vociDeiGol } from "./voci-dei-gol.ts";

/**
 * La risposta a una domanda su una gara, o `null` dove l'assistente non c'e'.
 *
 * `null` vuol dire che la sezione non si mostra: domanda vuota, piano che non vede le
 * proiezioni, gara gia' finita o che il motore non proietta. Sono le stesse condizioni
 * con cui il dossier decide se disegnare la casella.
 */
export async function rispostaDellaGara(eventId: number, domandaGrezza: string): Promise<Risposta | null> {
  const domanda = domandaGrezza.trim().slice(0, DOMANDA_MASSIMA);
  if (domanda === "" || !Number.isInteger(eventId) || eventId <= 0) return null;

  const [motore, esito] = await Promise.all([
    readFeatureDecision("engine.read"),
    getMatchDetail(eventId),
  ]);
  if (!motore.allowed || esito.stato !== "trovato" || esito.detail.status === "finished") return null;
  const detail = esito.detail;
  const squadre = { casa: detail.homeTeam, trasferta: detail.awayTeam };

  // Il modello legge la domanda mentre il motore proietta: sono le due attese lunghe, e
  // nessuna aspetta l'altra. Al motore vanno gli allenatori risolti, come nel dossier.
  const [tradotta, proiezione] = await Promise.all([
    interpreta(domanda, squadre),
    Promise.all([
      allenatoreDellaSquadra(detail.homeTeamId, detail.homeCoachId),
      allenatoreDellaSquadra(detail.awayTeamId, detail.awayCoachId),
    ]).then(([casa, fuori]) => proiezioniDellaGara({
      ...detail, homeCoachId: idAllenatore(casa), awayCoachId: idAllenatore(fuori),
    })),
  ]);
  if (typeof proiezione === "string") return null;
  if (tradotta === null) return NON_DISPONIBILE;

  const letta = leggiDomanda(tradotta, domanda);
  if (letta === null || letta.tema === "linee") {
    return rispostaSulleLinee(letta, proiezione.bersagli, quoteDiGara(eventId), squadre);
  }

  switch (letta.tema) {
    case "gol": {
      const gol = proiezione.gol;
      return rispostaSuiGol(
        letta, gol,
        gol === null ? null : vociDeiGol(gol.mercati, await getMatchOdds(eventId), quoteGolDiGara(eventId)),
        squadre,
      );
    }

    case "arbitro": {
      const idArbitro = detail.refereeId;
      const contesto = detail.leagueId === null || detail.seasonId === null ? null
        : { competitionSourceId: detail.leagueId, seasonSourceId: detail.seasonId };
      const [arbitro, profilo, gare] = idArbitro === null
        ? [null, null, [] as const]
        : await Promise.all([
          getReferee(idArbitro),
          contesto === null ? null : profiloArbitro(idArbitro, contesto),
          gareDirette(idArbitro),
        ]);
      // Il giudizio guarda questa lega e le stesse gare del numero che gli sta sotto: e' la
      // regola del banner dell'arbitro nel dossier, ripetuta qui passo per passo.
      const qui = gare.find((g) => g.competitionSourceId === detail.leagueId) ?? null;
      const banner = medieDaMostrare(gare, detail.leagueId ?? null);
      const metri = await metriDiLega(
        [...new Set(perStagioneCompetizione(gare).map((r) => r.competitionSourceId))]
          .filter((id): id is number => id !== null),
      );
      const metro = qui === null ? null : metroPer(metri, qui.competitionSourceId, qui.seasonId);
      const giudizio = banner === null || banner.provenienza === "tutte"
        ? null
        : giudizioSulMetro(banner.gialli, metro?.gialli ?? null, metro?.dispersioneGialli ?? null);
      return rispostaSullArbitro({
        nome: arbitro?.name ?? null,
        profilo,
        giudizio,
        // Quanto l'arbitro sposta l'atteso totale, dalle stesse cause che spiegano una
        // lettura: sotto l'uno per cento `causeDellaLettura` non restituisce la voce.
        influenza: proiezione.bersagli.flatMap((b) => {
          const sua = causeDellaLettura("totale", b.casa, b.trasferta, 99)
            .find((causa) => causa.nome === "l'arbitro");
          const famiglia = FAMIGLIE_CHIESTE[b.target as keyof typeof FAMIGLIE_CHIESTE] ?? b.target;
          return sua === undefined ? [] : [{ famiglia, effetto: sua.effetto }];
        }),
      }, squadre);
    }

    case "giocatori": {
      const lineups = await getMatchLineups(eventId);
      const rosa = [
        ...(lineups?.home?.starters ?? []).map((g) => ({
          id: g.id, nome: g.name, squadra: lineups?.home?.teamName ?? detail.homeTeam,
          ruolo: isRuolo(g.position) ? g.position : null,
        })),
        ...(lineups?.away?.starters ?? []).map((g) => ({
          id: g.id, nome: g.name, squadra: lineups?.away?.teamName ?? detail.awayTeam,
          ruolo: isRuolo(g.position) ? g.position : null,
        })),
      ].filter(
        (g): g is { id: number; nome: string; squadra: string; ruolo: "G" | "D" | "M" | "F" | null } =>
          g.id !== null,
      );
      const lettura = rosa.length === 0 || detail.leagueId === null || !haTabellaDiBase(detail.leagueId)
        ? null
        : await letturaGiocatori(eventId, detail.leagueId, detail.seasonId, rosa);
      return rispostaSuiGiocatori(letta, lettura, squadre);
    }

    case "formazioni": {
      const lineups = await getMatchLineups(eventId);
      const lato = (l: NonNullable<typeof lineups>["home"]) => (l === null ? null : {
        modulo: l.formation, titolari: l.starters.map((g) => g.name), indisponibili: l.unavailable,
      });
      return rispostaSulleFormazioni(letta, lineups === null ? null : {
        ufficiali: lineups.confirmed, inProva: lineups.beta,
        casa: lato(lineups.home), trasferta: lato(lineups.away),
      }, squadre);
    }

    case "classifica":
      return rispostaSullaClassifica(
        detail.leagueId !== null && detail.seasonId !== null
          && detail.homeTeamId !== null && detail.awayTeamId !== null
          ? await getMatchStandingRows(
            String(detail.leagueId), String(detail.seasonId),
            String(detail.homeTeamId), String(detail.awayTeamId),
          )
          : null,
        squadre,
      );

    case "forma": {
      const [casa, fuori] = await Promise.all([
        detail.homeTeamId !== null ? getTeamForm(String(detail.homeTeamId)) : null,
        detail.awayTeamId !== null ? getTeamForm(String(detail.awayTeamId)) : null,
      ]);
      return rispostaSullaForma(casa, fuori, squadre);
    }

    case "precedenti":
      return rispostaSuiPrecedenti(detail.headToHead, squadre);

    case "perche": {
      const b = proiezione.bersagli.find((x) => x.target === letta.bersaglio);
      const prevista = b !== undefined && b.casa.stato === "prevista" && b.trasferta.stato === "prevista"
        ? { casa: b.casa, trasferta: b.trasferta, totale: b.totale }
        : null;
      const atteso = prevista === null ? null
        : letta.lato === "totale" ? prevista.totale?.valoreAtteso ?? null
          : prevista[letta.lato].valoreAtteso;
      // Sul totale l'origine e' la peggiore dei due lati, come in Expected: un totale che
      // somma un lato dal modello e uno da un ripiego poggia anche su un ripiego.
      const origini = prevista === null ? []
        : letta.lato === "totale"
          ? [prevista.casa.origineDelValore, prevista.trasferta.origineDelValore]
          : [prevista[letta.lato].origineDelValore];
      return rispostaSulPerche(
        letta,
        atteso === null ? null : {
          atteso,
          origine: origini.includes("ripiego") ? "ripiego" : origini.includes("miscela") ? "miscela" : "modello",
        },
        b === undefined ? [] : causeDellaLettura(letta.lato, b.casa, b.trasferta, 5),
        squadre,
      );
    }

    case "riassunto": {
      const gara = expectedDelleGare()?.gare.find((x) => x.gara === eventId) ?? null;
      const c = gara?.consigliato ?? null;
      return rispostaRiassunto(gara === null ? [] : frasiDellaGara(
        gara, c === null ? null : `${consiglio(c)} (${chiDelConsiglio(c, gara.casa, gara.fuori)})`,
      ));
    }
  }
}
