import { NextResponse } from "next/server";
import {
  extractEmailAddress,
  ingestInbound,
  parseInboundEmail,
} from "@inquiry/channels";
import { repo, seedLocalStore } from "@inquiry/db";

export async function POST(req: Request) {
  const secret = req.headers.get("x-email-secret");
  if (secret !== (process.env.EMAIL_INBOUND_SECRET ?? "inquiry-email-secret")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json();
  const email = parseInboundEmail(payload);
  if (!email.from || !email.text) {
    return NextResponse.json({ error: "Invalid email payload" }, { status: 400 });
  }

  await seedLocalStore();

  const to = extractEmailAddress(email.to);
  const from = extractEmailAddress(email.from);

  let account = await repo.getChannelByExternal("email", to);
  if (!account) {
    const org = await repo.getOrgBySlug("sunset-tours");
    if (org) account = await repo.getChannel(org.id, "email");
  }

  if (!account) {
    return NextResponse.json({ error: "No email channel configured" }, { status: 400 });
  }

  const result = await ingestInbound({
    orgId: account.orgId,
    channel: "email",
    channelAccountId: account.id,
    externalThreadId: `email:${from}:${email.subject ?? "inquiry"}`,
    customerHandle: from,
    customerName: email.from,
    subject: email.subject,
    body: email.text,
    externalMessageId: email.messageId,
  });

  return NextResponse.json({ ok: true, result: result.result });
}
