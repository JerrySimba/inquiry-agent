import { repo } from "@inquiry/db";
import { readSession } from "@/lib/auth";
import { DigestButton } from "./digest-button";

export default async function DigestPage() {
  const session = await readSession();
  if (!session) return null;
  const logs = await repo.listDigests(session.orgId);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">Morning digest</h1>
          <p className="mt-2 text-ink/65">
            Overnight autos, escalations needing attention, and intent mix.
          </p>
        </div>
        <DigestButton />
      </header>

      <div className="space-y-4">
        {logs.length === 0 && (
          <p className="panel p-5 text-sm text-ink/60">No digests yet. Generate one.</p>
        )}
        {logs.slice(0, 10).map((log) => {
          const payload = (log.payload ?? {}) as {
            intentCounts?: Record<string, number>;
            openEscalations?: Array<{ reason: string; suggestedReply?: string }>;
            highlights?: Array<{ summary?: string; intent: string }>;
          };
          return (
            <article key={String(log.id)} className="panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-2xl">
                  {new Date(String(log.periodStart)).toLocaleString()} →{" "}
                  {new Date(String(log.periodEnd)).toLocaleString()}
                </h2>
                <p className="text-sm text-ink/60">
                  auto {String(log.autoResolvedCount)} · escalated {String(log.escalatedCount)}
                </p>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="label">Intent mix</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {Object.entries(payload.intentCounts ?? {}).map(([intent, count]) => (
                      <li key={intent} className="flex justify-between">
                        <span>{intent.replaceAll("_", " ")}</span>
                        <span>{count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="label">Open escalations</h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    {(payload.openEscalations ?? []).slice(0, 5).map((e, i) => (
                      <li key={i} className="rounded-lg bg-mist/50 p-2">
                        {e.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="mt-4">
                <h3 className="label">Auto highlights</h3>
                <ul className="mt-2 space-y-1 text-sm text-ink/70">
                  {(payload.highlights ?? []).map((h, i) => (
                    <li key={i}>
                      [{h.intent}] {h.summary}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
