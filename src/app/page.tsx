import { Feed } from "@/components/feed";
import { Header } from "@/components/header";
import { RepoList } from "@/components/repo-list";
import { Stat } from "@/components/stat";
import { WeeklyChart } from "@/components/weekly-chart";
import { getDashboard, WEEKS } from "@/lib/github";

export default async function Home() {
  const d = await getDashboard();
  const weekly = Array.from({ length: WEEKS }, (_, i) => d.repos.reduce((n, r) => n + r.weekly[i], 0));

  return (
    <>
      <Header owners={d.owners} fetchedAt={d.fetchedAt} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        {!d.ok && (
          <div role="alert" className="mb-6 rounded-lg border border-critical/40 bg-surface-1 p-4 text-sm">
            <span className="font-medium text-critical">✕ Couldn&apos;t load GitHub data.</span>{" "}
            <span className="text-ink-2">{d.error}. The page retries every few minutes.</span>
          </div>
        )}

        <section aria-label="Last 7 days" className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1 md:row-span-1">
            <Stat label="Commits, last 7 days" value={d.totals.commits7d} hero />
          </div>
          <Stat label="PRs opened" value={d.totals.prsOpened7d} />
          <Stat label="PRs merged" value={d.totals.prsMerged7d} />
          <Stat label="Issues opened" value={d.totals.issuesOpened7d} />
          <Stat label={`Active repos of ${d.repos.length}`} value={d.totals.activeRepos7d} />
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-5">
          <section className="rounded-lg border border-border bg-surface-1 p-4 lg:col-span-3">
            <h2 className="text-sm font-semibold">Commits per week</h2>
            <p className="mb-3 text-xs text-ink-3">Default branches of all public repos, last {WEEKS} weeks</p>
            <WeeklyChart values={weekly} weekStarts={d.weekStarts} />
          </section>
          <section className="rounded-lg border border-border bg-surface-1 p-4 lg:col-span-2">
            <h2 className="text-sm font-semibold">Live activity</h2>
            <div className="mt-1 max-h-[22rem] overflow-y-auto pr-1">
              <Feed items={d.feed} />
            </div>
          </section>
        </div>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold">
            Repositories <span className="font-normal text-ink-3">· {d.repos.length} public</span>
          </h2>
          <RepoList repos={d.repos} weekStarts={d.weekStarts} />
        </section>
      </main>
      <footer className="mx-auto w-full max-w-6xl px-4 py-6 text-xs text-ink-3 sm:px-6">
        Public repositories only. Data from the GitHub API, refreshed every 5 minutes.
      </footer>
    </>
  );
}
