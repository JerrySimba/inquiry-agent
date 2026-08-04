import { repo } from "@inquiry/db";
import { readSession } from "@/lib/auth";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const session = await readSession();
  if (!session) return null;

  const org = await repo.getOrg(session.orgId);
  const autonomy = await repo.listAutonomy(session.orgId);
  if (!org) return null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl">Settings</h1>
        <p className="mt-2 text-ink/65">Brand voice, escalation contacts, autonomy toggles.</p>
      </header>
      <SettingsForm
        org={{
          brandVoice: org.brandVoice ?? "",
          timezone: org.timezone,
          escalateEmail: org.escalateEmail ?? "",
          escalatePhone: org.escalatePhone ?? "",
        }}
        autonomy={autonomy.map((a) => ({
          intent: String(a.intent),
          mode: a.mode as "auto" | "escalate",
        }))}
      />
    </div>
  );
}
