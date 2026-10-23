import "server-only";
import { cacheLife } from "next/cache";

// Accounts whose PUBLIC repos are shown. Private repos are never queried or rendered.
export const OWNERS = (process.env.GITHUB_OWNERS ?? "quirq-ai,quirq-gates")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const WEEKS = 12;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FEED_LIMIT = 60;

export type CiState = "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED";

export type Repo = {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  language: { name: string; color: string | null } | null;
  stars: number;
  forks: number;
  openIssues: number;
  openPRs: number;
  pushedAt: string | null;
  archived: boolean;
  fork: boolean;
  defaultBranch: string | null;
  ci: CiState | null;
  release: { tag: string; publishedAt: string | null; url: string } | null;
  /** Commits on the default branch per week, oldest first. */
  weekly: number[];
};

export type Owner = { login: string; url: string; avatarUrl: string; kind: "Organization" | "User" };

export type FeedItem = {
  id: string;
  createdAt: string;
  actor: string;
  actorAvatar: string;
  repo: string;
  kind: "push" | "pr" | "review" | "issue" | "comment" | "release" | "branch" | "star" | "fork" | "other";
  verb: string;
  ref?: { label: string; url: string };
  title?: string;
};

export type Dashboard = {
  ok: boolean;
  error?: string;
  fetchedAt: string;
  owners: Owner[];
  repos: Repo[];
  weekStarts: string[];
  totals: { commits7d: number; prsOpened7d: number; prsMerged7d: number; issuesOpened7d: number; activeRepos7d: number };
  feed: FeedItem[];
};

export type RepoDetail = {
  commits: {
    oid: string;
    shortOid: string;
    headline: string;
    url: string;
    committedAt: string;
    author: string;
    avatarUrl: string | null;
  }[];
  pulls: {
    number: number;
    title: string;
    url: string;
    draft: boolean;
    updatedAt: string;
    author: string;
    avatarUrl: string | null;
  }[];
};

class GitHubError extends Error {}

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, { headers: headers() });
  if (!res.ok) throw new GitHubError(`GitHub ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

/** GraphQL call that tolerates partial errors (e.g. a deleted PR) when data came back. */
async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new GitHubError(`GitHub GraphQL ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (!body.data) throw new GitHubError(body.errors?.[0]?.message ?? "GitHub GraphQL returned no data");
  return body.data;
}

function headers(): HeadersInit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new GitHubError("GITHUB_TOKEN is not configured");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "github-activity-dashboard",
  };
}

function weekBoundaries(now: number): string[] {
  // WEEKS + 1 boundaries, oldest first; the last one is "now".
  return Array.from({ length: WEEKS + 1 }, (_, i) => new Date(now - (WEEKS - i) * WEEK_MS).toISOString());
}

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
  owner: { login: string };
  primaryLanguage: { name: string; color: string | null } | null;
  issues: { totalCount: number };
  pullRequests: { totalCount: number };
  latestRelease: { tagName: string; publishedAt: string | null; url: string } | null;
  defaultBranchRef: {
    name: string;
    target: { statusCheckRollup: { state: CiState } | null } | null;
  } | null;
};

const OWNER_QUERY = `query($login: String!) {
  repositoryOwner(login: $login) {
    __typename login url avatarUrl
    repositories(first: 100, privacy: PUBLIC, ownerAffiliations: [OWNER], orderBy: {field: PUSHED_AT, direction: DESC}) {
      nodes {
        name isPrivate isArchived isFork description url pushedAt stargazerCount forkCount
        owner { login }
        primaryLanguage { name color }
        issues(states: OPEN) { totalCount }
        pullRequests(states: OPEN) { totalCount }
        latestRelease { tagName publishedAt url }
        defaultBranchRef { name target { ... on Commit { statusCheckRollup { state } } } }
      }
    }
  }
}`;

/** Weekly commit counts are slow for GitHub to compute, so ask for a few repos per request, in parallel. */
async function fetchWeekly(repos: Repo[], bounds: string[]) {
  const vars = bounds.map((_, i) => `$s${i}: GitTimestamp!`).join(", ");
  const weeks = Array.from({ length: WEEKS }, (_, i) => `w${i}: history(since: $s${i}, until: $s${i + 1}) { totalCount }`).join(" ");
  const variables = Object.fromEntries(bounds.map((b, i) => [`s${i}`, b]));
  const chunks: Repo[][] = [];
  for (let i = 0; i < repos.length; i += 8) chunks.push(repos.slice(i, i + 8));
  await Promise.all(
    chunks.map(async (chunk) => {
      const fields = chunk
        .map((r, j) => `r${j}: repository(owner: ${JSON.stringify(r.owner)}, name: ${JSON.stringify(r.name)}) { defaultBranchRef { target { ... on Commit { ${weeks} } } } }`)
        .join("\n");
      const data = await gql<Record<string, { defaultBranchRef: { target: Record<string, { totalCount: number }> | null } | null } | null>>(
        `query(${vars}) { ${fields} }`,
        variables,
      ).catch(() => null);
      chunk.forEach((r, j) => {
        const t = data?.[`r${j}`]?.defaultBranchRef?.target;
        if (t) r.weekly = Array.from({ length: WEEKS }, (_, i) => t[`w${i}`]?.totalCount ?? 0);
      });
    }),
  );
}

async function fetchOwner(login: string) {
  const data = await gql<{
    repositoryOwner: {
      __typename: "Organization" | "User";
      login: string;
      url: string;
      avatarUrl: string;
      repositories: { nodes: RepoNode[] };
    } | null;
  }>(OWNER_QUERY, { login });
  const o = data.repositoryOwner;
  if (!o) return null;
  const repos: Repo[] = o.repositories.nodes
    // Belt and braces: the query asks for PUBLIC only, but never let a private repo through.
    .filter((r) => !r.isPrivate && r.owner.login.toLowerCase() === login.toLowerCase())
    .map((r) => {
      const target = r.defaultBranchRef?.target;
      return {
        owner: r.owner.login,
        name: r.name,
        fullName: `${r.owner.login}/${r.name}`,
        url: r.url,
        description: r.description,
        language: r.primaryLanguage,
        stars: r.stargazerCount,
        forks: r.forkCount,
        openIssues: r.issues.totalCount,
        openPRs: r.pullRequests.totalCount,
        pushedAt: r.pushedAt,
        archived: r.isArchived,
        fork: r.isFork,
        defaultBranch: r.defaultBranchRef?.name ?? null,
        ci: target?.statusCheckRollup?.state ?? null,
        release: r.latestRelease
          ? { tag: r.latestRelease.tagName, publishedAt: r.latestRelease.publishedAt, url: r.latestRelease.url }
          : null,
        weekly: Array<number>(WEEKS).fill(0),
      };
    });
  const owner: Owner = { login: o.login, url: o.url, avatarUrl: o.avatarUrl, kind: o.__typename };
  return { owner, repos };
}

type RawEvent = {
  id: string;
  type: string;
  created_at: string;
  actor: { login: string; avatar_url: string };
  repo: { name: string };
  payload: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
};

async function fetchEvents(owners: Owner[], repos: Repo[]): Promise<RawEvent[]> {
  const requests: Promise<RawEvent[]>[] = [];
  for (const o of owners) {
    if (o.kind === "Organization") {
      for (const page of [1, 2, 3]) requests.push(gh<RawEvent[]>(`/orgs/${o.login}/events?per_page=100&page=${page}`).catch(() => []));
    } else {
      // A user's own events feed covers activity elsewhere too; ask each of their public repos instead.
      for (const r of repos.filter((r) => r.owner === o.login).slice(0, 10))
        requests.push(gh<RawEvent[]>(`/repos/${r.fullName}/events?per_page=100`).catch(() => []));
    }
  }
  return (await Promise.all(requests)).flat();
}

function shortRef(ref: string | undefined) {
  return (ref ?? "").replace(/^refs\/(heads|tags)\//, "");
}

function toFeedItem(e: RawEvent): FeedItem {
  const base = {
    id: e.id,
    createdAt: e.created_at,
    actor: e.actor.login,
    actorAvatar: e.actor.avatar_url,
    repo: e.repo.name,
  };
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
      return {
        ...base,
        kind: "pr",
        verb: `${p.action} pull request`,
        ref: { label: `#${n}`, url: `${repoUrl}/pull/${n}` },
        title: p.pull_request?.title,
      };
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
  try {
    const data = await gql<Record<string, Record<string, { messageHeadline?: string; title?: string } | null> | null>>(
      `query { ${repoAliases.map((r) => r.q).join("\n")} }`,
    );
    for (const r of repoAliases) {
      for (const f of r.fields) {
        const v = data[r.alias]?.[f.alias];
        const title = v?.messageHeadline ?? v?.title;
        if (title) f.item.title = title;
      }
    }
  } catch {
    // Titles are a nice-to-have; keep the feed without them.
  }
}

async function weeklyCounts(owners: Owner[], since: string) {
  const scope = owners.map((o) => (o.kind === "Organization" ? `org:${o.login}` : `user:${o.login}`)).join(" ");
  const day = since.slice(0, 10);
  const q = (s: string) => JSON.stringify(`${s} is:public ${scope}`);
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

export async function getDashboard(): Promise<Dashboard> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });

  const now = Date.now();
  const bounds = weekBoundaries(now);
  const empty: Dashboard = {
    ok: false,
    fetchedAt: new Date(now).toISOString(),
    owners: [],
    repos: [],
    weekStarts: bounds.slice(0, WEEKS),
    totals: { commits7d: 0, prsOpened7d: 0, prsMerged7d: 0, issuesOpened7d: 0, activeRepos7d: 0 },
    feed: [],
  };
  try {
    const results = (await Promise.all(OWNERS.map((o) => fetchOwner(o)))).filter((r) => r !== null);
    const owners = results.map((r) => r.owner);
    const repos = results
      .flatMap((r) => r.repos)
      .sort((a, b) => (b.pushedAt ?? "").localeCompare(a.pushedAt ?? ""));
    const publicNames = new Set(repos.map((r) => r.fullName.toLowerCase()));

    const [rawEvents, , counts] = await Promise.all([
      fetchEvents(owners, repos),
      fetchWeekly(repos, bounds),
      weeklyCounts(owners, bounds[WEEKS - 1]).catch(() => ({ prsOpened7d: 0, prsMerged7d: 0, issuesOpened7d: 0 })),
    ]);
    const raw = new Map<string, RawEvent>();
    for (const e of rawEvents) if (publicNames.has(e.repo.name.toLowerCase())) raw.set(e.id, e);
    const feed = [...raw.values()]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, FEED_LIMIT)
      .map(toFeedItem);
    await enrichFeed(feed, raw);

    return {
      ...empty,
      ok: true,
      owners,
      repos,
      feed,
      totals: {
        commits7d: repos.reduce((n, r) => n + r.weekly[WEEKS - 1], 0),
        activeRepos7d: repos.filter((r) => r.weekly[WEEKS - 1] > 0).length,
        ...counts,
      },
    };
  } catch (err) {
    return { ...empty, error: err instanceof GitHubError ? err.message : "Could not reach GitHub" };
  }
}

export async function getRepoDetail(owner: string, name: string): Promise<RepoDetail | null> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });

  if (!OWNERS.some((o) => o.toLowerCase() === owner.toLowerCase())) return null;
  type Actor = { login: string; avatarUrl: string } | null;
  const data = await gql<{
    repository: {
      isPrivate: boolean;
      defaultBranchRef: { target: { history: { nodes: {
        oid: string; abbreviatedOid: string; messageHeadline: string; url: string; committedDate: string;
        author: { name: string | null; user: Actor } | null;
      }[] } } | null } | null;
      pullRequests: { nodes: { number: number; title: string; url: string; isDraft: boolean; updatedAt: string; author: Actor }[] };
    } | null;
  }>(
    `query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        isPrivate
        defaultBranchRef { target { ... on Commit { history(first: 20) { nodes {
          oid abbreviatedOid messageHeadline url committedDate
          author { name user { login avatarUrl } }
        } } } } }
        pullRequests(states: OPEN, first: 20, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes {
          number title url isDraft updatedAt author { login avatarUrl }
        } }
      }
    }`,
    { owner, name },
  ).catch(() => null);
  const repo = data?.repository;
  if (!repo || repo.isPrivate) return null;
  return {
    commits: (repo.defaultBranchRef?.target?.history.nodes ?? []).map((c) => ({
      oid: c.oid,
      shortOid: c.abbreviatedOid,
      headline: c.messageHeadline,
      url: c.url,
      committedAt: c.committedDate,
      author: c.author?.user?.login ?? c.author?.name ?? "unknown",
      avatarUrl: c.author?.user?.avatarUrl ?? null,
    })),
    pulls: repo.pullRequests.nodes.map((p) => ({
      number: p.number,
      title: p.title,
      url: p.url,
      draft: p.isDraft,
      updatedAt: p.updatedAt,
      author: p.author?.login ?? "ghost",
      avatarUrl: p.author?.avatarUrl ?? null,
    })),
  };
}
