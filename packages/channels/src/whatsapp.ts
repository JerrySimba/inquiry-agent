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

/** WhatsApp Cloud API expects digits-only international numbers (no +). */
export function normalizeWhatsAppTo(to: string): string {
  return to.replace(/\D/g, "");
}

export function toWhatsAppPlainText(body: string): string {
  return body
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

export async function sendWhatsAppText(input: {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  body: string;
  allowDemo?: boolean;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!input.accessToken || !input.phoneNumberId) {
    if (input.allowDemo) {
      return { ok: true, id: `demo-wa-${Date.now()}` };
    }
    return {
      ok: false,
      error: "WhatsApp access token or phone number ID missing",
    };
  }

  const to = normalizeWhatsAppTo(input.to);
  if (!to) {
    return { ok: false, error: "WhatsApp recipient number missing" };
  }

  const res = await fetch(
    `https://graph.facebook.com/v22.0/${input.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body: toWhatsAppPlainText(input.body), preview_url: false },
      }),
    }
  );

  const data = (await res.json()) as {
    messages?: Array<{ id: string }>;
    error?: {
      message?: string;
      error_user_msg?: string;
      code?: number;
      error_data?: { details?: string };
    };
  };

  if (!res.ok) {
    const err = data.error;
    const detail = [
      err?.error_user_msg,
      err?.message,
      err?.error_data?.details,
      err?.code != null ? `code ${err.code}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return { ok: false, error: detail || "WhatsApp send failed" };
  }
  return { ok: true, id: data.messages?.[0]?.id };
}
