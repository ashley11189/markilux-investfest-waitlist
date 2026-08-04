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

function sign(payload: string): string {
  return createHmac("sha256", serverEnv.organizerSessionSecret)
    .update(payload)
    .digest("base64url");
}

function token(expiresAt: number): string {
  const payload = String(expiresAt);
  return `${payload}.${sign(payload)}`;
}

export function verifyPasscode(candidate: string): boolean {
  return safeEqual(candidate.trim(), serverEnv.organizerPasscode);
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
