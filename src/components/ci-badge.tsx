import type { CiState } from "@/lib/github";

// Status colors are reserved for CI state and always carry an icon + label.
const STATES: Record<CiState, { label: string; icon: string; className: string }> = {
  SUCCESS: { label: "Passing", icon: "✓", className: "text-good" },
  FAILURE: { label: "Failing", icon: "✕", className: "text-critical" },
  ERROR: { label: "Error", icon: "!", className: "text-critical" },
  PENDING: { label: "Running", icon: "●", className: "text-warning" },
  EXPECTED: { label: "Waiting", icon: "○", className: "text-warning" },
};

export function CiBadge({ state }: { state: CiState | null }) {
  if (!state) return <span className="text-xs text-ink-3">No CI</span>;
  const s = STATES[state];
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-2">
      <span aria-hidden className={`font-bold ${s.className}`}>
        {s.icon}
      </span>
      {s.label}
    </span>
  );
}
