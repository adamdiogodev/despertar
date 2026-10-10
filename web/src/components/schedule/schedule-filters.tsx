"use client";

import { Select } from "@/components/ui/form";
import type { Option } from "./types";

// GET form: filters live in the URL so the page stays server-rendered.
export function ScheduleFilters({
  week,
  isStaff,
  therapists,
  rooms,
  therapist,
  room,
  scope,
}: {
  week: string;
  isStaff: boolean;
  therapists: Option[];
  rooms: Option[];
  therapist?: string;
  room?: string;
  scope: "mine" | "all";
}) {
  const submit = (event: React.ChangeEvent<HTMLSelectElement>) => event.currentTarget.form?.requestSubmit();
  return (
    <form method="get" className="flex flex-wrap gap-2" data-testid="schedule-filters">
      <input type="hidden" name="week" value={week} />
      {isStaff ? (
        <>
          <Select name="therapist" defaultValue={therapist ?? ""} onChange={submit} className="w-auto" aria-label="Terapeuta">
            <option value="">Todas as terapeutas</option>
            {therapists.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select name="room" defaultValue={room ?? ""} onChange={submit} className="w-auto" aria-label="Sala">
            <option value="">Todas as salas</option>
            {rooms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </>
      ) : (
        <Select name="scope" defaultValue={scope} onChange={submit} className="w-auto" aria-label="Sessões exibidas">
          <option value="mine">Minhas sessões</option>
          <option value="all">Todas que posso ver</option>
        </Select>
      )}
      <noscript>
        <button type="submit">Filtrar</button>
      </noscript>
    </form>
  );
}
