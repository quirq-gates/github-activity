// Fetches the repos listed in portfolio.json from GitHub and writes src/data/snapshot.json.
// Runs on a developer machine only (`npm run snapshot`); the deployed site never calls GitHub
// and holds no token. The token comes from GITHUB_TOKEN or the local `gh` login and is never written out.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CiState, Commit, FeedItem, Link, Owner, Pull, Repo, Snapshot } from "../src/lib/types.ts";

const WEEKS = 12;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FEED_LIMIT = 60;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(root, "portfolio.json"), "utf8")) as {
  title: string;
  tagline: string;
  siblings: Link[];
  repos: { repo: string; about?: string; links?: Link[] }[];
};

const token = process.env.GITHUB_TOKEN || execFileSync("gh", ["auth", "token"], { encoding: "utf8" }).trim();
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "space-portfolio-snapshot",
};

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

/** GraphQL call that tolerates partial errors (e.g. a deleted PR) when data came back. */
async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (!body.data) throw new Error(body.errors?.[0]?.message ?? "GitHub GraphQL returned no data");
  return body.data;
}

type Actor = { login: string; avatarUrl: string } | null;
type PullNode = { number: number; title: string; url: string; isDraft: boolean; updatedAt: string; mergedAt: string | null; author: Actor };

const REPO_QUERY = `query($owner: String!, $name: String!) {
  repository(owner: $owner, name: $name) {
    name isPrivate isArchived isFork description url pushedAt stargazerCount forkCount homepageUrl
    owner { login url avatarUrl }
    primaryLanguage { name color }
    issues(states: OPEN) { totalCount }
    open: pullRequests(states: OPEN, first: 20, orderBy: {field: UPDATED_AT, direction: DESC}) {
      totalCount nodes { number title url isDraft updatedAt mergedAt author { login avatarUrl } }
    }
    merged: pullRequests(states: MERGED, first: 15, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes { number title url isDraft updatedAt mergedAt author { login avatarUrl } }
    }
    latestRelease { tagName publishedAt url }
    defaultBranchRef { name target { ... on Commit {
      statusCheckRollup { state }
      history(first: 20) { nodes {
        oid abbreviatedOid messageHeadline url committedDate
        author { name user { login avatarUrl } }
      } }
    } } }
  }
}`;

type RepoNode = {
  name: string;
  isPrivate: boolean;
  isArchived: boolean;
  isFork: boolean;
  description: string | null;
  url: string;
  pushedAt: string | null;
  stargazerCount: number;
  forkCount: number;
  homepageUrl: string | null;
  owner: Owner;
  primaryLanguage: { name: string; color: string | null } | null;
  issues: { totalCount: number };
  open: { totalCount: number; nodes: PullNode[] };
  merged: { nodes: PullNode[] };
  latestRelease: { tagName: string; publishedAt: string | null; url: string } | null;
  defaultBranchRef: {
    name: string;
    target: {
      statusCheckRollup: { state: CiState } | null;
      history: { nodes: { oid: string; abbreviatedOid: string; messageHeadline: string; url: string; committedDate: string; author: { name: string | null; user: Actor } | null }[] };
    } | null;
  } | null;
};

const toPull = (p: PullNode): Pull => ({
  number: p.number,
  title: p.title,
  url: p.url,
  draft: p.isDraft,
  at: p.mergedAt ?? p.updatedAt,
  author: p.author?.login ?? "ghost",
  avatarUrl: p.author?.avatarUrl ?? null,
});

async function fetchRepo(entry: { repo: string; about?: string; links?: Link[] }): Promise<{ repo: Repo; owner: Owner }> {
  const [owner, name] = entry.repo.split("/");
  const { repository: r } = await gql<{ repository: RepoNode | null }>(REPO_QUERY, { owner, name });
  if (!r) throw new Error(`${entry.repo} not found`);
  // The portfolio is public; refuse to snapshot a private repo even if it is listed.
  if (r.isPrivate) throw new Error(`${entry.repo} is private; remove it from portfolio.json`);
  const target = r.defaultBranchRef?.target;
  const links = [...(entry.links ?? [])];
  if (r.homepageUrl && !links.some((l) => l.url.replace(/\/$/, "") === r.homepageUrl!.replace(/\/$/, "")))
    links.unshift({ label: r.homepageUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""), url: r.homepageUrl });
  const commits: Commit[] = (target?.history.nodes ?? []).map((c) => ({
    oid: c.oid,
    shortOid: c.abbreviatedOid,
    headline: c.messageHeadline,
    url: c.url,
    committedAt: c.committedDate,
    author: c.author?.user?.login ?? c.author?.name ?? "unknown",
    avatarUrl: c.author?.user?.avatarUrl ?? null,
  }));
  return {
    owner: r.owner,
    repo: {
      owner: r.owner.login,
      name: r.name,
      fullName: `${r.owner.login}/${r.name}`,
      url: r.url,
      about: entry.about ?? null,
      description: r.description,
      links,
      language: r.primaryLanguage,
      stars: r.stargazerCount,
      forks: r.forkCount,
      openIssues: r.issues.totalCount,
      openPRs: r.open.totalCount,
      pushedAt: r.pushedAt,
      archived: r.isArchived,
      fork: r.isFork,
      defaultBranch: r.defaultBranchRef?.name ?? null,
      ci: target?.statusCheckRollup?.state ?? null,
      release: r.latestRelease ? { tag: r.latestRelease.tagName, publishedAt: r.latestRelease.publishedAt, url: r.latestRelease.url } : null,
      weekly: Array<number>(WEEKS).fill(0),
      commits,
      openPulls: r.open.nodes.map(toPull),
      mergedPulls: r.merged.nodes.map(toPull).sort((a, b) => b.at.localeCompare(a.at)),
    },
  };
}

function weekBoundaries(now: number): string[] {
  // WEEKS + 1 boundaries, oldest first; the last one is "now".
  return Array.from({ length: WEEKS + 1 }, (_, i) => new Date(now - (WEEKS - i) * WEEK_MS).toISOString());
}

/** Weekly commit counts are slow for GitHub to compute, so ask for a few repos per request, in parallel. */
async function fetchWeekly(repos: Repo[], bounds: string[]) {
  const vars = bounds.map((_, i) => `$s${i}: GitTimestamp!`).join(", ");
  const weeks = Array.from({ length: WEEKS }, (_, i) => `w${i}: history(since: $s${i}, until: $s${i + 1}) { totalCount }`).join(" ");
  const variables = Object.fromEntries(bounds.map((b, i) => [`s${i}`, b]));
  const chunks: Repo[][] = [];
  for (let i = 0; i < repos.length; i += 4) chunks.push(repos.slice(i, i + 4));
  await Promise.all(
    chunks.map(async (chunk) => {
      const fields = chunk
        .map((r, j) => `r${j}: repository(owner: ${JSON.stringify(r.owner)}, name: ${JSON.stringify(r.name)}) { defaultBranchRef { target { ... on Commit { ${weeks} } } } }`)
        .join("\n");
      const data = await gql<Record<string, { defaultBranchRef: { target: Record<string, { totalCount: number }> | null } | null } | null>>(
        `query(${vars}) { ${fields} }`,
        variables,
      );
      chunk.forEach((r, j) => {
        const t = data[`r${j}`]?.defaultBranchRef?.target;
        if (t) r.weekly = Array.from({ length: WEEKS }, (_, i) => t[`w${i}`]?.totalCount ?? 0);
      });
    }),
  );
}

type RawEvent = {
  id: string;
  type: string;
  created_at: string;
  actor: { login: string; avatar_url: string };
  repo: { name: string };
  payload: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
};

function shortRef(ref: string | undefined) {
  return (ref ?? "").replace(/^refs\/(heads|tags)\//, "");
}

function toFeedItem(e: RawEvent): FeedItem {
  const base = { id: e.id, createdAt: e.created_at, actor: e.actor.login, actorAvatar: e.actor.avatar_url, repo: e.repo.name };
  const p = e.payload;
  const repoUrl = `https://github.com/${e.repo.name}`;
  switch (e.type) {
    case "PushEvent":
      return {
        ...base,
        kind: "push",
        verb: `pushed to ${shortRef(p.ref)}`,
        ref: p.head ? { label: String(p.head).slice(0, 7), url: `${repoUrl}/commit/${p.head}` } : undefined,
      };
    case "PullRequestEvent": {
      const n = p.number ?? p.pull_request?.number;
      return { ...base, kind: "pr", verb: `${p.action} pull request`, ref: { label: `#${n}`, url: `${repoUrl}/pull/${n}` }, title: p.pull_request?.title };
    }
    case "PullRequestReviewEvent": {
      const n = p.pull_request?.number;
      return { ...base, kind: "review", verb: "reviewed pull request", ref: { label: `#${n}`, url: `${repoUrl}/pull/${n}` }, title: p.pull_request?.title };
    }
    case "IssuesEvent":
      return { ...base, kind: "issue", verb: `${p.action} issue`, ref: { label: `#${p.issue?.number}`, url: p.issue?.html_url }, title: p.issue?.title };
    case "IssueCommentEvent":
      return { ...base, kind: "comment", verb: "commented on", ref: { label: `#${p.issue?.number}`, url: p.issue?.html_url }, title: p.issue?.title };
    case "ReleaseEvent":
      return { ...base, kind: "release", verb: `${p.action} release`, ref: { label: p.release?.tag_name, url: p.release?.html_url } };
    case "CreateEvent":
      return { ...base, kind: "branch", verb: p.ref_type === "repository" ? "created the repository" : `created ${p.ref_type} ${p.ref}` };
    case "DeleteEvent":
      return { ...base, kind: "branch", verb: `deleted ${p.ref_type} ${p.ref}` };
    case "WatchEvent":
      return { ...base, kind: "star", verb: "starred" };
    case "ForkEvent":
      return { ...base, kind: "fork", verb: "forked" };
    case "PublicEvent":
      return { ...base, kind: "other", verb: "made the repository public" };
    default:
      return { ...base, kind: "other", verb: e.type.replace(/Event$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase() };
  }
}

/** The Events API no longer carries commit messages or PR titles; look them up in one GraphQL call. */
async function enrichFeed(items: FeedItem[], raw: Map<string, RawEvent>) {
  const byRepo = new Map<string, { alias: string; item: FeedItem; field: string }[]>();
  items.forEach((item, i) => {
    const e = raw.get(item.id)!;
    let field: string | null = null;
    if (item.kind === "push" && e.payload.head) field = `object(oid: "${String(e.payload.head).replace(/[^0-9a-f]/g, "")}") { ... on Commit { messageHeadline } }`;
    else if ((item.kind === "pr" || item.kind === "review") && !item.title) {
      const n = Number(e.payload.number ?? e.payload.pull_request?.number);
      if (Number.isInteger(n)) field = `pullRequest(number: ${n}) { title }`;
    }
    if (!field) return;
    const list = byRepo.get(item.repo) ?? [];
    list.push({ alias: `f${i}`, item, field });
    byRepo.set(item.repo, list);
  });
  if (byRepo.size === 0) return;
  const repoAliases = [...byRepo.entries()].map(([fullName, fields], j) => {
    const [owner, name] = fullName.split("/");
    return { alias: `r${j}`, fields, q: `r${j}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${fields.map((f) => `${f.alias}: ${f.field}`).join(" ")} }` };
  });
  const data = await gql<Record<string, Record<string, { messageHeadline?: string; title?: string } | null> | null>>(
    `query { ${repoAliases.map((r) => r.q).join("\n")} }`,
  ).catch(() => ({}) as Record<string, null>);
  for (const r of repoAliases) {
    for (const f of r.fields) {
      const v = data[r.alias]?.[f.alias];
      const title = v?.messageHeadline ?? v?.title;
      if (title) f.item.title = title;
    }
  }
}

async function weeklyCounts(repos: Repo[], since: string) {
  const scope = repos.map((r) => `repo:${r.fullName}`).join(" ");
  const day = since.slice(0, 10);
  const q = (s: string) => JSON.stringify(`${s} ${scope}`);
  const data = await gql<Record<string, { issueCount: number }>>(`query {
    prsOpened: search(type: ISSUE, first: 0, query: ${q(`is:pr created:>=${day}`)}) { issueCount }
    prsMerged: search(type: ISSUE, first: 0, query: ${q(`is:pr is:merged merged:>=${day}`)}) { issueCount }
    issuesOpened: search(type: ISSUE, first: 0, query: ${q(`is:issue created:>=${day}`)}) { issueCount }
  }`);
  return {
    prsOpened7d: data.prsOpened.issueCount,
    prsMerged7d: data.prsMerged.issueCount,
    issuesOpened7d: data.issuesOpened.issueCount,
  };
}

async function main() {
  const now = Date.now();
  const bounds = weekBoundaries(now);
  const fetched = await Promise.all(config.repos.map(fetchRepo));
  const repos = fetched.map((f) => f.repo);
  const owners = [...new Map(fetched.map((f) => [f.owner.login, f.owner])).values()];
  const names = new Set(repos.map((r) => r.fullName.toLowerCase()));

  const [events, , counts] = await Promise.all([
    Promise.all(repos.map((r) => gh<RawEvent[]>(`/repos/${r.fullName}/events?per_page=100`).catch(() => []))).then((l) => l.flat()),
    fetchWeekly(repos, bounds),
    weeklyCounts(repos, bounds[WEEKS - 1]),
  ]);
  const raw = new Map<string, RawEvent>();
  for (const e of events) if (names.has(e.repo.name.toLowerCase())) raw.set(e.id, e);
  const feed = [...raw.values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, FEED_LIMIT)
    .map(toFeedItem);
  await enrichFeed(feed, raw);

  const snapshot: Snapshot = {
    takenAt: new Date(now).toISOString(),
    title: config.title,
    tagline: config.tagline,
    siblings: config.siblings,
    owners,
    repos,
    weekStarts: bounds.slice(0, WEEKS),
    totals: {
      commits7d: repos.reduce((n, r) => n + r.weekly[WEEKS - 1], 0),
      activeRepos7d: repos.filter((r) => r.weekly[WEEKS - 1] > 0).length,
      ...counts,
    },
    feed,
  };
  const out = join(root, "src/data/snapshot.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`Wrote ${out}: ${repos.length} repos, ${feed.length} feed items, ${snapshot.totals.commits7d} commits in the last 7 days.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
