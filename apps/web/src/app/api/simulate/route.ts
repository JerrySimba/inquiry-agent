import { NextResponse } from "next/server";
import { ingestInbound } from "@inquiry/channels";
import { repo } from "@inquiry/db";
import { readSession } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    channel?: "whatsapp" | "email";
    customerHandle?: string;
    body?: string;
    subject?: string;
  };

  if (!body.body || !body.customerHandle || !body.channel) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const account = await repo.getChannel(session.orgId, body.channel);

  const result = await ingestInbound({
    orgId: session.orgId,
    channel: body.channel,
    channelAccountId: account?.id,
    externalThreadId: `${body.channel}:${body.customerHandle}`,
    customerHandle: body.customerHandle,
    customerName: body.customerHandle,
    subject: body.subject ?? "Simulated inquiry",
    body: body.body,
    externalMessageId: `sim-${Date.now()}`,
  });

  return NextResponse.json(result);
}
