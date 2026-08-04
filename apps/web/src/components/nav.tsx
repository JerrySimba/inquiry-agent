import Link from "next/link";
import type { Session } from "@/lib/auth";

const links = [
  ["/dashboard", "Overview"],
  ["/dashboard/inbox", "Inbox"],
  ["/dashboard/leads", "Leads"],
  ["/dashboard/tours", "Tours"],
  ["/dashboard/knowledge", "Knowledge"],
  ["/dashboard/channels", "Channels"],
  ["/dashboard/settings", "Settings"],
  ["/dashboard/digest", "Digest"],
] as const;

export function DashboardNav({ session }: { session: Session }) {
  return (
    <aside className="panel flex h-full flex-col p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-lagoon">
          Inquiry Agent
        </p>
        <h1 className="mt-2 font-display text-2xl leading-tight">{session.orgName}</h1>
        <p className="mt-1 text-sm text-ink/60">{session.name}</p>
      </div>
      <nav className="mt-8 flex flex-1 flex-col gap-1">
        {links.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="rounded-xl px-3 py-2 text-sm hover:bg-mist/70"
          >
            {label}
          </Link>
        ))}
      </nav>
      <form action="/api/auth/logout" method="post">
        <button className="btn-secondary w-full" type="submit">
          Sign out
        </button>
      </form>
    </aside>
  );
}
