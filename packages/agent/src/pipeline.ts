import { repo, type Intent } from "@inquiry/db";
import { draftPreTripFaqReply, polishReplyWithLlm } from "./faq-agent";
import { decidePolicy } from "./policy";
import { findRelevantTours, retrieveKnowledge } from "./retrieve";
import { routeIntent, routeIntentWithLlm } from "./router";
import { draftNewClientReply } from "./sales-agent";

export type PipelineInput = {
  orgId: string;
  conversationId: string;
  inboundMessageId: string;
  messageBody: string;
  /** Skip OpenAI calls — required for WhatsApp webhooks on Vercel Hobby (10s limit). */
  fast?: boolean;
};

export type PipelineResult = {
  inquiryId: string;
  intent: Intent;
  action: "auto_reply" | "escalate";
  reply: string | null;
  confidence: number;
  escalationId?: string;
  agentRunId: string;
  lead?: Record<string, unknown>;
};

const AUTO_INTENTS: Intent[] = ["pre_trip_faq", "sales_lead", "availability"];

function isShortFollowUp(message: string): boolean {
  const t = message.trim();
  if (t.length === 0 || t.length > 100) return false;
  return /^(yes|yeah|yep|ok|okay|sure|please|thanks|thank you|hi|hello|hey)\b/i.test(t)
    || /^\d+\s*(adults?|kids?|children|people|pax|guests?)?\s*$/i.test(t)
    || /^(we\s+are\s+)?\d+(\s+people)?$/i.test(t)
    || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\b/i.test(
      t
    )
    || /^\d{1,2}[\/\-]\d{1,2}/.test(t)
    || /\bfor\s+\d+\b/i.test(t)
    || /\bsafari\b/i.test(t);
}

function priorIntentFromMessages(
  messages: Array<{ sender: string; metadata: unknown }>
): Intent | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.sender !== "agent") continue;
    const intent = (msg.metadata as { intent?: Intent } | null)?.intent;
    if (intent && AUTO_INTENTS.includes(intent)) return intent;
  }
  return null;
}

export async function processInquiry(input: PipelineInput): Promise<PipelineResult> {
  const org = await repo.getOrg(input.orgId);
  if (!org) throw new Error(`Organization not found: ${input.orgId}`);

  const history = await repo.listMessages(input.conversationId);
  const priorIntent = priorIntentFromMessages(history);
  const contextQuery = [
    ...history
      .filter((m) => m.direction === "inbound")
      .slice(-4)
      .map((m) => m.body),
    input.messageBody,
  ]
    .filter(Boolean)
    .join("\n");

  let route = input.fast
    ? routeIntent(input.messageBody)
    : await routeIntentWithLlm(input.messageBody);

  if (
    (route.intent === "other" || isShortFollowUp(input.messageBody)) &&
    priorIntent
  ) {
    route = {
      intent: priorIntent,
      confidence: Math.max(route.confidence, 0.7),
      reasoning: `Continued conversation as ${priorIntent}`,
    };
  }

  const [chunks, tours] = await Promise.all([
    retrieveKnowledge(input.orgId, contextQuery),
    findRelevantTours(input.orgId, contextQuery),
  ]);

  if (route.intent === "other" && tours.length > 0) {
    route = {
      intent: "sales_lead",
      confidence: Math.max(route.confidence, 0.65),
      reasoning: "General inquiry with matching tours treated as sales lead",
    };
  }

  const inquiry = await repo.createInquiry({
    orgId: input.orgId,
    conversationId: input.conversationId,
    messageId: input.inboundMessageId,
    intent: route.intent,
    status: "pending",
    summary: input.messageBody.slice(0, 280),
  });

  const autonomy = await repo.getAutonomy(input.orgId, route.intent);
  const autonomyMode = (autonomy?.mode as "auto" | "escalate" | undefined) ?? "escalate";

  let draft = null as
    | (ReturnType<typeof draftPreTripFaqReply> & { lead?: Record<string, unknown> })
    | null;
  let lead: Record<string, unknown> | undefined;

  const historyText = history
    .slice(-10)
    .map((m) => `${m.direction === "inbound" ? "Customer" : "Agent"}: ${m.body}`)
    .join("\n");

  if (route.intent === "pre_trip_faq") {
    draft = draftPreTripFaqReply({
      message: contextQuery,
      brandVoice: org.brandVoice,
      tours,
      chunks,
    });
    if (!input.fast) {
      draft.reply = await polishReplyWithLlm(
        draft.reply,
        org.brandVoice,
        input.messageBody,
        historyText
      );
    }
  } else if (route.intent === "sales_lead" || route.intent === "availability") {
    const sales = draftNewClientReply({
      message: contextQuery,
      brandVoice: org.brandVoice,
      tours,
      chunks,
    });
    if (!input.fast) {
      sales.reply = await polishReplyWithLlm(
        sales.reply,
        org.brandVoice,
        input.messageBody,
        historyText
      );
    }
    draft = sales;
    lead = sales.lead as unknown as Record<string, unknown>;
    const conversation = await repo.getConversation(input.conversationId);
    await repo.createLead({
      orgId: input.orgId,
      conversationId: input.conversationId,
      inquiryId: inquiry.id,
      channel: conversation?.channel,
      customerHandle: conversation?.customerHandle,
      ...sales.lead,
      rawMessage: input.messageBody,
    });
  } else {
    draft = {
      reply:
        route.intent === "refund" || route.intent === "complaint"
          ? `Thanks for reaching out. I've flagged this for our team (${route.intent.replaceAll("_", " ")}). Someone will follow up with you here shortly.`
          : `Thanks for your message — happy to help with tours, availability, meeting points, or a custom itinerary. What are you looking for?`,
      confidence: route.confidence,
      citations: tours.slice(0, 1).map((t) => ({
        source: t.name,
        excerpt: t.description ?? t.name,
      })),
      retrievedChunkIds: [],
      reasoning: route.reasoning,
    };
  }

  const decision = decidePolicy({
    intent: route.intent,
    autonomyMode,
    draft,
    routerConfidence: route.confidence,
  });

  const run = await repo.createAgentRun({
    orgId: input.orgId,
    inquiryId: inquiry.id,
    intent: route.intent,
    confidence: decision.confidence,
    action: decision.action,
    draftReply: draft.reply,
    citations: draft.citations,
    retrievedChunkIds: draft.retrievedChunkIds,
    reasoning: `${route.reasoning} | ${draft.reasoning} | ${decision.reason}`,
  });

  // Customer-facing reply is persisted by ingest after the channel send attempt.
  const customerReply = draft.reply;

  if (decision.action === "auto_reply" && customerReply) {
    await repo.updateInquiry(inquiry.id, {
      status: "auto_resolved",
      resolvedAt: new Date(),
    });

    return {
      inquiryId: inquiry.id,
      intent: route.intent,
      action: "auto_reply",
      reply: customerReply,
      confidence: decision.confidence,
      agentRunId: run.id,
      lead,
    };
  }

  const escalation = await repo.createEscalation({
    orgId: input.orgId,
    inquiryId: inquiry.id,
    reason: decision.reason,
    suggestedReply: draft.reply,
    contextPack: {
      customerMessage: input.messageBody,
      intent: route.intent,
      citations: draft.citations,
      routerConfidence: route.confidence,
      draftConfidence: draft.confidence,
      lead,
    },
  });

  await repo.updateInquiry(inquiry.id, {
    status: "escalated",
    resolvedAt: new Date(),
  });

  return {
    inquiryId: inquiry.id,
    intent: route.intent,
    action: "escalate",
    reply: customerReply,
    confidence: decision.confidence,
    escalationId: escalation.id,
    agentRunId: run.id,
    lead,
  };
}
