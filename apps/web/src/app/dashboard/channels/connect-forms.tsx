"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

export function WhatsAppConnectForm({
  initial,
}: {
  initial?: { phoneNumberId?: string; businessAccountId?: string };
}) {
  const router = useRouter();
  const [phoneNumberId, setPhoneNumberId] = useState(initial?.phoneNumberId ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState(
    initial?.businessAccountId ?? ""
  );
  const [verifyToken, setVerifyToken] = useState("inquiry-verify-token");
  const [status, setStatus] = useState<string | null>(null);
  const [webhook, setWebhook] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Connecting…");
    const res = await fetch("/api/channels/whatsapp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phoneNumberId,
        accessToken,
        businessAccountId,
        verifyToken,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error ?? "Failed");
      return;
    }
    setWebhook(data.channel.webhookUrl);
    setStatus("WhatsApp connected. Paste the webhook URL + verify token in Meta Developer.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel space-y-3 p-5">
      <h2 className="font-display text-2xl">Connect WhatsApp</h2>
      <p className="text-sm text-ink/60">
        From Meta Developer → WhatsApp → API Setup: Phone number ID + permanent token.
      </p>
      <div>
        <label className="label">Phone number ID</label>
        <input
          className="input"
          value={phoneNumberId}
          onChange={(e) => setPhoneNumberId(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label">Access token</label>
        <input
          className="input"
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="label">WhatsApp Business Account ID (optional)</label>
        <input
          className="input"
          value={businessAccountId}
          onChange={(e) => setBusinessAccountId(e.target.value)}
        />
      </div>
      <div>
        <label className="label">Webhook verify token</label>
        <input
          className="input"
          value={verifyToken}
          onChange={(e) => setVerifyToken(e.target.value)}
        />
      </div>
      <button className="btn-primary" type="submit">
        Save WhatsApp connection
      </button>
      {status && <p className="text-sm text-ink/70">{status}</p>}
      {webhook && (
        <pre className="rounded-xl bg-mist/50 p-3 text-xs whitespace-pre-wrap">
          Callback URL: {webhook}
          {"\n"}Verify token: {verifyToken}
        </pre>
      )}
    </form>
  );
}

export function GmailConnectPanel({
  connectedEmail,
  gmailConfigured,
  appUrl,
}: {
  connectedEmail?: string;
  gmailConfigured: boolean;
  appUrl: string;
}) {
  const params = useSearchParams();
  const router = useRouter();
  const redirectUri = `${appUrl.replace(/\/$/, "")}/api/channels/gmail/callback`;
  const isLocal = appUrl.includes("localhost");
  const banner = useMemo(() => {
    const g = params.get("gmail");
    if (g === "connected") return "Gmail connected.";
    if (g === "error") return "Gmail connection failed. Check Google OAuth credentials and redirect URI.";
    if (g === "missing_env") {
      return isLocal
        ? "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to apps/web/.env, then restart the server."
        : "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel → Settings → Environment Variables, then Redeploy.";
    }
    return null;
  }, [params, isLocal]);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  async function sync() {
    setSyncStatus("Syncing unread Gmail…");
    const res = await fetch("/api/channels/gmail/sync", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setSyncStatus(data.error ?? "Sync failed");
      return;
    }
    setSyncStatus(`Processed ${data.processed} unread messages`);
    router.refresh();
  }

  return (
    <div className="panel space-y-3 p-5">
      <h2 className="font-display text-2xl">Connect Gmail</h2>
      <p className="text-sm text-ink/60">
        OAuth connects the operator inbox. Then sync pulls unread inquiry emails and auto-replies
        when allowed.
      </p>
      {connectedEmail ? (
        <p className="text-sm text-lagoon">Connected as {connectedEmail}</p>
      ) : (
        <p className="text-sm text-coral">Not connected</p>
      )}
      {banner && <p className="text-sm text-coral">{banner}</p>}
      {!gmailConfigured && (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink/70">
          <li>
            Create an OAuth client in{" "}
            <a
              className="underline"
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
            >
              Google Cloud Console
            </a>
          </li>
          <li>Enable the Gmail API for that project</li>
          <li>
            Add redirect URI:{" "}
            <code className="rounded bg-mist/70 px-1 break-all">{redirectUri}</code>
          </li>
          <li>
            {isLocal ? (
              <>
                Put <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> in{" "}
                <code>apps/web/.env</code>, then restart <code>npm run dev</code>
              </>
            ) : (
              <>
                In <strong>Vercel → Settings → Environment Variables</strong>, add{" "}
                <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, and{" "}
                <code>NEXT_PUBLIC_APP_URL={appUrl.replace(/\/$/, "")}</code>, then{" "}
                <strong>Redeploy</strong>
              </>
            )}
          </li>
          <li>Return here and click Connect Gmail</li>
        </ol>
      )}
      <div className="flex flex-wrap gap-3">
        {gmailConfigured ? (
          <a className="btn-primary" href="/api/channels/gmail/start">
            {connectedEmail ? "Reconnect Gmail" : "Connect Gmail"}
          </a>
        ) : (
          <button className="btn-primary opacity-50" type="button" disabled>
            Connect Gmail (env missing)
          </button>
        )}
        <button className="btn-secondary" type="button" onClick={sync} disabled={!connectedEmail}>
          Sync unread now
        </button>
      </div>
      {syncStatus && <p className="text-sm text-ink/60">{syncStatus}</p>}
    </div>
  );
}
