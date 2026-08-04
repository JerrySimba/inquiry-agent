import type { TourProduct } from "@inquiry/db";
import type { RetrievedChunk } from "./retrieve";
import type { FaqDraft } from "./faq-agent";

export type LeadCapture = {
  paxAdults?: number;
  paxChildren?: number;
  paxTotal?: number;
  travelDates?: string;
  destination?: string;
  interests: string[];
  missingFields: string[];
};

function extractLead(message: string): LeadCapture {
  const interests: string[] = [];
  const lower = message.toLowerCase();

  if (/uluwatu|kecak|temple/.test(lower)) interests.push("Uluwatu / Kecak");
  if (/penida|nusa/.test(lower)) interests.push("Nusa Penida");
  if (/sunset/.test(lower)) interests.push("sunset");
  if (/snorkel|diving|beach/.test(lower)) interests.push("beach / water");
  if (/family|kids|children/.test(lower)) interests.push("family");
  if (/honeymoon|romantic|couple/.test(lower)) interests.push("couples");
  if (/private|custom|group/.test(lower)) interests.push("private/custom");

  let paxAdults: number | undefined;
  let paxChildren: number | undefined;
  let paxTotal: number | undefined;

  const adults = message.match(/(\d+)\s*(adults?|pax|people|persons?|guests?)/i);
  const children = message.match(/(\d+)\s*(kids?|children|child)/i);
  const ofUs = message.match(/(?:party|group)\s*(?:of\s*)?(\d+)/i);
  const weAre = message.match(/we\s+are\s+(\d+)/i);

  if (adults) paxAdults = Number(adults[1]);
  if (children) paxChildren = Number(children[1]);
  if (ofUs) paxTotal = Number(ofUs[1]);
  if (weAre) paxTotal = Number(weAre[1]);
  if (paxAdults != null || paxChildren != null) {
    paxTotal = (paxAdults ?? 0) + (paxChildren ?? 0) || paxTotal;
  }

  const datePatterns = [
    /(?:on|for|from)\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/i,
    /(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/,
    /(next\s+(?:week|weekend|month)|this\s+weekend|tomorrow)/i,
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i,
  ];
  let travelDates: string | undefined;
  for (const p of datePatterns) {
    const m = message.match(p);
    if (m) {
      travelDates = m[1] ?? m[0];
      break;
    }
  }

  const destinationMatch = message.match(
    /\b(bali|seminyak|canggu|ubud|uluwatu|nusa\s*penida|sanur|jimbaran)\b/i
  );

  const missingFields: string[] = [];
  if (paxTotal == null && paxAdults == null) missingFields.push("number of guests (pax)");
  if (!travelDates) missingFields.push("preferred travel date(s)");

  return {
    paxAdults,
    paxChildren,
    paxTotal,
    travelDates,
    destination: destinationMatch?.[1],
    interests,
    missingFields,
  };
}

function tourBlurb(tour: TourProduct): string {
  return [
    `**${tour.name}** — ${tour.priceFrom ?? "ask for price"}`,
    tour.duration ? `Duration: ${tour.duration}` : null,
    tour.description ? tour.description : null,
    tour.inclusions ? `Includes: ${tour.inclusions}` : null,
    tour.meetingPoint ? `Meeting point: ${tour.meetingPoint}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function draftNewClientReply(input: {
  message: string;
  brandVoice?: string | null;
  tours: TourProduct[];
  chunks: RetrievedChunk[];
}): FaqDraft & { lead: LeadCapture } {
  const lead = extractLead(input.message);
  const citations: Array<{ source: string; excerpt: string }> = [];

  let matched = input.tours;
  if (lead.interests.length) {
    const scored = input.tours
      .map((tour) => {
        const hay = `${tour.name} ${tour.description} ${tour.inclusions}`.toLowerCase();
        let score = 0;
        for (const interest of lead.interests) {
          for (const token of interest.toLowerCase().split(/\W+/)) {
            if (token.length > 3 && hay.includes(token)) score += 1;
          }
        }
        return { tour, score };
      })
      .sort((a, b) => b.score - a.score);
    if (scored[0]?.score > 0) matched = scored.filter((s) => s.score > 0).map((s) => s.tour);
  }

  if (!matched.length) matched = input.tours.slice(0, 2);

  for (const tour of matched.slice(0, 3)) {
    citations.push({
      source: tour.name,
      excerpt: [tour.priceFrom, tour.duration, tour.description].filter(Boolean).join(" · "),
    });
  }

  for (const chunk of input.chunks.slice(0, 3)) {
    if (chunk.score >= 0.25) {
      citations.push({ source: chunk.source, excerpt: chunk.content.slice(0, 200) });
    }
  }

  const parts: string[] = [];
  parts.push(
    "Thanks for getting in touch — happy to help you plan the trip."
  );

  if (matched.length) {
    parts.push("Here are options that fit what you asked about:\n");
    parts.push(matched.slice(0, 3).map(tourBlurb).join("\n\n"));
  }

  const captured: string[] = [];
  if (lead.paxTotal != null) captured.push(`${lead.paxTotal} guests`);
  else if (lead.paxAdults != null) {
    captured.push(
      `${lead.paxAdults} adults${lead.paxChildren != null ? `, ${lead.paxChildren} children` : ""}`
    );
  }
  if (lead.travelDates) captured.push(`dates: ${lead.travelDates}`);
  if (captured.length) {
    parts.push(`I've noted: ${captured.join(" · ")}.`);
  }

  if (lead.missingFields.length) {
    parts.push(
      `To check availability and lock a quote, could you share your ${lead.missingFields.join(" and ")}?`
    );
  } else {
    parts.push(
      "I can hold this as a booking request for our team to confirm availability and send payment details shortly. Reply YES to proceed, or tell me if you'd like a private/custom itinerary."
    );
  }

  const grounded = citations.length > 0 && matched.length > 0;
  const confidence = grounded
    ? Math.min(0.93, 0.62 + citations.length * 0.06 + (lead.missingFields.length ? 0.05 : 0.12))
    : 0.4;

  return {
    reply: parts.join("\n\n"),
    confidence,
    citations: citations.slice(0, 6),
    retrievedChunkIds: input.chunks.map((c) => c.id),
    reasoning: grounded
      ? `New-client sales draft; interests=${lead.interests.join(",") || "general"}; missing=${lead.missingFields.join(",") || "none"}`
      : "Insufficient catalog match for confident new-client reply",
    lead,
  };
}
