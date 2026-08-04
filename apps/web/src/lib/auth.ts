import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { repo } from "@inquiry/db";

const COOKIE = "inquiry_session";

export type Session = {
  userId: string;
  email: string;
  name: string;
  orgId: string;
  orgName: string;
  orgSlug: string;
};

function secret() {
  const value = process.env.AUTH_SECRET ?? "dev-only-secret-change-me";
  return new TextEncoder().encode(value);
}

export async function createSessionToken(session: Session) {
  return new SignJWT(session as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function readSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function setSessionCookie(session: Session) {
  const token = await createSessionToken(session);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function loginWithPassword(email: string, password: string) {
  const user = await repo.getUserByEmail(email);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  const membership = await repo.getMembershipForUser(user.id);
  if (!membership) return null;

  const org = await repo.getOrg(String(membership.orgId));
  if (!org) return null;

  const session: Session = {
    userId: user.id,
    email: user.email,
    name: user.name,
    orgId: org.id,
    orgName: org.name,
    orgSlug: org.slug,
  };
  await setSessionCookie(session);
  return session;
}

export async function requireSession() {
  const session = await readSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}
