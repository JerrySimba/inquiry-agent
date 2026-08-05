export type WhatsAppWebhookMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
};

export function verifyWhatsAppChallenge(input: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
  verifyToken: string;
}): string | null {
  if (input.mode === "subscribe" && input.token === input.verifyToken && input.challenge) {
    return input.challenge;
  }
  return null;
}

type WhatsAppChangeValue = {
  messages?: WhatsAppWebhookMessage[];
  metadata?: { phone_number_id?: string };
};

function collectTextMessages(value?: WhatsAppChangeValue): WhatsAppWebhookMessage[] {
  const out: WhatsAppWebhookMessage[] = [];
  for (const msg of value?.messages ?? []) {
    if (msg.type === "text" && msg.text?.body) out.push(msg);
  }
  return out;
}

/** Normal Meta delivery uses entry[].changes[]; dashboard "Send to My Server" may send { field, value }. */
export function extractWhatsAppTexts(payload: unknown): WhatsAppWebhookMessage[] {
  const body = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: WhatsAppChangeValue;
      }>;
    }>;
    value?: WhatsAppChangeValue;
    field?: string;
  };

  const out: WhatsAppWebhookMessage[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      out.push(...collectTextMessages(change.value));
    }
  }

  // Meta webhook field tester payload (unwrapped change object)
  if (!out.length && body.value?.messages) {
    out.push(...collectTextMessages(body.value));
  }

  return out;
}

export function extractWhatsAppPhoneNumberId(payload: unknown): string | null {
  const body = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: WhatsAppChangeValue;
      }>;
    }>;
    value?: WhatsAppChangeValue;
  };

  return (
    body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ??
    body.value?.metadata?.phone_number_id ??
    null
  );
}

export async function sendWhatsAppText(input: {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  body: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!input.accessToken || !input.phoneNumberId) {
    return { ok: true, id: `demo-wa-${Date.now()}` };
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${input.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.to,
        type: "text",
        text: { body: input.body },
      }),
    }
  );

  const data = (await res.json()) as {
    messages?: Array<{ id: string }>;
    error?: { message: string };
  };

  if (!res.ok) {
    return { ok: false, error: data.error?.message ?? "WhatsApp send failed" };
  }
  return { ok: true, id: data.messages?.[0]?.id };
}
