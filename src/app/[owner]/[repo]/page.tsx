import Link from "next/link";
import { notFound } from "next/navigation";
import { CiBadge } from "@/components/ci-badge";
import { Feed } from "@/components/feed";
import { Header } from "@/components/header";
import { Links } from "@/components/links";
import { Stat } from "@/components/stat";
import { TimeAgo } from "@/components/time-ago";
import { WeeklyChart } from "@/components/weekly-chart";
import { getRepo, getSnapshot, type Pull } from "@/lib/github";

export function generateStaticParams() {
  return getSnapshot().repos.map((r) => ({ owner: r.owner, repo: r.name }));
}

// The site is a static snapshot: anything not in it is a 404.
export const dynamicParams = false;

function PullList({ pulls, empty }: { pulls: Pull[]; empty: string }) {
  if (pulls.length === 0) return <p className="text-sm text-ink-3">{empty}</p>;
  return (
    <ol className="divide-y divide-border">
      {pulls.map((p) => (
        <li key={p.number} className="flex items-baseline gap-3 py-2 text-sm">
          <a href={p.url} target="_blank" rel="noreferrer" className="font-mono text-xs text-accent hover:underline">
            #{p.number}
          </a>
          <a href={p.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-ink hover:underline" title={p.title}>
            {p.draft && <span className="mr-1 text-ink-3">[draft]</span>}
            {p.title}
          </a>
          <span className="shrink-0 text-xs text-ink-3">
            {p.author} · <TimeAgo iso={p.at} />
          </span>
        </li>
      ))}
    </ol>
  );
}

export default async function RepoPage({ params }: PageProps<"/[owner]/[repo]">) {
  const { owner, repo: name } = await params;
  const d = getSnapshot();
  // Only projects listed in the snapshot can be viewed.
  const repo = getRepo(owner, name);
  if (!repo) notFound();
  const feed = d.feed.filter((e) => e.repo.toLowerCase() === repo.fullName.toLowerCase());

  return (
    <>
      <Header title={d.title} owners={d.owners} siblings={d.siblings} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <Link href="/" className="text-sm text-ink-3 hover:text-ink">
          ← All projects
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold tracking-tight">
              <span className="font-normal text-ink-3">{repo.owner} / </span>
              {repo.name}
            </h1>
            {(repo.about ?? repo.description) && <p className="mt-2 text-ink-2">{repo.about ?? repo.description}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-3">
              {repo.language && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full" style={{ background: repo.language.color ?? "var(--text-muted)" }} />
                  {repo.language.name}
                </span>
              )}
              {repo.defaultBranch && <span className="font-mono text-xs">{repo.defaultBranch}</span>}
              <CiBadge state={repo.ci} />
              <span>
                pushed <TimeAgo iso={repo.pushedAt} />
              </span>
              {repo.release && (
                <a href={repo.release.url} target="_blank" rel="noreferrer" className="hover:text-ink">
                  release <span className="font-mono">{repo.release.tag}</span>
                </a>
              )}
            </div>
            <Links links={repo.links} className="mt-3" />
          </div>
          <a
            href={repo.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-border bg-surface-1 px-3 py-1.5 text-sm hover:border-accent"
          >
            View on GitHub ↗
          </a>
        </div>

        <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Commits, 12 weeks" value={repo.weekly.reduce((a, b) => a + b, 0)} />
          <Stat label="Open PRs" value={repo.openPRs} />
          <Stat label="Open issues" value={repo.openIssues} />
          <Stat label="Stars" value={repo.stars} />
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <section className="rounded-lg border border-border bg-surface-1 p-4 lg:col-span-3">
            <h2 className="text-sm font-semibold">Commits per week</h2>
            <p className="mb-3 text-xs text-ink-3">Default branch, last 12 weeks</p>
            <WeeklyChart values={repo.weekly} weekStarts={d.weekStarts} />
          </section>
          <section className="rounded-lg border border-border bg-surface-1 p-4 lg:col-span-2">
            <h2 className="text-sm font-semibold">Recent activity</h2>
            <div className="mt-1 max-h-[22rem] overflow-y-auto pr-1">
              <Feed items={feed} showRepo={false} />
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-border bg-surface-1 p-4">
            <h2 className="mb-2 text-sm font-semibold">Latest commits</h2>
            {repo.commits.length === 0 ? (
              <p className="text-sm text-ink-3">No commits to show.</p>
            ) : (
              <ol className="divide-y divide-border">
                {repo.commits.map((c) => (
                  <li key={c.oid} className="flex items-baseline gap-3 py-2 text-sm">
                    <a href={c.url} target="_blank" rel="noreferrer" className="font-mono text-xs text-accent hover:underline">
                      {c.shortOid}
                    </a>
                    <a href={c.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-ink hover:underline" title={c.headline}>
                      {c.headline}
                    </a>
                    <span className="shrink-0 text-xs text-ink-3">
                      {c.author} · <TimeAgo iso={c.committedAt} />
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <div className="flex flex-col gap-6">
            <section className="rounded-lg border border-border bg-surface-1 p-4">
              <h2 className="mb-2 text-sm font-semibold">Recently merged</h2>
              <PullList pulls={repo.mergedPulls} empty="No merged pull requests." />
            </section>
            <section className="rounded-lg border border-border bg-surface-1 p-4">
              <h2 className="mb-2 text-sm font-semibold">Open pull requests</h2>
              <PullList pulls={repo.openPulls} empty="No open pull requests." />
            </section>
          </div>
        </div>
      </main>
      <footer className="mx-auto w-full max-w-6xl px-4 py-6 text-xs text-ink-3 sm:px-6">
        Snapshot of GitHub taken <TimeAgo iso={d.takenAt} />.
      </footer>
    </>
  );
}
