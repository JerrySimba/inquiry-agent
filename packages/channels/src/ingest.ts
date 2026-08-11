import { processInquiry } from "@inquiry/agent";
import { repo } from "@inquiry/db";
import { sendEmail } from "./email";
import { refreshGmailAccessToken, sendGmailReply } from "./gmail";
import { sendWhatsAppText } from "./whatsapp";
import type { NormalizedInbound } from "./types";

export async function ingestInbound(inbound: NormalizedInbound) {
  if (inbound.externalMessageId) {
    const existing = await repo.findMessageByExternalId(inbound.externalMessageId);
    if (existing) {
      const conversation = await repo.getConversation(existing.conversationId);
      return {
        conversation,
        inboundMessage: existing,
        result: null,
        outbound: undefined,
        duplicate: true,
      };
    }
  }

  let conversation = await repo.findConversation(
    inbound.orgId,
    inbound.channel,
    inbound.externalThreadId
  );

  if (!conversation) {
    conversation = await repo.createConversation({
      orgId: inbound.orgId,
      channel: inbound.channel,
      channelAccountId: inbound.channelAccountId,
      externalThreadId: inbound.externalThreadId,
      customerName: inbound.customerName,
      customerHandle: inbound.customerHandle,
      subject: inbound.subject,
      status: "open",
    });
  } else {
    await repo.touchConversation(conversation.id, {
      customerName: inbound.customerName ?? conversation.customerName,
      subject: inbound.subject ?? conversation.subject,
      lastMessageAt: new Date(),
    });
  }

  const inboundMessage = await repo.createMessage({
    orgId: inbound.orgId,
    conversationId: conversation.id,
    direction: "inbound",
    sender: "customer",
    body: inbound.body,
    externalId: inbound.externalMessageId,
    metadata: { channel: inbound.channel },
  });

  const result = await processInquiry({
    orgId: inbound.orgId,
    conversationId: conversation.id,
    inboundMessageId: inboundMessage.id,
    messageBody: inbound.body,
    fast: inbound.channel === "whatsapp",
  });

  let outbound:
    | { ok: boolean; id?: string; error?: string }
    | undefined;

  if (result.reply) {
    outbound = await dispatchOutbound({
      orgId: inbound.orgId,
      channel: inbound.channel,
      to: inbound.customerHandle,
      body: result.reply,
      subject: inbound.subject ? `Re: ${inbound.subject}` : "Re: your trip question",
      channelAccountId: inbound.channelAccountId ?? conversation.channelAccountId ?? undefined,
      threadId: inbound.externalThreadId.startsWith("gmail:")
        ? inbound.externalThreadId.replace(/^gmail:/, "")
        : undefined,
    });

    await repo.createMessage({
      orgId: inbound.orgId,
      conversationId: conversation.id,
      direction: "outbound",
      sender: "agent",
      body: result.reply,
      externalId: outbound?.id,
      metadata: {
        agentRunId: result.agentRunId,
        intent: result.intent,
        lead: result.lead,
        action: result.action,
        sendOk: outbound?.ok ?? false,
        sendError: outbound?.error ?? null,
        channel: inbound.channel,
      },
    });

    // Persist last send error on the WhatsApp channel for the Channels UI.
    if (inbound.channel === "whatsapp" && inbound.channelAccountId) {
      const account = await repo.getChannelById(inbound.channelAccountId);
      if (account) {
        const config = (account.config ?? {}) as Record<string, string>;
        await repo.updateChannel(account.id, {
          config: {
            ...config,
            lastSendOk: outbound?.ok ? "true" : "false",
            lastSendError: outbound?.error ?? "",
            lastSendAt: new Date().toISOString(),
          },
        });
      }
    }
  }

  return { conversation, inboundMessage, result, outbound };
}

export async function dispatchOutbound(input: {
  orgId: string;
  channel: "whatsapp" | "email";
  to: string;
  body: string;
  subject?: string;
  channelAccountId?: string;
  threadId?: string;
}) {
  let account = input.channelAccountId
    ? await repo.getChannelById(input.channelAccountId)
    : await repo.getChannel(input.orgId, input.channel);

  if (input.channel === "whatsapp") {
    const config = (account?.config ?? {}) as Record<string, string>;
    // Vercel env overrides DB so pilots can refresh tokens without re-saving in dashboard.
    const accessToken = (
      process.env.WHATSAPP_ACCESS_TOKEN ||
      config.accessToken ||
      ""
    ).trim();
    const phoneNumberId = (
      process.env.WHATSAPP_PHONE_NUMBER_ID ||
      config.phoneNumberId ||
      account?.externalId ||
      ""
    ).trim();

    return sendWhatsAppText({
      accessToken,
      phoneNumberId,
      to: input.to,
      body: input.body,
      allowDemo: config.mode === "demo" && !accessToken,
    });
  }

  const config = (account?.config ?? {}) as Record<string, string>;
  if (config.provider === "gmail" && config.refreshToken) {
    let accessToken = config.accessToken;
    const expiry = Number(config.expiry || 0);
    if (
      Date.now() > expiry - 60_000 &&
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET
    ) {
      const refreshed = await refreshGmailAccessToken({
        refreshToken: config.refreshToken,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      });
      accessToken = refreshed.accessToken;
      if (account) {
        await repo.updateChannel(account.id, {
          config: { ...config, accessToken, expiry: String(refreshed.expiry) },
        });
      }
    }
    await sendGmailReply({
      accessToken,
      from: config.email || account?.externalId || "",
      to: input.to,
      subject: input.subject ?? "Regarding your inquiry",
      text: input.body,
      threadId: input.threadId,
    });
    return { ok: true, id: `gmail-${Date.now()}` };
  }

  return sendEmail({
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM ?? config.from ?? account?.externalId ?? "noreply@example.com",
    to: input.to,
    subject: input.subject ?? "Regarding your inquiry",
    text: input.body,
  });
}
