export type TwilioInboundMessage = {
  from: string;
  to: string;
  body: string;
  messageSid: string;
};

/** Strip whatsapp: prefix and non-digits for thread matching. */
export function normalizeTwilioPhone(addr: string): string {
  return addr.replace(/^whatsapp:/i, "").replace(/\D/g, "");
}

/** Format for Twilio Messages API (E.164 with whatsapp: prefix). */
export function toTwilioWhatsAppAddress(addr: string): string {
  const digits = normalizeTwilioPhone(addr);
  if (!digits) return "";
  return `whatsapp:+${digits}`;
}

export function parseTwilioInbound(form: FormData): TwilioInboundMessage | null {
  const body = String(form.get("Body") ?? "").trim();
  const from = String(form.get("From") ?? "");
  const to = String(form.get("To") ?? "");
  const messageSid = String(form.get("MessageSid") ?? "");
  if (!from || !to || !messageSid) return null;
  if (!body && Number(form.get("NumMedia") ?? 0) > 0) {
    return { from, to, body: "[media message]", messageSid };
  }
  if (!body) return null;
  return { from, to, body, messageSid };
}

export async function sendTwilioWhatsAppText(input: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!input.accountSid || !input.authToken) {
    return { ok: false, error: "Twilio Account SID or Auth Token missing" };
  }

  const from = toTwilioWhatsAppAddress(input.from);
  const to = toTwilioWhatsAppAddress(input.to);
  if (!from || !to) {
    return { ok: false, error: "Twilio From/To WhatsApp number missing or invalid" };
  }

  const params = new URLSearchParams({
    From: from,
    To: to,
    Body: input.body.slice(0, 4096),
  });

  const auth = Buffer.from(`${input.accountSid}:${input.authToken}`).toString("base64");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${input.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );

  const data = (await res.json()) as {
    sid?: string;
    message?: string;
    more_info?: string;
    code?: number;
  };

  if (!res.ok) {
    const detail = [data.message, data.more_info, data.code != null ? `code ${data.code}` : null]
      .filter(Boolean)
      .join(" · ");
    return { ok: false, error: detail || "Twilio send failed" };
  }

  return { ok: true, id: data.sid };
}

export async function validateTwilioCredentials(input: {
  accountSid: string;
  authToken: string;
}): Promise<{ ok: boolean; friendlyName?: string; error?: string }> {
  const auth = Buffer.from(`${input.accountSid}:${input.authToken}`).toString("base64");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${input.accountSid}.json`,
    { headers: { Authorization: `Basic ${auth}` } }
  );
  const data = (await res.json()) as {
    friendly_name?: string;
    message?: string;
  };
  if (!res.ok) {
    return { ok: false, error: data.message ?? "Twilio credentials rejected" };
  }
  return { ok: true, friendlyName: data.friendly_name };
}
