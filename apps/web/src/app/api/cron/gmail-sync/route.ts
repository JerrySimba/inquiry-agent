import { NextResponse } from "next/server";
import { buildMorningDigest } from "@inquiry/agent";
import { syncAllConnectedGmailInboxes } from "@/lib/gmail-sync";
import { repo } from "@inquiry/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.VERCEL === "1" ? false : true; // allow local without secret
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/** Vercel Cron + optional external pingers hit this every few minutes. */
export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const summaries = await syncAllConnectedGmailInboxes();
  const processed = summaries.reduce(
    (n, s) => n + ("processed" in s && s.ok ? s.processed : 0),
    0
  );

  // Build overnight digests around morning hours in UTC (05:00–05:09 window)
  const hour = new Date().getUTCHours();
  const minute = new Date().getUTCMinutes();
  const digests = [];
  if (hour === 5 && minute < 10) {
    for (const s of summaries) {
      if (!s.ok) continue;
      try {
        digests.push(await buildMorningDigest(s.orgId));
      } catch (err) {
        console.error("digest failed", s.orgId, err);
      }
    }
    // Also digest orgs that had no new mail this tick but are connected
    if (summaries.length === 0) {
      const channels = await repo.listConnectedGmailChannels();
      for (const c of channels) {
        digests.push(await buildMorningDigest(String(c.orgId)));
      }
    }
  }

  return NextResponse.json({
    ok: true,
    inboxes: summaries.length,
    processed,
    summaries,
    digests: digests.length,
    ranAt: new Date().toISOString(),
  });
}
