import { chunkText, embedText } from "@inquiry/agent";
import { repo } from "@inquiry/db";

export async function ingestKnowledgeSource(input: {
  orgId: string;
  type: "upload" | "url" | "manual" | "tour_field";
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const source = await repo.createKnowledgeSource(input);
  const parts = chunkText(input.content);
  for (const part of parts) {
    const embedding = await embedText(part);
    await repo.createKnowledgeChunk({
      orgId: input.orgId,
      sourceId: source.id,
      content: part,
      embedding,
      metadata: { title: input.title, ...(input.metadata ?? {}) },
    });
  }
  return source;
}

export async function syncTourToKnowledge(orgId: string, tourId: string) {
  const tour = await repo.getTour(tourId);
  if (!tour || tour.orgId !== orgId) throw new Error("Tour not found");

  const content = [
    `Tour: ${tour.name}`,
    `Duration: ${tour.duration ?? ""}`,
    `Meeting point: ${tour.meetingPoint ?? ""}`,
    `Pickup: ${tour.pickupDetails ?? ""}`,
    `What to bring: ${tour.whatToBring ?? ""}`,
    `Inclusions: ${tour.inclusions ?? ""}`,
    `Exclusions: ${tour.exclusions ?? ""}`,
    `Cancellation: ${tour.cancellationPolicy ?? ""}`,
    `Price from: ${tour.priceFrom ?? ""}`,
    tour.description ?? "",
  ]
    .filter((line) => line && !line.endsWith(": "))
    .join("\n");

  return ingestKnowledgeSource({
    orgId,
    type: "tour_field",
    title: `${tour.name} structured fields`,
    content,
    metadata: { tourId: tour.id },
  });
}
