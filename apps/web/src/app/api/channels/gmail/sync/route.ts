import { NextResponse } from "next/server";
import {
  extractEmailAddress,
  ingestInbound,
  listUnreadInquiryEmails,
  markGmailRead,
  refreshGmailAccessToken,
  sendGmailReply,
} from "@inquiry/channels";
import { repo } from "@inquiry/db";
import { readSession } from "@/lib/auth";

async function getFreshGmailAccess(orgId: string) {
  const channel = await repo.getChannel(orgId, "email");
  if (!channel || (channel.config as Record<string, string>)?.provider !== "gmail") {
    throw new Error("Gmail not connected");
  }
  const config = channel.config as Record<string, string>;
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

export async function POST() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { channel, accessToken, config } = await getFreshGmailAccess(session.orgId);
    const messages = await listUnreadInquiryEmails(accessToken, 10);
    const results = [];

    for (const msg of messages) {
      if (!msg.text?.trim()) continue;
      const from = extractEmailAddress(msg.from);
      const ingested = await ingestInbound({
        orgId: session.orgId,
        channel: "email",
        channelAccountId: channel.id,
        externalThreadId: `gmail:${msg.threadId}`,
        customerHandle: from,
        customerName: msg.from,
        subject: msg.subject,
        body: msg.text,
        externalMessageId: msg.id,
      });

      if (ingested.result.action === "auto_reply" && ingested.result.reply) {
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

    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Gmail sync failed" },
      { status: 400 }
    );
  }
}
