import {
  extractEmailAddress,
  ingestInbound,
  listUnreadInquiryEmails,
  markGmailRead,
  refreshGmailAccessToken,
  sendGmailReply,
} from "@inquiry/channels";
import { repo } from "@inquiry/db";

async function getFreshGmailAccess(orgId: string) {
  const channel = await repo.getChannel(orgId, "email");
  if (!channel || (channel.config as Record<string, string>)?.provider !== "gmail") {
    throw new Error("Gmail not connected");
  }
  const config = channel.config as Record<string, string>;
  if (!config.refreshToken) {
    throw new Error("Gmail refresh token missing — reconnect Gmail");
  }

  let accessToken = config.accessToken;
  const expiry = Number(config.expiry || 0);
  if (Date.now() > expiry - 60_000) {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      throw new Error("Google OAuth env missing");
    }
    const refreshed = await refreshGmailAccessToken({
      refreshToken: config.refreshToken,
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    });
    accessToken = refreshed.accessToken;
    await repo.updateChannel(channel.id, {
      config: {
        ...config,
        accessToken,
        expiry: String(refreshed.expiry),
      },
    });
  }
  return { channel, accessToken, config };
}

export async function syncGmailForOrg(orgId: string, maxMessages = 20) {
  const { channel, accessToken, config } = await getFreshGmailAccess(orgId);
  const messages = await listUnreadInquiryEmails(accessToken, maxMessages);
  const results = [];

  for (const msg of messages) {
    if (!msg.text?.trim()) continue;
    const from = extractEmailAddress(msg.from);
    const ingested = await ingestInbound({
      orgId,
      channel: "email",
      channelAccountId: channel.id,
      externalThreadId: `gmail:${msg.threadId}`,
      customerHandle: from,
      customerName: msg.from,
      subject: msg.subject,
      body: msg.text,
      externalMessageId: msg.id,
    });

    // Auto-reply may already be sent inside ingestInbound via dispatchOutbound.
    // Send again only if ingest did not (demo/outage) — skip duplicate when provider gmail
    // already handled in dispatchOutbound.
    if (
      ingested.result.action === "auto_reply" &&
      ingested.result.reply &&
      !(channel.config as Record<string, string>)?.provider
    ) {
      await sendGmailReply({
        accessToken,
        from: config.email,
        to: from,
        subject: msg.subject,
        text: ingested.result.reply,
        threadId: msg.threadId,
      });
    }

    await markGmailRead(accessToken, msg.id);
    results.push(ingested.result);
  }

  return { orgId, processed: results.length, results };
}

export async function syncAllConnectedGmailInboxes() {
  const channels = await repo.listConnectedGmailChannels();
  const summaries = [];

  for (const channel of channels) {
    try {
      const summary = await syncGmailForOrg(String(channel.orgId));
      summaries.push({ ...summary, ok: true as const, email: channel.externalId });
    } catch (err) {
      summaries.push({
        ok: false as const,
        orgId: String(channel.orgId),
        email: channel.externalId,
        error: err instanceof Error ? err.message : "sync failed",
      });
    }
  }

  return summaries;
}
