import type { Intent } from "@inquiry/db";

export type RouteResult = {
  intent: Intent;
  confidence: number;
  reasoning: string;
};

const RULES: Array<{ intent: Intent; patterns: RegExp[]; weight: number }> = [
  {
    intent: "refund",
    weight: 1.3,
    patterns: [/refund/i, /money\s+back/i, /charge\s*back/i],
  },
  {
    intent: "complaint",
    weight: 1.3,
    patterns: [
      /complain/i,
      /terrible|awful|unacceptable/i,
      /manager/i,
      /disappointed|angry/i,
      /never\s+again/i,
    ],
  },
  {
    intent: "booking_status",
    weight: 1.15,
    patterns: [
      /booking\s*(status|confirm|ref)/i,
      /confirmation\s*(number|code|email)?/i,
      /did\s+(my|the)\s+payment/i,
      /voucher|ticket\s+(pdf|ready)/i,
      /order\s*#?\s*\d+/i,
      /already\s+booked/i,
    ],
  },
  {
    intent: "sales_lead",
    weight: 1.2,
    patterns: [
      /private\s+tour/i,
      /custom\s+(package|itinerary|trip)/i,
      /group\s+(of|booking|quote)/i,
      /quote|proposal|price\s+list/i,
      /honeymoon|corporate/i,
      /\b(pax|adults?|children|kids)\b/i,
      /looking\s+for|interested\s+in|want\s+to\s+book|would\s+like\s+to\s+book/i,
      /do\s+you\s+(offer|have)\s+(a\s+)?(tour|trip|package)/i,
      /itinerary\s+for|plan\s+(a|our)\s+trip|trip\s+options?/i,
      /how\s+much\s+(is|for)|what(?:'s| is)\s+the\s+price/i,
      /family\s+of\s+\d+/i,
      /we\s+are\s+\d+/i,
      /available\s+(tours?|trips?|packages?)/i,
    ],
  },
  {
    intent: "availability",
    weight: 1.1,
    patterns: [
      /availab/i,
      /spots?\s+(left|available|open)/i,
      /do\s+you\s+have\s+(space|seats|tickets)/i,
      /book\s+for\s+\d+/i,
      /any\s+slots?/i,
      /openings?\s+on/i,
    ],
  },
  {
    intent: "pre_trip_faq",
    weight: 1,
    patterns: [
      /meeting\s*point/i,
      /where\s+(do|should)\s+(we|i)\s+meet/i,
      /what\s+to\s+bring/i,
      /what\s+should\s+i\s+bring/i,
      /pickup/i,
      /duration|how\s+long\s+is\s+the\s+tour/i,
      /inclu(sion|ded)/i,
      /exclu(sion|ded)/i,
      /cancel+ation\s+policy|cancel\s+policy/i,
      /dress\s*code/i,
      /what\s+time\s+(do|does|is)/i,
      /our\s+booking|before\s+(the|our)\s+tour|tomorrow'?s\s+tour/i,
    ],
  },
];

export function routeIntent(message: string): RouteResult {
  const scores = new Map<Intent, number>();
  const hits: string[] = [];

  for (const rule of RULES) {
    let score = 0;
    for (const pattern of rule.patterns) {
      if (pattern.test(message)) {
        score += rule.weight;
        hits.push(`${rule.intent}:${pattern.source}`);
      }
    }
    if (score > 0) scores.set(rule.intent, (scores.get(rule.intent) ?? 0) + score);
  }

  // New-client trip browsing without hard keywords
  if (
    scores.size === 0 &&
    /\b(tour|trip|itinerary|bali|ticket|excursion|day\s*trip)\b/i.test(message)
  ) {
    return {
      intent: "sales_lead",
      confidence: 0.55,
      reasoning: "Soft match: trip/tour inquiry treated as new-client sales lead",
    };
  }

  if (scores.size === 0) {
    return {
      intent: "other",
      confidence: 0.35,
      reasoning: "No strong intent patterns matched",
    };
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [intent, raw] = ranked[0];
  const second = ranked[1]?.[1] ?? 0;
  const confidence = Math.min(0.95, 0.45 + raw * 0.12 + (raw - second) * 0.05);

  return {
    intent,
    confidence,
    reasoning: `Matched: ${hits.filter((h) => h.startsWith(intent)).join(", ")}`,
  };
}

export async function routeIntentWithLlm(message: string): Promise<RouteResult> {
  const heuristic = routeIntent(message);
  const key = process.env.OPENAI_API_KEY;
  if (!key) return heuristic;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `Classify travel inquiry intent as one of:
pre_trip_faq, booking_status, availability, sales_lead, refund, complaint, other.
Return JSON: {"intent":"...","confidence":0-1,"reasoning":"..."}
Rules:
- sales_lead = new clients asking about trips, itineraries, prices, packages, pax/party size, dates, wanting to book
- availability = whether seats/spots are open on a date
- pre_trip_faq = guests asking operational details for an upcoming/booked trip (meeting point, what to bring, pickup, dress code)
- Prefer sales_lead over pre_trip_faq when the person is shopping / planning, not already briefed for tomorrow's tour.`,
          },
          { role: "user", content: message },
        ],
      }),
    });
    if (!res.ok) return heuristic;
    const data = (await res.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const parsed = JSON.parse(data.choices[0].message.content) as RouteResult;
    if (!parsed.intent) return heuristic;
    return parsed;
  } catch {
    return heuristic;
  }
}
