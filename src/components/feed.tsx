import Link from "next/link";
import type { FeedItem } from "@/lib/github";
import { TimeAgo } from "./time-ago";

const ICONS: Record<FeedItem["kind"], string> = {
  push: "↑",
  pr: "⇄",
  review: "◎",
  issue: "◉",
  comment: "…",
  release: "◆",
  branch: "⑂",
  star: "★",
  fork: "⑂",
  other: "·",
};

export function Feed({ items, showRepo = true }: { items: FeedItem[]; showRepo?: boolean }) {
  if (items.length === 0) return <p className="text-sm text-ink-3">No recent public activity.</p>;
  return (
    <ol className="divide-y divide-border">
      {items.map((e) => (
        <li key={e.id} className="flex gap-3 py-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${e.actorAvatar}${e.actorAvatar.includes("?") ? "&" : "?"}s=48`} alt="" width={24} height={24} className="mt-0.5 size-6 rounded-full" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-ink-2">
              <span aria-hidden className="mr-1 inline-block w-3 text-center text-ink-3">
                {ICONS[e.kind]}
              </span>
              <span className="font-medium text-ink">{e.actor}</span> {e.verb}
              {e.ref?.url && (
                <>
                  {" "}
                  <a href={e.ref.url} className="font-mono text-xs text-accent hover:underline" target="_blank" rel="noreferrer">
                    {e.ref.label}
                  </a>
                </>
              )}
              {showRepo && (
                <>
                  {" "}
                  in{" "}
                  <Link href={`/${e.repo}`} className="font-medium text-ink hover:underline">
                    {e.repo.split("/")[1]}
                  </Link>
                </>
              )}
            </p>
            {e.title && <p className="truncate text-ink-3">{e.title}</p>}
          </div>
          <TimeAgo iso={e.createdAt} className="shrink-0 pt-0.5 text-xs text-ink-3 tabular-nums" />
        </li>
      ))}
    </ol>
  );
}
