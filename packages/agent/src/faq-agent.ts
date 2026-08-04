import type { TourProduct } from "@inquiry/db";
import type { RetrievedChunk } from "./retrieve";

export type FaqDraft = {
  reply: string;
  confidence: number;
  citations: Array<{ source: string; excerpt: string }>;
  retrievedChunkIds: string[];
  reasoning: string;
};

function tourToFacts(tour: TourProduct): Array<{ source: string; excerpt: string; field: string }> {
  const fields: Array<[string, string | null | undefined]> = [
    ["meeting point", tour.meetingPoint],
    ["pickup", tour.pickupDetails],
    ["what to bring", tour.whatToBring],
    ["duration", tour.duration],
    ["inclusions", tour.inclusions],
    ["exclusions", tour.exclusions],
    ["cancellation policy", tour.cancellationPolicy],
    ["price", tour.priceFrom],
  ];
  return fields
    .filter(([, v]) => !!v)
    .map(([field, v]) => ({
      source: `${tour.name} / ${field}`,
      excerpt: String(v),
      field,
    }));
}

function detectTopics(message: string): string[] {
  const topics: string[] = [];
  if (/meet|where|location|gate|harbour|harbor/i.test(message)) topics.push("meeting point");
  if (/pickup|pick\s*up|hotel/i.test(message)) topics.push("pickup");
  if (/bring|wear|dress|shoes|sunscreen/i.test(message)) topics.push("what to bring");
  if (/how\s+long|duration|hours/i.test(message)) topics.push("duration");
  if (/inclu/i.test(message)) topics.push("inclusions");
  if (/exclu/i.test(message)) topics.push("exclusions");
  if (/cancel/i.test(message)) topics.push("cancellation policy");
  if (/price|cost|how\s+much/i.test(message)) topics.push("price");
  return topics;
}

export function draftPreTripFaqReply(input: {
  message: string;
  brandVoice?: string | null;
  tours: TourProduct[];
  chunks: RetrievedChunk[];
}): FaqDraft {
  const topics = detectTopics(input.message);
  const citations: Array<{ source: string; excerpt: string }> = [];
  const answers: string[] = [];

  const primaryTour = input.tours[0];
  if (primaryTour) {
    const facts = tourToFacts(primaryTour);
    const relevant =
      topics.length > 0
        ? facts.filter((f) => topics.some((t) => f.field.includes(t) || t.includes(f.field)))
        : facts.slice(0, 3);

    for (const fact of relevant) {
      citations.push({ source: fact.source, excerpt: fact.excerpt });
      answers.push(`**${fact.field}:** ${fact.excerpt}`);
    }
  }

  for (const chunk of input.chunks.slice(0, 4)) {
    if (chunk.score < 0.15) continue;
    const already = citations.some((c) => c.excerpt === chunk.content);
    if (already) continue;
    if (topics.length && !topics.some((t) => chunk.content.toLowerCase().includes(t.split(" ")[0]!))) {
      // still allow high-score chunks
      if (chunk.score < 0.35) continue;
    }
    citations.push({
      source: chunk.source,
      excerpt: chunk.content.slice(0, 240),
    });
  }

  const grounded = citations.length > 0 && (answers.length > 0 || input.chunks.some((c) => c.score >= 0.28));
  const confidence = grounded
    ? Math.min(0.95, 0.55 + citations.length * 0.08 + (topics.length ? 0.1 : 0))
    : Math.max(0.2, (input.chunks[0]?.score ?? 0) * 0.5);

  let reply: string;
  if (grounded && answers.length) {
    const tourLine = primaryTour ? `For **${primaryTour.name}**:\n\n` : "";
    reply = `${tourLine}${answers.join("\n\n")}\n\nIf you need anything else before your trip, just reply here.`;
  } else if (grounded) {
    reply = citations
      .slice(0, 3)
      .map((c) => c.excerpt)
      .join("\n\n");
  } else {
    reply =
      "Thanks for your message. I want to make sure you get accurate trip details — a teammate will follow up shortly with a confirmed answer.";
  }

  if (input.brandVoice && grounded) {
    // light touch: keep content, ensure friendly close already present
  }

  return {
    reply,
    confidence,
    citations: citations.slice(0, 6),
    retrievedChunkIds: input.chunks.map((c) => c.id),
    reasoning: grounded
      ? `Grounded in ${citations.length} citations; topics=${topics.join(",") || "general"}`
      : "Insufficient grounded knowledge for confident auto-reply",
  };
}

export async function polishReplyWithLlm(
  draft: string,
  brandVoice: string | null | undefined,
  message: string
): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return draft;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: `Rewrite the draft reply for a travel company WhatsApp/email agent.
Brand voice: ${brandVoice ?? "friendly and clear"}
Rules: Do not invent facts. Keep all concrete details (places, times, policies). Keep under 180 words. No markdown headings.`,
          },
          {
            role: "user",
            content: `Customer message:\n${message}\n\nDraft:\n${draft}`,
          },
        ],
      }),
    });
    if (!res.ok) return draft;
    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content?.trim() || draft;
  } catch {
    return draft;
  }
}
