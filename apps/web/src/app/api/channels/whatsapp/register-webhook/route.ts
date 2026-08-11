import { NextResponse } from "next/server";
import { repo } from "@inquiry/db";
import { readSession } from "@/lib/auth";

function resolveWhatsAppCredentials(account: Awaited<ReturnType<typeof repo.getChannel>>) {
  const config = (account?.config ?? {}) as Record<string, string>;
  return {
    accessToken: (
      process.env.WHATSAPP_ACCESS_TOKEN ||
      config.accessToken ||
      ""
    ).trim(),
    wabaId: (
      process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ||
      config.businessAccountId ||
      ""
    ).trim(),
    phoneNumberId: (
      process.env.WHATSAPP_PHONE_NUMBER_ID ||
      config.phoneNumberId ||
      account?.externalId ||
      ""
    ).trim(),
  };
}

/** Links the Live Meta app to the WABA so real inbound messages hit our webhook. */
export async function POST() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await repo.getChannel(session.orgId, "whatsapp");
  if (!account) {
    return NextResponse.json({ error: "WhatsApp channel missing" }, { status: 404 });
  }

  const { accessToken, wabaId, phoneNumberId } = resolveWhatsAppCredentials(account);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Missing access token. Set WHATSAPP_ACCESS_TOKEN or save a fresh token." },
      { status: 400 }
    );
  }
  if (!wabaId) {
    return NextResponse.json(
      {
        error:
          "Missing WhatsApp Business Account ID. Add 2514751728997756 in Channels and save, or set WHATSAPP_BUSINESS_ACCOUNT_ID in Vercel.",
      },
      { status: 400 }
    );
  }

  const headers = { Authorization: `Bearer ${accessToken}` };
  const base = `https://graph.facebook.com/v22.0/${wabaId}`;

  const beforeRes = await fetch(`${base}/subscribed_apps`, { headers });
  const before = (await beforeRes.json()) as { data?: unknown[]; error?: { message?: string } };

  const subscribeRes = await fetch(`${base}/subscribed_apps`, {
    method: "POST",
    headers,
  });
  const subscribe = (await subscribeRes.json()) as { success?: boolean; error?: { message?: string } };

  const afterRes = await fetch(`${base}/subscribed_apps`, { headers });
  const after = (await afterRes.json()) as { data?: unknown[]; error?: { message?: string } };

  const phoneRes = await fetch(
    `https://graph.facebook.com/v22.0/${phoneNumberId}?fields=display_phone_number,verified_name`,
    { headers }
  );
  const phone = (await phoneRes.json()) as {
    display_phone_number?: string;
    error?: { message?: string };
  };

  const config = (account.config ?? {}) as Record<string, string>;
  await repo.updateChannel(account.id, {
    config: {
      ...config,
      businessAccountId: wabaId,
      wabaRegisteredAt: new Date().toISOString(),
      wabaSubscribeOk: subscribeRes.ok ? "true" : "false",
      wabaSubscribeError: subscribe.error?.message ?? "",
    },
  });

  return NextResponse.json({
    ok: subscribeRes.ok,
    wabaId,
    phoneNumberId,
    phone,
    subscribedAppsBefore: before.data ?? before,
    subscribedAppsAfter: after.data ?? after,
    subscribe,
    hint: subscribeRes.ok
      ? "WABA registered. Text the business number from your phone, then refresh Inbox."
      : subscribe.error?.message ??
        "Meta rejected WABA registration. Regenerate token in Meta Try it out and save again.",
  });
}
