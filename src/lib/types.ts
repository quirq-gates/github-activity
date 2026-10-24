// Shape of src/data/snapshot.json, written by scripts/snapshot.ts and read by the pages.

export const WEEKS = 12;

export type CiState = "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED";

export type Link = { label: string; url: string };

export type Commit = {
  oid: string;
  shortOid: string;
  headline: string;
  url: string;
  committedAt: string;
  author: string;
  avatarUrl: string | null;
};

export type Pull = {
  number: number;
  title: string;
  url: string;
  draft: boolean;
  /** Last update for open PRs, merge time for merged ones. */
  at: string;
  author: string;
  avatarUrl: string | null;
};

export type Repo = {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  /** The space's own description of the project, from portfolio.json. */
  about: string | null;
  description: string | null;
  links: Link[];
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
  commits: Commit[];
  openPulls: Pull[];
  mergedPulls: Pull[];
};

export type Owner = { login: string; url: string; avatarUrl: string };

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

export type Snapshot = {
  takenAt: string;
  title: string;
  tagline: string;
  siblings: Link[];
  owners: Owner[];
  repos: Repo[];
  weekStarts: string[];
  totals: { commits7d: number; prsOpened7d: number; prsMerged7d: number; issuesOpened7d: number; activeRepos7d: number };
  feed: FeedItem[];
};
