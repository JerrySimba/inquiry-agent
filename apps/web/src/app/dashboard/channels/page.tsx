import { Suspense } from "react";
import { repo } from "@inquiry/db";
import { readSession } from "@/lib/auth";
import { GmailConnectPanel, WhatsAppConnectForm } from "./connect-forms";
import { SimulateForm } from "./simulate-form";

export default async function ChannelsPage() {
  const session = await readSession();
  if (!session) return null;
  const channels = await repo.listChannels(session.orgId);
  const wa = channels.find((c) => c.type === "whatsapp");
  const email = channels.find((c) => c.type === "email");
  const waConfig = (wa?.config ?? {}) as Record<string, string>;
  const emailConfig = (email?.config ?? {}) as Record<string, string>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl">Channels</h1>
        <p className="mt-2 text-ink/65">
          Connect WhatsApp Business and Gmail so overnight agents can answer new-client and
          pre-trip inquiries for real.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {channels.map((c) => (
          <div key={String(c.id)} className="panel p-5">
            <h2 className="font-display text-2xl">{String(c.label)}</h2>
            <p className="mt-1 text-sm text-ink/60">
              {String(c.type)} · {String(c.externalId)}
            </p>
            <p className={`mt-3 text-sm ${c.connected ? "text-lagoon" : "text-coral"}`}>
              {c.connected ? "Connected" : "Not connected"}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <WhatsAppConnectForm
          initial={{
            phoneNumberId: waConfig.phoneNumberId || String(wa?.externalId ?? ""),
            businessAccountId: waConfig.businessAccountId,
          }}
        />
        <Suspense fallback={<div className="panel p-5">Loading Gmail…</div>}>
          <GmailConnectPanel
            connectedEmail={emailConfig.email || undefined}
            gmailConfigured={Boolean(
              process.env.GOOGLE_CLIENT_ID?.trim() &&
                process.env.GOOGLE_CLIENT_SECRET?.trim()
            )}
          />
        </Suspense>
      </div>

      <SimulateForm
        orgId={session.orgId}
        channels={channels.map((c) => ({
          id: String(c.id),
          type: String(c.type),
          label: String(c.label),
        }))}
      />
    </div>
  );
}
