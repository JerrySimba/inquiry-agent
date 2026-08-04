"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Autonomy = { intent: string; mode: "auto" | "escalate" };

export function SettingsForm({
  org,
  autonomy,
}: {
  org: {
    brandVoice: string;
    timezone: string;
    escalateEmail: string;
    escalatePhone: string;
  };
  autonomy: Autonomy[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(org);
  const [modes, setModes] = useState(autonomy);
  const [status, setStatus] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Saving…");
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org: form, autonomy: modes }),
    });
    setStatus(res.ok ? "Saved" : "Failed");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel space-y-4 p-5">
      <div>
        <label className="label">Brand voice</label>
        <textarea
          className="input min-h-24"
          value={form.brandVoice}
          onChange={(e) => setForm((f) => ({ ...f, brandVoice: e.target.value }))}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="label">Timezone</label>
          <input
            className="input"
            value={form.timezone}
            onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">Escalate email</label>
          <input
            className="input"
            value={form.escalateEmail}
            onChange={(e) => setForm((f) => ({ ...f, escalateEmail: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">Escalate phone</label>
          <input
            className="input"
            value={form.escalatePhone}
            onChange={(e) => setForm((f) => ({ ...f, escalatePhone: e.target.value }))}
          />
        </div>
      </div>

      <div>
        <h2 className="font-display text-xl">Autonomy by intent</h2>
        <div className="mt-3 space-y-2">
          {modes.map((m, idx) => (
            <div key={m.intent} className="flex items-center justify-between rounded-xl bg-mist/40 px-3 py-2 text-sm">
              <span>{m.intent.replaceAll("_", " ")}</span>
              <select
                className="input max-w-40"
                value={m.mode}
                onChange={(e) => {
                  const mode = e.target.value as "auto" | "escalate";
                  setModes((prev) =>
                    prev.map((row, i) => (i === idx ? { ...row, mode } : row))
                  );
                }}
              >
                <option value="auto">auto</option>
                <option value="escalate">escalate</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary" type="submit">
          Save settings
        </button>
        {status && <p className="text-sm text-ink/60">{status}</p>}
      </div>
    </form>
  );
}
