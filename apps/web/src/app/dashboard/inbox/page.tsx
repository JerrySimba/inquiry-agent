import { repo } from "@inquiry/db";
import { readSession } from "@/lib/auth";
import Link from "next/link";

export default async function InboxPage() {
  const session = await readSession();
  if (!session) return null;

  const rows = await repo.listConversations(session.orgId);
  const inquiryRows = await repo.listInquiries(session.orgId);
  const openEscalations = await repo.listEscalations(session.orgId);
  const runs = await repo.listAgentRuns(session.orgId);

  const statusByConversation = new Map<string, string>();
  for (const inquiry of inquiryRows) {
    if (!statusByConversation.has(inquiry.conversationId)) {
      statusByConversation.set(inquiry.conversationId, inquiry.status);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl">Inbox</h1>
        <p className="mt-2 text-ink/65">Auto vs escalated badges across WhatsApp and email.</p>
      </header>
      <div className="panel divide-y divide-black/5">
        {rows.length === 0 && <p className="p-5 text-sm text-ink/60">No conversations yet.</p>}
        {rows.map((c) => {
          const status = statusByConversation.get(c.id) ?? "open";
          return (
            <Link
              key={c.id}
              href={`/dashboard/inbox/${c.id}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-mist/40"
            >
              <div>
                <p className="font-medium">{c.customerName ?? c.customerHandle}</p>
                <p className="text-sm text-ink/60">
                  {c.channel} · {c.subject ?? "No subject"}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  status === "auto_resolved"
                    ? "bg-lagoon/15 text-lagoon"
                    : status === "escalated"
                      ? "bg-coral/15 text-coral"
                      : "bg-black/5 text-ink/60"
                }`}
              >
                {status.replaceAll("_", " ")}
              </span>
            </Link>
          );
        })}
      </div>

      <section className="panel p-5">
        <h2 className="font-display text-2xl">Recent escalations</h2>
        <div className="mt-4 space-y-3">
          {openEscalations.length === 0 && (
            <p className="text-sm text-ink/60">No escalations.</p>
          )}
          {openEscalations.slice(0, 10).map((e) => {
            const run = runs.find((r) => r.inquiryId === e.inquiryId);
            return (
              <div key={e.id} className="rounded-xl bg-mist/40 p-3 text-sm">
                <p className="font-medium">{e.reason}</p>
                <p className="mt-1 text-ink/65">{e.suggestedReply}</p>
                {run && (
                  <p className="mt-2 text-xs text-ink/50">
                    intent={run.intent} · confidence={Number(run.confidence).toFixed(2)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
