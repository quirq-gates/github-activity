import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-sm text-ink-2">This dashboard only shows public repositories.</p>
      <Link href="/" className="text-sm text-accent hover:underline">
        Back to the dashboard
      </Link>
    </main>
  );
}
