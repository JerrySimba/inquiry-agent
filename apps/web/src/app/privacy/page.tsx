export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-ink">
      <h1 className="font-display text-4xl">Privacy Policy</h1>
      <p className="mt-2 text-sm text-ink/60">Last updated: August 2026</p>
      <div className="mt-8 space-y-4 text-sm leading-relaxed text-ink/80">
        <p>
          Inquiry Agent (&quot;we&quot;) helps travel businesses respond to customer inquiries
          received via WhatsApp and email. This policy describes how we handle data for pilot
          and production tenants.
        </p>
        <h2 className="font-display text-xl text-ink">Data we process</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Customer messages sent to connected WhatsApp or email channels</li>
          <li>Business catalog, FAQ, and operator account settings you provide</li>
          <li>Technical logs needed to operate the service (delivery status, errors)</li>
        </ul>
        <h2 className="font-display text-xl text-ink">How we use data</h2>
        <p>
          Messages are processed to classify intent, draft replies, capture sales leads, and
          escalate to your team when automation is not appropriate. We do not sell customer
          data.
        </p>
        <h2 className="font-display text-xl text-ink">Retention &amp; security</h2>
        <p>
          Data is stored in encrypted databases with tenant isolation. You may request deletion
          of your organization data by contacting your account operator.
        </p>
        <h2 className="font-display text-xl text-ink">Contact</h2>
        <p>
          For privacy questions:{" "}
          <a className="text-lagoon underline" href="mailto:ops@sunset-tours.example">
            ops@sunset-tours.example
          </a>
        </p>
      </div>
    </main>
  );
}
