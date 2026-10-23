// Twelve thin columns, one per week; the current week takes the accent, earlier weeks recede.
export function Sparkline({ values, weekStarts, label }: { values: number[]; weekStarts: string[]; label: string }) {
  const max = Math.max(1, ...values);
  const w = 6;
  const gap = 2;
  const h = 28;
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <svg
      width={values.length * (w + gap) - gap}
      height={h}
      role="img"
      aria-label={`${label}: ${total} commits over ${values.length} weeks`}
      className="shrink-0"
    >
      {values.map((v, i) => {
        const bh = v === 0 ? 1 : Math.max(2, (v / max) * h);
        const last = i === values.length - 1;
        return (
          <rect
            key={i}
            x={i * (w + gap)}
            y={h - bh}
            width={w}
            height={bh}
            rx={v === 0 ? 0 : 1.5}
            className={v === 0 ? "fill-grid" : last ? "fill-accent" : "fill-accent-soft"}
          >
            <title>{`Week of ${new Date(weekStarts[i]).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}: ${v} commit${v === 1 ? "" : "s"}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
