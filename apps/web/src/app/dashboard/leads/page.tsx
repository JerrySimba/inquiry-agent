import { repo } from "@inquiry/db";
import { readSession } from "@/lib/auth";

export default async function LeadsPage() {
  const session = await readSession();
  if (!session) return null;
  const leads = await repo.listLeads(session.orgId);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl">New-client leads</h1>
        <p className="mt-2 text-ink/65">
          Captured from WhatsApp/email inquiries: pax, dates, trip interests.
        </p>
      </header>
      <div className="space-y-3">
        {leads.length === 0 && (
          <p className="panel p-5 text-sm text-ink/60">
            No leads yet. Simulate a new-client message like “Looking for a Bali trip for 4
            adults next Saturday”.
          </p>
        )}
        {leads.map((lead) => (
          <article key={String(lead.id)} className="panel p-5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-xl">
                {String(lead.customerHandle || "Unknown guest")}
              </h2>
              <span className="text-xs uppercase tracking-wide text-ink/50">
                {String(lead.channel || "channel")}
              </span>
            </div>
            <dl className="mt-3 grid gap-2 md:grid-cols-3">
              <div>
                <dt className="label">Pax</dt>
                <dd>
                  {lead.paxTotal != null
                    ? String(lead.paxTotal)
                    : lead.paxAdults != null
                      ? `${lead.paxAdults} adults`
                      : "—"}
                </dd>
              </div>
              <div>
                <dt className="label">Dates</dt>
                <dd>{String(lead.travelDates || "—")}</dd>
              </div>
              <div>
                <dt className="label">Interests</dt>
                <dd>
                  {Array.isArray(lead.interests) && lead.interests.length
                    ? lead.interests.join(", ")
                    : "—"}
                </dd>
              </div>
            </dl>
            {lead.rawMessage ? (
              <p className="mt-3 text-ink/70">{String(lead.rawMessage)}</p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
