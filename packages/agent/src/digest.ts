import { repo } from "@inquiry/db";

export async function buildMorningDigest(orgId: string, now = new Date()) {
  const periodEnd = now;
  const periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const recentInquiries = (await repo.listInquiries(orgId)).filter((i) => {
    const created = new Date(i.createdAt).getTime();
    return created >= periodStart.getTime() && created < periodEnd.getTime();
  });

  const openEscalations = await repo.listEscalations(orgId, true);

  const autoResolvedCount = recentInquiries.filter((i) => i.status === "auto_resolved").length;
  const escalatedCount = recentInquiries.filter((i) => i.status === "escalated").length;

  const intentCounts: Record<string, number> = {};
  for (const inquiry of recentInquiries) {
    intentCounts[inquiry.intent] = (intentCounts[inquiry.intent] ?? 0) + 1;
  }

  const payload = {
    autoResolvedCount,
    escalatedCount,
    intentCounts,
    openEscalations: openEscalations.map((e) => ({
      id: e.id,
      reason: e.reason,
      suggestedReply: e.suggestedReply,
      createdAt: e.createdAt,
    })),
    highlights: recentInquiries
      .filter((i) => i.status === "auto_resolved")
      .slice(0, 10)
      .map((i) => ({ id: i.id, summary: i.summary, intent: i.intent })),
  };

  const digest = await repo.createDigest({
    orgId,
    periodStart,
    periodEnd,
    autoResolvedCount,
    escalatedCount,
    payload,
  });

  return { digest, payload };
}
