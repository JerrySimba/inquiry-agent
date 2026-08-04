import { NextResponse } from "next/server";
import { buildMorningDigest } from "@inquiry/agent";
import {
  renewAllGmailPushWatches,
  syncAllConnectedGmailInboxes,
} from "@/lib/gmail-sync";
import { repo } from "@inquiry/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/** Safety-net poll + renew Gmail push watches (watches expire ~7 days). */
export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const watches = await renewAllGmailPushWatches();
  const summaries = await syncAllConnectedGmailInboxes();
  const processed = summaries.reduce(
    (n, s) => n + ("processed" in s && s.ok ? s.processed : 0),
    0
  );

  const hour = new Date().getUTCHours();
  const minute = new Date().getUTCMinutes();
  const digests = [];
  if (hour === 5 && minute < 10) {
    const channels = await repo.listConnectedGmailChannels();
    for (const c of channels) {
      try {
        digests.push(await buildMorningDigest(String(c.orgId)));
      } catch (err) {
        console.error("digest failed", c.orgId, err);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    mode: process.env.GMAIL_PUBSUB_TOPIC ? "push+poll" : "poll-only",
    watches,
    inboxes: summaries.length,
    processed,
    summaries,
    digests: digests.length,
    ranAt: new Date().toISOString(),
  });
}
