import { NextResponse } from "next/server";
import { getGmailAuthUrl } from "@inquiry/channels";
import { readSession } from "@/lib/auth";

export async function GET(req: Request) {
  const session = await readSession();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  if (!session) {
    return NextResponse.redirect(new URL("/login", appUrl));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/dashboard/channels?gmail=missing_env", appUrl)
    );
  }

  const url = getGmailAuthUrl({
    clientId,
    redirectUri: `${appUrl}/api/channels/gmail/callback`,
    state: session.orgId,
  });

  return NextResponse.redirect(url);
}
