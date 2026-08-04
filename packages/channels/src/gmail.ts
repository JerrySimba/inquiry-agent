export type GmailTokens = {
  accessToken: string;
  refreshToken: string;
  expiry: number;
  email: string;
};

export function getGmailAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
    state: input.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGmailCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<GmailTokens> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Gmail token exchange failed: ${await res.text()}`);
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const profile = (await profileRes.json()) as { email?: string };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiry: Date.now() + data.expires_in * 1000,
    email: profile.email ?? "",
  };
}

export async function refreshGmailAccessToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ accessToken: string; expiry: number }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: input.refreshToken,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Gmail refresh failed: ${await res.text()}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiry: Date.now() + data.expires_in * 1000,
  };
}

async function gmailFetch(accessToken: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Gmail API ${path}: ${await res.text()}`);
  return res.json();
}

export async function listUnreadInquiryEmails(accessToken: string, max = 10) {
  const list = (await gmailFetch(
    accessToken,
    `users/me/messages?q=${encodeURIComponent("is:unread -category:promotions -category:social")}&maxResults=${max}`
  )) as { messages?: Array<{ id: string; threadId: string }> };

  const out: Array<{
    id: string;
    threadId: string;
    from: string;
    subject: string;
    text: string;
  }> = [];

  for (const msg of list.messages ?? []) {
    const full = (await gmailFetch(
      accessToken,
      `users/me/messages/${msg.id}?format=full`
    )) as {
      id: string;
      threadId: string;
      payload?: {
        headers?: Array<{ name: string; value: string }>;
        body?: { data?: string };
        parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }>;
      };
    };

    const headers = full.payload?.headers ?? [];
    const from = headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
    const subject = headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? "";
    const text = extractBody(full.payload);
    out.push({ id: full.id, threadId: full.threadId, from, subject, text });
  }
  return out;
}

function decodeB64Url(data: string) {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function extractBody(payload: {
  body?: { data?: string };
  parts?: Array<{ mimeType?: string; body?: { data?: string }; parts?: unknown[] }>;
} | undefined): string {
  if (!payload) return "";
  if (payload.body?.data) return decodeB64Url(payload.body.data);
  for (const part of payload.parts ?? []) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return decodeB64Url(part.body.data);
    }
  }
  for (const part of payload.parts ?? []) {
    if (part.mimeType === "text/html" && part.body?.data) {
      return decodeB64Url(part.body.data).replace(/<[^>]+>/g, " ");
    }
  }
  return "";
}

export async function sendGmailReply(input: {
  accessToken: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  threadId?: string;
}) {
  const subject = input.subject.toLowerCase().startsWith("re:")
    ? input.subject
    : `Re: ${input.subject}`;
  const raw = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    input.text,
  ].join("\r\n");

  const encoded = Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return gmailFetch(input.accessToken, "users/me/messages/send", {
    method: "POST",
    body: JSON.stringify({
      raw: encoded,
      threadId: input.threadId,
    }),
  });
}

export async function markGmailRead(accessToken: string, messageId: string) {
  return gmailFetch(accessToken, `users/me/messages/${messageId}/modify`, {
    method: "POST",
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  });
}
