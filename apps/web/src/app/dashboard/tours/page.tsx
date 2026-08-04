import { repo } from "@inquiry/db";
import { readSession } from "@/lib/auth";
import { TourForm } from "./tour-form";

export default async function ToursPage() {
  const session = await readSession();
  if (!session) return null;
  const tours = await repo.listTours(session.orgId);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl">Tour catalog</h1>
        <p className="mt-2 text-ink/65">
          Structured fields are the high-trust source for overnight FAQ auto-replies.
        </p>
      </header>

      <TourForm />

      <div className="grid gap-4">
        {tours.map((tour) => (
          <article key={tour.id} className="panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl">{tour.name}</h2>
                <p className="mt-1 text-sm text-ink/60">
                  {tour.duration} · {tour.priceFrom}
                </p>
              </div>
              <span className="rounded-full bg-lagoon/10 px-3 py-1 text-xs text-lagoon">
                {tour.active ? "active" : "inactive"}
              </span>
            </div>
            <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              <div>
                <dt className="label">Meeting point</dt>
                <dd>{tour.meetingPoint}</dd>
              </div>
              <div>
                <dt className="label">What to bring</dt>
                <dd>{tour.whatToBring}</dd>
              </div>
              <div>
                <dt className="label">Pickup</dt>
                <dd>{tour.pickupDetails}</dd>
              </div>
              <div>
                <dt className="label">Cancellation</dt>
                <dd>{tour.cancellationPolicy}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}
