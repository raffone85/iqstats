"use client";

import { useRouter } from "next/navigation";

type DateJumpProps = Readonly<{
  /** La data mostrata adesso, in forma `AAAA-MM-GG`. */
  date: string;
  /** Il campionato scelto, che saltare a un'altra data non deve azzerare. */
  leagueId: number | null;
  /** Il filtro di stato scelto, per lo stesso motivo. */
  stato: string;
}>;

/**
 * Il salto a una data qualsiasi, avanti o indietro.
 *
 * **Perche' un campo nativo e non un calendario nostro.** `input type="date"` apre il
 * selettore del sistema operativo: sul telefono e' quello che l'utente conosce gia', arriva
 * tradotto, accessibile e senza una riga di JavaScript in piu'. Un calendario disegnato da
 * noi sarebbe piu' codice e meno familiare.
 *
 * **Perche' serve.** La barra dei giorni copre una settimana attorno a quella mostrata: per
 * arrivare a una gara di un mese fa ci vorrebbero molti tocchi, e senza passato la verifica
 * predetto-contro-reale resterebbe quasi irraggiungibile.
 */
export function DateJump({ date, leagueId, stato }: DateJumpProps) {
  const router = useRouter();
  return (
    <label className="partite-salto">
      <span className="partite-salto-label">Vai a una data</span>
      <input
        type="date"
        className="partite-salto-input"
        value={date}
        onChange={(evento) => {
          const scelta = evento.target.value;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(scelta)) return;
          const parametri = new URLSearchParams();
          parametri.set("date", scelta);
          if (leagueId !== null) parametri.set("leagueId", String(leagueId));
          if (stato && stato !== "tutte") parametri.set("stato", stato);
          router.push(`/partite?${parametri.toString()}`);
        }}
      />
    </label>
  );
}
