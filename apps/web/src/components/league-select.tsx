"use client";

import { useRouter } from "next/navigation";

export type LeagueOption = { readonly id: number; readonly label: string; readonly count: number };

type LeagueSelectProps = Readonly<{
  date: string;
  current: number | null;
  options: readonly LeagueOption[];
  total: number;
}>;

export function LeagueSelect({ date, current, options, total }: LeagueSelectProps) {
  const router = useRouter();
  return (
    <select
      className="partite-league-select"
      aria-label="Filtra per campionato (opzionale)"
      value={current ?? ""}
      onChange={(event) => {
        const value = event.target.value;
        const params = new URLSearchParams();
        params.set("date", date);
        if (value) params.set("leagueId", value);
        router.push(`/partite?${params.toString()}`);
      }}
    >
      <option value="">Tutti i campionati ({total} gare)</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label} ({option.count})
        </option>
      ))}
    </select>
  );
}
