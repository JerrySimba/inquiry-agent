import { NextResponse } from "next/server";
import { ingestInbound, normalizeTwilioPhone, parseTwilioInbound } from "@inquiry/channels";
import { repo, seedLocalStore } from "@inquiry/db";

export const maxDuration = 60;

async function resolveTwilioAccount(toAddress: string) {
  const normalized = normalizeTwilioPhone(toAddress);
  const variants = [normalized, `+${normalized}`, toAddress.replace(/^whatsapp:/i, "")];

  for (const id of variants) {
    const account = await repo.getChannelByExternal("whatsapp", id);
    if (account) return account;
  }

  const org = await repo.getOrgBySlug("sunset-tours");
  if (org) {
    const account = await repo.getChannel(org.id, "whatsapp");
    if (account) return account;
  }

  return null;
}

export async function POST(req: Request) {
  const form = await req.formData();
  const msg = parseTwilioInbound(form);
  if (!msg) {
    return new NextResponse("<Response></Response>", {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  await seedLocalStore();

  const account = await resolveTwilioAccount(msg.to);
  if (!account) {
    console.error("[twilio webhook] No channel for To", msg.to);
    return new NextResponse("<Response></Response>", {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }

  const customerHandle = normalizeTwilioPhone(msg.from);

  try {
    const ingested = await ingestInbound({
      orgId: account.orgId,
      channel: "whatsapp",
      channelAccountId: account.id,
      externalThreadId: `whatsapp:${customerHandle}`,
      customerHandle,
      body: msg.body,
      externalMessageId: msg.messageSid,
    });

    if (ingested.outbound && !ingested.outbound.ok) {
      console.error("[twilio webhook] Send failed", customerHandle, ingested.outbound.error);
    }
  } catch (err) {
    console.error("[twilio webhook] Handler error", msg.messageSid, err);
  }

  // Empty TwiML — we reply via REST API, not inline TwiML.
  return new NextResponse("<Response></Response>", {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
