# quirq space / github

A public portfolio of this space's GitHub work: a card per project with what it
is, where it runs (live links), its latest commits and merged pull requests,
plus commits per week and a recent-activity feed. Its sibling is the Vercel
portfolio, https://vercel-activity-delta.vercel.app.

## How it works

- `portfolio.json` lists the projects shown, with the space's own description
  and live links for each. Only these repos are fetched, and each must be public.
- `npm run snapshot` fetches them from GitHub and writes `src/data/snapshot.json`.
  It runs on a developer machine, using `GITHUB_TOKEN` if set or else the local
  `gh` login. The token is never written to the snapshot.
- The site is fully static (Next.js on Vercel). It reads only the committed
  snapshot: no token on Vercel, no GitHub calls at runtime.

## Refresh

```bash
npm run snapshot                     # update src/data/snapshot.json
git commit -am "Refresh snapshot"
vercel deploy --prod --scope quirq-research
```

## Develop

```bash
npm install
npm run dev
```
