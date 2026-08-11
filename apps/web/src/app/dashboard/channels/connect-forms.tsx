"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

export function WhatsAppConnectForm({
  initial,
}: {
  initial?: {
    phoneNumberId?: string;
    businessAccountId?: string;
    lastSendOk?: string;
    lastSendError?: string;
    lastSendAt?: string;
    connected?: boolean;
  };
}) {
  const router = useRouter();
  const [phoneNumberId, setPhoneNumberId] = useState(initial?.phoneNumberId ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState(
    initial?.businessAccountId ?? ""
  );
  const [verifyToken, setVerifyToken] = useState("inquiry-verify-token");
  const [testTo, setTestTo] = useState("254794542527");
  const [status, setStatus] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<string | null>(null);
  const [registerStatus, setRegisterStatus] = useState<string | null>(null);
  const [webhook, setWebhook] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Validating token with Meta…");
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
    setStatus(
      "Token saved securely (field clears on purpose). Now click Register inbound webhooks, then text the business number."
    );
    setAccessToken("");
    router.refresh();
  }

  async function registerInbound() {
    setRegisterStatus("Registering WABA with Meta for inbound messages…");
    const res = await fetch("/api/channels/whatsapp/register-webhook", { method: "POST" });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setRegisterStatus(`REGISTER FAILED: ${data.error ?? data.hint ?? "Unknown error"}`);
      router.refresh();
      return;
    }
    setRegisterStatus(`REGISTER OK — ${data.hint ?? "Text the business number, then refresh Inbox."}`);
    router.refresh();
  }

  async function sendTest() {
    setTestStatus("Sending test message via Meta Graph API…");
    const res = await fetch("/api/channels/whatsapp/test-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: testTo }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      const expiry =
        data.tokenProbe?.expiresAt != null
          ? ` Token expiresAt=${data.tokenProbe.expiresAt}.`
          : "";
      setTestStatus(
        `SEND FAILED: ${data.error ?? "Unknown error"}.${expiry} ${data.hint ?? ""}`
      );
      router.refresh();
      return;
    }
    setTestStatus(
      `SEND OK — check WhatsApp on ${testTo}. ${data.hint ?? ""}`
    );
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel space-y-3 p-5">
      <h2 className="font-display text-2xl">Connect WhatsApp</h2>
      <p className="text-sm text-ink/60">
        Pilot works with Meta&apos;s test number. Temporary tokens expire in ~24h — regenerate in
        Meta → Try it out, then save here or set <code>WHATSAPP_ACCESS_TOKEN</code> in Vercel env.
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
        <label className="label">Access token (paste fresh token)</label>
        <input
          className="input"
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          required
          placeholder="Generate in Meta → Try it out (expires ~24h)"
        />
        <p className="mt-1 text-xs text-ink/55">
          After Save, this field clears but the token stays stored. If Register fails with
          &quot;Session has expired&quot;, generate a new token in Meta and save again.
        </p>
      </div>
      <div>
        <label className="label">WhatsApp Business Account ID</label>
        <input
          className="input"
          value={businessAccountId}
          onChange={(e) => setBusinessAccountId(e.target.value)}
          placeholder="2514751728997756"
          required
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
      {(initial?.lastSendError || initial?.lastSendOk) && (
        <p
          className={`text-sm ${
            initial.lastSendOk === "true" ? "text-lagoon" : "text-coral"
          }`}
        >
          Last send: {initial.lastSendOk === "true" ? "OK" : "FAILED"}
          {initial.lastSendAt ? ` · ${new Date(initial.lastSendAt).toLocaleString()}` : ""}
          {initial.lastSendError ? ` · ${initial.lastSendError}` : ""}
        </p>
      )}
      {webhook && (
        <pre className="rounded-xl bg-mist/50 p-3 text-xs whitespace-pre-wrap">
          Callback URL: {webhook}
          {"\n"}Verify token: {verifyToken}
        </pre>
      )}

      <div className="border-t border-black/5 pt-3 space-y-3">
        <div className="rounded-xl border border-coral/30 bg-coral/5 p-3 text-sm text-ink/80">
          <p className="font-medium text-coral">App is Live — register inbound next</p>
          <p className="mt-1">
            If your phone texts still don&apos;t appear in Inbox, Meta hasn&apos;t linked your
            WhatsApp Business Account to the app yet.
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              WABA ID above must be{" "}
              <code className="rounded bg-white/70 px-1 text-xs">2514751728997756</code>
            </li>
            <li>Click <strong>Register inbound webhooks</strong> below</li>
            <li>Text the business number from your phone → refresh Inbox</li>
          </ol>
        </div>
        <button className="btn-primary" type="button" onClick={registerInbound}>
          Register inbound webhooks
        </button>
        {registerStatus && (
          <p className="text-sm text-ink/70 whitespace-pre-wrap">{registerStatus}</p>
        )}
        <h3 className="font-medium">Prove outbound works</h3>
        <p className="text-sm text-ink/60">
          This bypasses the agent and calls Meta directly. If this fails, agent replies cannot
          reach WhatsApp.
        </p>
        <div>
          <label className="label">Your WhatsApp number (digits only)</label>
          <input
            className="input"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="254794542527"
          />
        </div>
        <button className="btn-secondary" type="button" onClick={sendTest}>
          Send test WhatsApp
        </button>
        {testStatus && <p className="text-sm text-ink/70 whitespace-pre-wrap">{testStatus}</p>}
      </div>
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
        OAuth connects the operator inbox. With Gmail Push configured, new emails are handled as
        they arrive; cron is a backup. Sync is only for an immediate manual pull.
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
