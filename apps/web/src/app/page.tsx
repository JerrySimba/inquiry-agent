import Link from "next/link";
import { readSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await readSession();
  if (session) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-lagoon">
        Inquiry Agent
      </p>
      <h1 className="font-display text-5xl leading-tight text-ink md:text-6xl">
        Handle every traveler inquiry while you sleep.
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-ink/70">
        Multi-tenant SaaS for travel and tour operators. WhatsApp + email agents grounded in
        your catalog, policies, and FAQs — auto-reply overnight, escalate only when needed.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/login" className="btn-primary">
          Open dashboard
        </Link>
        <Link href="/login" className="btn-secondary">
          Pilot login
        </Link>
      </div>
      <div className="mt-14 grid gap-4 md:grid-cols-3">
        {[
          ["Pre-trip FAQs", "Meeting points, what to bring, cancellation — auto-answered."],
          ["Company brain", "Structured tours + uploaded docs, always org-scoped."],
          ["Morning digest", "See overnight autos and escalations when you wake up."],
        ].map(([title, body]) => (
          <div key={title} className="panel p-5">
            <h2 className="font-display text-xl">{title}</h2>
            <p className="mt-2 text-sm text-ink/70">{body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
