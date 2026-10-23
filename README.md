# GitHub activity

A small public dashboard of activity across our **public** GitHub repositories:
commits per week, a live event feed, and a card per repo (language, CI status,
open PRs/issues, latest release, 12-week commit sparkline).

## How it works

- Next.js (App Router, Cache Components) on Vercel.
- All GitHub calls run on the server (`src/lib/github.ts`, marked `server-only`).
  The token is read from `GITHUB_TOKEN` and never reaches the browser.
- Only `privacy: PUBLIC` repos are queried, and results are filtered again by
  `isPrivate` and owner. Feed events are kept only if their repo is in that public set,
  and repo pages 404 for anything outside it.
- Data is cached and refreshed in the background every 5 minutes.

## Configuration

| Variable | Purpose |
| --- | --- |
| `GITHUB_TOKEN` | Fine-grained PAT, **Public repositories (read-only)** |
| `GITHUB_OWNERS` | Comma-separated users/orgs to include (default `quirq-ai,quirq-gates`) |

## Develop

```bash
cp .env.example .env.local   # add a token
npm install
npm run dev
```
