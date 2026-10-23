"use client";

import { useSyncExternalStore } from "react";

// Re-render once a minute; the server snapshot is null so prerendered HTML stays deterministic.
function subscribe(onChange: () => void) {
  const id = setInterval(onChange, 60_000);
  return () => clearInterval(id);
}
const minuteNow = () => Math.floor(Date.now() / 60_000) * 60_000;

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "narrow" });

export function relative(iso: string, now: number) {
  const secs = (new Date(iso).getTime() - now) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(secs) >= size) return rtf.format(Math.round(secs / size), unit);
  }
  return "just now";
}

function absolute(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

export function TimeAgo({ iso, className }: { iso: string | null; className?: string }) {
  const now = useSyncExternalStore(subscribe, minuteNow, () => null);
  if (!iso) return <span className={className}>never</span>;
  return (
    <time dateTime={iso} title={absolute(iso)} className={className}>
      {now === null ? absolute(iso) : relative(iso, now)}
    </time>
  );
}
