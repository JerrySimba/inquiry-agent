import { repo } from "@inquiry/db";
import { readSession } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await readSession();
  if (!session) return null;
  const orgId = session.orgId;

  const [inquiryStats, openEscalations, channels, tours, autonomy, recent] =
    await Promise.all([
      repo.inquiryStats(orgId),
      repo.listEscalations(orgId, true),
      repo.listChannels(orgId),
      repo.listTours(orgId),
      repo.listAutonomy(orgId),
      repo.listConversations(orgId),
    ]);

  const auto = inquiryStats.find((s) => s.status === "auto_resolved")?.count ?? 0;
  const escalated = inquiryStats.find((s) => s.status === "escalated")?.count ?? 0;
  const total = inquiryStats.reduce((s, r) => s + Number(r.count), 0);
  const rate = total ? Math.round((auto / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl">Overnight ops</h1>
        <p className="mt-2 text-ink/65">
          Pre-trip FAQs auto-handled. Everything else escalates with context.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["Auto-resolved", String(auto)],
          ["Escalated", String(escalated)],
          ["Auto rate", `${rate}%`],
          ["Open escalations", String(openEscalations.length)],
        ].map(([label, value]) => (
          <div key={label} className="panel p-5">
            <p className="text-xs uppercase tracking-wide text-ink/50">{label}</p>
            <p className="mt-2 font-display text-3xl">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="panel p-5">
          <h2 className="font-display text-2xl">Channels</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {channels.map((c) => (
              <li key={String(c.id)} className="flex justify-between">
                <span>
                  {String(c.label)} · {String(c.type)}
                </span>
                <span className={c.connected ? "text-lagoon" : "text-coral"}>
                  {c.connected ? "connected" : "not connected"}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel p-5">
          <h2 className="font-display text-2xl">Autonomy</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {autonomy.map((a) => (
              <li key={String(a.id)} className="flex justify-between">
                <span>{String(a.intent).replaceAll("_", " ")}</span>
                <span className={a.mode === "auto" ? "text-lagoon" : "text-ink/50"}>
                  {String(a.mode)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="font-display text-2xl">Recent conversations</h2>
        <div className="mt-4 space-y-3">
          {recent.length === 0 && (
            <p className="text-sm text-ink/60">No conversations yet. Simulate one from Channels.</p>
          )}
          {recent.slice(0, 5).map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-xl bg-mist/40 px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">{c.customerHandle}</p>
                <p className="text-ink/60">
                  {c.channel}
                  {c.subject ? ` · ${c.subject}` : ""}
                </p>
              </div>
              <span className="text-ink/50">
                {new Date(c.lastMessageAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-ink/55">{tours.length} tours in catalog</p>
      </section>
    </div>
  );
}
