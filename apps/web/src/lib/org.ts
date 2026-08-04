import { repo } from "@inquiry/db";
import type { Session } from "./auth";

export async function assertOrgAccess(session: Session, orgId: string) {
  if (session.orgId === orgId) return;
  const membership = await repo.getMembershipForUser(session.userId);
  if (!membership || String(membership.orgId) !== orgId) {
    throw new Error("FORBIDDEN");
  }
}
