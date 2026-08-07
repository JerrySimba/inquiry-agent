"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SimulateForm({
  orgId,
  channels,
}: {
  orgId: string;
  channels: Array<{ id: string; type: string; label: string }>;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState(channels[0]?.type ?? "whatsapp");
  const [handle, setHandle] = useState("+628123456789");
  const [body, setBody] = useState(
    "Hi! Looking for a Bali trip for 4 adults next Saturday — do you have an Uluwatu sunset itinerary and price?"
  );
  const [result, setResult] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult("Processing…");
    const res = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, channel, customerHandle: handle, body }),
    });
    const data = await res.json();
    if (!res.ok) {
      setResult(data.error ?? "Failed");
      return;
    }
    const outbound = data.outbound
      ? `\nWhatsApp send: ${data.outbound.ok ? "OK" : `FAILED — ${data.outbound.error}`}`
      : "";
    setResult(
      `${data.result.action} · intent=${data.result.intent} · confidence=${Number(
        data.result.confidence
      ).toFixed(2)}${outbound}${data.result.reply ? `\n\n${data.result.reply}` : ""}`
    );
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel space-y-3 p-5">
      <h2 className="font-display text-2xl">Simulate inbound inquiry</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="label">Channel</label>
          <select
            className="input"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
          </select>
        </div>
        <div>
          <label className="label">Customer handle</label>
          <input className="input" value={handle} onChange={(e) => setHandle(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label">Message</label>
        <textarea
          className="input min-h-28"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <button className="btn-primary" type="submit">
        Run agent
      </button>
      {result && (
        <pre className="whitespace-pre-wrap rounded-xl bg-mist/50 p-4 text-sm">{result}</pre>
      )}
    </form>
  );
}
