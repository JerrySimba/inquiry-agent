import { NextResponse } from "next/server";
import {
  extractWhatsAppTexts,
  ingestInbound,
  verifyWhatsAppChallenge,
} from "@inquiry/channels";
import { repo, seedLocalStore } from "@inquiry/db";

function resolveVerifyToken(orgId?: string | null) {
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

  const phoneNumberId =
    (
      payload as {
        entry?: Array<{
          changes?: Array<{ value?: { metadata?: { phone_number_id?: string } } }>;
        }>;
      }
    ).entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ?? null;

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
    return NextResponse.json({ error: "No WhatsApp channel configured" }, { status: 400 });
  }

  const results = [];
  for (const msg of texts) {
    const result = await ingestInbound({
      orgId: account.orgId,
      channel: "whatsapp",
      channelAccountId: account.id,
      externalThreadId: `whatsapp:${msg.from}`,
      customerHandle: msg.from,
      body: msg.text?.body ?? "",
      externalMessageId: msg.id,
    });
    results.push(result.result);
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
