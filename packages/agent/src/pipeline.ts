import { repo, type Intent } from "@inquiry/db";
import { draftPreTripFaqReply, polishReplyWithLlm } from "./faq-agent";
import { decidePolicy } from "./policy";
import { findRelevantTours, retrieveKnowledge } from "./retrieve";
import { routeIntentWithLlm } from "./router";
import { draftNewClientReply } from "./sales-agent";

export type PipelineInput = {
  orgId: string;
  conversationId: string;
  inboundMessageId: string;
  messageBody: string;
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

export async function processInquiry(input: PipelineInput): Promise<PipelineResult> {
  const org = await repo.getOrg(input.orgId);
  if (!org) throw new Error(`Organization not found: ${input.orgId}`);

  const route = await routeIntentWithLlm(input.messageBody);

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

  const [chunks, tours] = await Promise.all([
    retrieveKnowledge(input.orgId, input.messageBody),
    findRelevantTours(input.orgId, input.messageBody),
  ]);

  let draft = null as
    | (ReturnType<typeof draftPreTripFaqReply> & { lead?: Record<string, unknown> })
    | null;
  let lead: Record<string, unknown> | undefined;

  if (route.intent === "pre_trip_faq") {
    draft = draftPreTripFaqReply({
      message: input.messageBody,
      brandVoice: org.brandVoice,
      tours,
      chunks,
    });
    draft.reply = await polishReplyWithLlm(draft.reply, org.brandVoice, input.messageBody);
  } else if (route.intent === "sales_lead" || route.intent === "availability") {
    const sales = draftNewClientReply({
      message: input.messageBody,
      brandVoice: org.brandVoice,
      tours,
      chunks,
    });
    sales.reply = await polishReplyWithLlm(sales.reply, org.brandVoice, input.messageBody);
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
      reply: `Thanks for reaching out. I've flagged this for our team (${route.intent.replaceAll("_", " ")}). We'll get back to you shortly.`,
      confidence: route.confidence,
      citations: [],
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

  if (decision.action === "auto_reply" && draft.reply) {
    await repo.createMessage({
      orgId: input.orgId,
      conversationId: input.conversationId,
      direction: "outbound",
      sender: "agent",
      body: draft.reply,
      metadata: { agentRunId: run.id, intent: route.intent, lead },
    });

    await repo.updateInquiry(inquiry.id, {
      status: "auto_resolved",
      resolvedAt: new Date(),
    });

    return {
      inquiryId: inquiry.id,
      intent: route.intent,
      action: "auto_reply",
      reply: draft.reply,
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
    reply: null,
    confidence: decision.confidence,
    escalationId: escalation.id,
    agentRunId: run.id,
    lead,
  };
}
