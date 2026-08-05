import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";
import { safeEqual } from "@/lib/request";

/**
 * Organizer access.
 *
 * The export shipped a hard-coded `ORGANIZER_CODE = 'MKX-2026'` compared in
 * the browser, which meant anyone who opened devtools could export every
 * lead's name, email and phone. This replaces it: the passcode lives in a
 * server-side env var, is checked in a route handler, and issues a signed
 * httpOnly cookie. The browser never learns the passcode and the leads list
 * is only ever assembled server-side.
 *
 * This is not a full identity system — it is a shared booth passcode, which is
 * the right weight for a three-day event. Rotate ORGANIZER_PASSCODE afterwards.
 */

export const ORGANIZER_COOKIE = "mkx_organizer";
const TTL_SECONDS = 60 * 60 * 12; // one long event day

/**
 * The signing key binds the session secret to the current passcode.
 *
 * Without the passcode in the key, rotating ORGANIZER_PASSCODE revokes
 * nothing: every cookie already issued stays valid for its full 12 hours.
 * That matters because the documented end-of-event step is "rotate the
 * passcode", and because the booth iPad is a shared device in a public venue —
 * anyone who copied the cookie would keep reading the lead list straight
 * through the rotation. Deriving the key here makes a rotation a mass sign-out.
 */
function signingKey(): string {
  return `${serverEnv.organizerSessionSecret}:${serverEnv.organizerPasscode}`;
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey())
    .update(payload)
    .digest("base64url");
}

function token(expiresAt: number): string {
  const payload = String(expiresAt);
  return `${payload}.${sign(payload)}`;
}

/** Longest passcode worth comparing; beyond this it is not a typo, it is a probe. */
const MAX_PASSCODE_LENGTH = 256;

export function verifyPasscode(candidate: string): boolean {
  return safeEqual(
    candidate.trim().slice(0, MAX_PASSCODE_LENGTH),
    serverEnv.organizerPasscode,
  );
}

export async function grantOrganizerSession(): Promise<void> {
  const expiresAt = Date.now() + TTL_SECONDS * 1000;
  const store = await cookies();
  store.set(ORGANIZER_COOKIE, token(expiresAt), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function revokeOrganizerSession(): Promise<void> {
  const store = await cookies();
  store.delete(ORGANIZER_COOKIE);
}

export async function hasOrganizerSession(): Promise<boolean> {
  const raw = (await cookies()).get(ORGANIZER_COOKIE)?.value;
  if (!raw) return false;

  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return false;
  if (!safeEqual(signature, sign(payload))) return false;

  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}
