"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const fields = [
  ["name", "Name"],
  ["slug", "Slug"],
  ["duration", "Duration"],
  ["meetingPoint", "Meeting point"],
  ["pickupDetails", "Pickup details"],
  ["whatToBring", "What to bring"],
  ["inclusions", "Inclusions"],
  ["exclusions", "Exclusions"],
  ["cancellationPolicy", "Cancellation policy"],
  ["priceFrom", "Price from"],
] as const;

export function TourForm() {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>({
    name: "",
    slug: "",
    duration: "",
    meetingPoint: "",
    pickupDetails: "",
    whatToBring: "",
    inclusions: "",
    exclusions: "",
    cancellationPolicy: "",
    priceFrom: "",
    description: "",
  });
  const [status, setStatus] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Saving…");
    const res = await fetch("/api/tours", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      setStatus("Failed to save");
      return;
    }
    setStatus("Saved and synced to company brain");
    setForm({
      name: "",
      slug: "",
      duration: "",
      meetingPoint: "",
      pickupDetails: "",
      whatToBring: "",
      inclusions: "",
      exclusions: "",
      cancellationPolicy: "",
      priceFrom: "",
      description: "",
    });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="panel grid gap-3 p-5 md:grid-cols-2">
      {fields.map(([key, label]) => (
        <div key={key} className={key.includes("Policy") || key.includes("Bring") ? "md:col-span-2" : ""}>
          <label className="label">{label}</label>
          <input
            className="input"
            value={form[key] ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            required={key === "name" || key === "slug"}
          />
        </div>
      ))}
      <div className="md:col-span-2">
        <label className="label">Description</label>
        <textarea
          className="input min-h-24"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
      </div>
      <div className="md:col-span-2 flex items-center gap-3">
        <button className="btn-primary" type="submit">
          Add tour
        </button>
        {status && <p className="text-sm text-ink/60">{status}</p>}
      </div>
    </form>
  );
}
