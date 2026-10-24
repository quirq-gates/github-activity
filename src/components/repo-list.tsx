"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Repo } from "@/lib/github";
import { CiBadge } from "./ci-badge";
import { Links } from "./links";
import { Sparkline } from "./sparkline";
import { TimeAgo } from "./time-ago";

type Sort = "pushed" | "commits" | "stars" | "name";
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

export function RepoList({ repos, weekStarts }: { repos: Repo[]; weekStarts: string[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("pushed");
  const [showArchived, setShowArchived] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = repos.filter(
      (r) =>
        (showArchived || !r.archived) &&
        (!q || r.fullName.toLowerCase().includes(q) || (r.about ?? r.description)?.toLowerCase().includes(q) || r.language?.name.toLowerCase().includes(q)),
    );
    const by: Record<Sort, (a: Repo, b: Repo) => number> = {
      pushed: (a, b) => (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""),
      commits: (a, b) => sum(b.weekly) - sum(a.weekly),
      stars: (a, b) => b.stars - a.stars,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return list.sort(by[sort]);
  }, [repos, query, sort, showArchived]);

  const archivedCount = repos.filter((r) => r.archived).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter projects by name, description, language"
          className="h-9 min-w-56 flex-1 rounded-md border border-border bg-surface-1 px-3 text-sm placeholder:text-ink-3 focus:outline-2 focus:outline-accent"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="h-9 rounded-md border border-border bg-surface-1 px-2 text-sm"
          aria-label="Sort repositories"
        >
          <option value="pushed">Recently pushed</option>
          <option value="commits">Most commits (12 weeks)</option>
          <option value="stars">Most stars</option>
          <option value="name">Name</option>
        </select>
        {archivedCount > 0 && (
          <label className="flex items-center gap-1.5 text-sm text-ink-2">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Archived ({archivedCount})
          </label>
        )}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((r) => (
          <li key={r.fullName} className="relative flex h-full flex-col gap-2 rounded-lg border border-border bg-surface-1 p-4 transition-colors hover:border-accent">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-xs text-ink-3">{r.owner}</p>
                <Link href={`/${r.fullName}`} className="block truncate font-semibold text-ink after:absolute after:inset-0">
                  {r.name}
                  {r.archived && <span className="ml-2 rounded border border-border px-1 text-[10px] font-normal text-ink-3">archived</span>}
                  {r.fork && <span className="ml-2 rounded border border-border px-1 text-[10px] font-normal text-ink-3">fork</span>}
                </Link>
              </div>
              <Sparkline values={r.weekly} weekStarts={weekStarts} label={r.name} />
            </div>
            <p className="line-clamp-3 min-h-15 text-sm text-ink-2">{r.about ?? r.description ?? <span className="text-ink-3">No description</span>}</p>
            {r.commits[0] && (
              <p className="truncate text-xs text-ink-3" title={r.commits[0].headline}>
                Latest: <span className="text-ink-2">{r.commits[0].headline}</span>
              </p>
            )}
            <Links links={r.links} />
            <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs text-ink-3">
              {r.language && (
                <span className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full" style={{ background: r.language.color ?? "var(--text-muted)" }} />
                  {r.language.name}
                </span>
              )}
              <CiBadge state={r.ci} />
              <span title="Open pull requests">{r.openPRs} PRs</span>
              <span title="Open issues">{r.openIssues} issues</span>
              {r.stars > 0 && <span>★ {r.stars}</span>}
              {r.release && <span className="font-mono">{r.release.tag}</span>}
              <span className="ml-auto">
                pushed <TimeAgo iso={r.pushedAt} />
              </span>
            </div>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="py-8 text-center text-sm text-ink-3">No repositories match.</p>}
    </div>
  );
}
