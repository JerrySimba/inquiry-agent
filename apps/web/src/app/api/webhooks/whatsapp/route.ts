import { NextResponse } from "next/server";
import {
  extractWhatsAppPhoneNumberId,
  extractWhatsAppTexts,
  ingestInbound,
  verifyWhatsAppChallenge,
} from "@inquiry/channels";
import { repo, seedLocalStore } from "@inquiry/db";

export const maxDuration = 60;

function resolveVerifyToken() {
  return process.env.WHATSAPP_VERIFY_TOKEN ?? "inquiry-verify-token";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const challenge = verifyWhatsAppChallenge({
    mode: url.searchParams.get("hub.mode"),
    token: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
    verifyToken: resolveVerifyToken(),
  });
  if (!challenge) return new NextResponse("Forbidden", { status: 403 });
  return new NextResponse(challenge, { status: 200 });
}

export async function POST(req: Request) {
  const payload = await req.json();
  const texts = extractWhatsAppTexts(payload);
  if (!texts.length) return NextResponse.json({ ok: true, processed: 0 });

  await seedLocalStore();

  const phoneNumberId = extractWhatsAppPhoneNumberId(payload);

  const orgIdHeader = req.headers.get("x-org-id");
  let account = null as Awaited<ReturnType<typeof repo.getChannel>> | null;

  if (phoneNumberId) {
    account = await repo.getChannelByExternal("whatsapp", phoneNumberId);
  }
  if (!account && orgIdHeader) {
    account = await repo.getChannel(orgIdHeader, "whatsapp");
  }
  if (!account) {
    const org = await repo.getOrgBySlug("sunset-tours");
    if (org) account = await repo.getChannel(org.id, "whatsapp");
  }

  if (!account) {
    console.error("[whatsapp webhook] No channel for phoneNumberId", phoneNumberId);
    return NextResponse.json({ error: "No WhatsApp channel configured" }, { status: 400 });
  }

  const results = [];
  for (const msg of texts) {
    try {
      const ingested = await ingestInbound({
        orgId: account.orgId,
        channel: "whatsapp",
        channelAccountId: account.id,
        externalThreadId: `whatsapp:${msg.from}`,
        customerHandle: msg.from,
        body: msg.text?.body ?? "",
        externalMessageId: msg.id,
      });

      if (ingested.duplicate) {
        results.push({ duplicate: true, messageId: msg.id });
        continue;
      }

      if (!ingested.result) {
        results.push({ error: "No agent result", messageId: msg.id });
        continue;
      }

      const entry = {
        ...ingested.result,
        outbound: ingested.outbound,
        messageId: msg.id,
      };

      if (ingested.outbound && !ingested.outbound.ok) {
        console.error(
          "[whatsapp webhook] Send failed",
          msg.from,
          ingested.outbound.error
        );
      }

      results.push(entry);
    } catch (err) {
      console.error("[whatsapp webhook] Handler error", msg.id, err);
      results.push({
        error: err instanceof Error ? err.message : "Handler failed",
        messageId: msg.id,
      });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
