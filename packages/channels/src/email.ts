export type InboundEmailPayload = {
  from: string;
  to: string;
  subject?: string;
  text?: string;
  html?: string;
  messageId?: string;
};

export function parseInboundEmail(payload: unknown): InboundEmailPayload {
  const p = payload as Record<string, unknown>;
  return {
    from: String(p.from ?? p.sender ?? ""),
    to: String(p.to ?? p.recipient ?? ""),
    subject: p.subject ? String(p.subject) : undefined,
    text: p.text ? String(p.text) : p["body-plain"] ? String(p["body-plain"]) : undefined,
    html: p.html ? String(p.html) : undefined,
    messageId: p.messageId
      ? String(p.messageId)
      : p["Message-Id"]
        ? String(p["Message-Id"])
        : undefined,
  };
}

export function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match?.[1] ?? raw).trim().toLowerCase();
}

export async function sendEmail(input: {
  apiKey?: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!input.apiKey) {
    return { ok: true, id: `demo-email-${Date.now()}` };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
    }),
  });

  const data = (await res.json()) as { id?: string; message?: string };
  if (!res.ok) return { ok: false, error: data.message ?? "Email send failed" };
  return { ok: true, id: data.id };
}
