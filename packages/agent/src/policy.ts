import type { Intent } from "@inquiry/db";
import type { FaqDraft } from "./faq-agent";

export type AutonomyMode = "auto" | "escalate";

export type PolicyDecision = {
  action: "auto_reply" | "escalate";
  reason: string;
  confidence: number;
};

/** Low enough for grounded sales/FAQ drafts to auto-send in live chat. */
const AUTO_CONFIDENCE_THRESHOLD = 0.55;
const MIN_CITATIONS = 1;

const AUTO_ELIGIBLE: Intent[] = ["pre_trip_faq", "sales_lead", "availability"];

export function decidePolicy(input: {
  intent: Intent;
  autonomyMode: AutonomyMode;
  draft: FaqDraft | null;
  routerConfidence: number;
}): PolicyDecision {
  if (input.autonomyMode !== "auto") {
    return {
      action: "escalate",
      reason: `Intent ${input.intent} is not enabled for auto-send`,
      confidence: input.draft?.confidence ?? input.routerConfidence,
    };
  }

  if (!AUTO_ELIGIBLE.includes(input.intent)) {
    return {
      action: "escalate",
      reason: `Intent ${input.intent} is not auto-eligible (only ${AUTO_ELIGIBLE.join(", ")})`,
      confidence: input.routerConfidence,
    };
  }

  if (!input.draft) {
    return {
      action: "escalate",
      reason: "No draft produced",
      confidence: 0,
    };
  }

  if (input.draft.citations.length < MIN_CITATIONS) {
    return {
      action: "escalate",
      reason: "Missing citations — refusing ungrounded auto-send",
      confidence: input.draft.confidence,
    };
  }

  if (input.draft.confidence < AUTO_CONFIDENCE_THRESHOLD) {
    return {
      action: "escalate",
      reason: `Confidence ${input.draft.confidence.toFixed(2)} below threshold ${AUTO_CONFIDENCE_THRESHOLD}`,
      confidence: input.draft.confidence,
    };
  }

  return {
    action: "auto_reply",
    reason: `Grounded ${input.intent} reply with sufficient confidence`,
    confidence: input.draft.confidence,
  };
}
