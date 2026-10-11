// Single-series bar chart: sessions held per week. One hue, no legend (the
// title names the series), per-bar hover tooltip, values also in an sr-only table.
export function WeeklySessionsChart({ weeks }: { weeks: { label: string; count: number }[] }) {
  const max = Math.max(1, ...weeks.map((week) => week.count));
  return (
    <div>
      <div className="flex h-44 items-end gap-0.5 border-b border-line pb-0" aria-hidden>
        {weeks.map((week) => (
          <div key={week.label} className="group relative flex h-full flex-1 flex-col justify-end px-1">
            <div className="pointer-events-none absolute -top-1 left-1/2 z-10 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-t1 px-2 py-1 text-[11px] font-semibold text-white group-hover:block">
              {week.label}: {week.count} sessões
            </div>
            <div
              className="w-full rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80"
              style={{ height: `${(week.count / max) * 100}%`, minHeight: week.count ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-0.5" aria-hidden>
        {weeks.map((week) => (
          <div key={week.label} className="flex-1 text-center text-[10px] text-t3">
            {week.label}
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Sessões realizadas por semana</caption>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.label}>
              <th scope="row">{week.label}</th>
              <td>{week.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
