export function Stat({ label, value, hero = false }: { label: string; value: number; hero?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface-1 px-4 py-3">
      <p className="text-xs text-ink-3">{label}</p>
      <p className={`${hero ? "text-5xl" : "text-2xl"} mt-1 font-semibold tracking-tight text-ink`}>{value.toLocaleString("en-US")}</p>
    </div>
  );
}
