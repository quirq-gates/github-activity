import type { Link } from "@/lib/github";

/** Live sites and other public links of a project. */
export function Links({ links, className = "" }: { links: Link[]; className?: string }) {
  if (links.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {links.map((l) => (
        <a
          key={l.url}
          href={l.url}
          target="_blank"
          rel="noreferrer"
          className="relative z-10 inline-flex items-center gap-1 rounded-md border border-border bg-surface-0 px-2 py-0.5 text-xs text-ink-2 hover:border-accent hover:text-ink"
        >
          <span aria-hidden className="text-good">●</span>
          {l.label}
          <span aria-hidden>↗</span>
        </a>
      ))}
    </div>
  );
}
