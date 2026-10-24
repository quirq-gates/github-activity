// The site reads a snapshot baked in at build time; it never calls GitHub and holds no token.
// Refresh with `npm run snapshot`, then redeploy.
import data from "@/data/snapshot.json";
import type { Snapshot } from "./types";

export * from "./types";

const snapshot = data as Snapshot;

export function getSnapshot(): Snapshot {
  return snapshot;
}

export function getRepo(owner: string, name: string) {
  const key = `${owner}/${name}`.toLowerCase();
  return snapshot.repos.find((r) => r.fullName.toLowerCase() === key) ?? null;
}
