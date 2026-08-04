import { NextResponse } from "next/server";
import { exchangeGmailCode } from "@inquiry/channels";
import { repo } from "@inquiry/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const orgId = url.searchParams.get("state");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!code || !orgId) {
    return NextResponse.redirect(`${appUrl}/dashboard/channels?gmail=error`);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${appUrl}/dashboard/channels?gmail=missing_env`);
  }

  try {
    const tokens = await exchangeGmailCode({
      code,
      clientId,
      clientSecret,
      redirectUri: `${appUrl}/api/channels/gmail/callback`,
    });

    const existing = await repo.getChannel(orgId, "email");
    if (!existing) {
      return NextResponse.redirect(`${appUrl}/dashboard/channels?gmail=no_channel`);
    }

    await repo.updateChannel(existing.id, {
      label: "Gmail",
      externalId: tokens.email,
      connected: true,
      config: {
        provider: "gmail",
        email: tokens.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiry: String(tokens.expiry),
        mode: "live",
      },
    });

    return NextResponse.redirect(`${appUrl}/dashboard/channels?gmail=connected`);
  } catch (err) {
    console.error(err);
    return NextResponse.redirect(`${appUrl}/dashboard/channels?gmail=error`);
  }
}
