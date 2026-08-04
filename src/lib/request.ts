import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

/**
 * Best-effort client IP. Vercel sets x-forwarded-for; we take the left-most
 * entry, which is the original client. Returns null behind a proxy that
 * strips it, in which case rate limiting simply doesn't apply.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || null;
}

/**
 * Salted digest of an IP. We rate-limit on this and never store the address
 * itself — the raw value has no use to us once it's been counted.
 */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256")
    .update(`${serverEnv.ipSalt}:${ip}`)
    .digest("hex");
}

/**
 * Confirmation code shown at the booth. Crockford-style alphabet: no I, L, O,
 * U, or digits that look like them, because someone will read this aloud.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function confirmationCode(): string {
  let body = "";
  for (let i = 0; i < 6; i += 1) {
    body += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `MKX-${body}`;
}

/** Constant-time string compare, so passcode checks don't leak length or prefix. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Still burn a comparison so the timing profile stays flat.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
