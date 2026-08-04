import { NextResponse } from "next/server";
import {
  verifyPasscode,
  grantOrganizerSession,
  revokeOrganizerSession,
  hasOrganizerSession,
} from "@/lib/organizer-session";
import { clientIp, hashIp } from "@/lib/request";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Passcode attempts allowed per client per window, to blunt guessing. */
const ATTEMPT_LIMIT = 8;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

/**
 * In-memory counter. On serverless this is per-instance and therefore leaky,
 * but it costs nothing and raises the floor; the real protection is that the
 * passcode is server-side and the cookie is signed.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();

function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > ATTEMPT_LIMIT;
}

export async function GET() {
  return NextResponse.json({ authenticated: await hasOrganizerSession() });
}

export async function POST(request: Request) {
  let passcode = "";
  try {
    const body = (await request.json()) as { passcode?: unknown };
    passcode = typeof body.passcode === "string" ? body.passcode : "";
  } catch {
    return NextResponse.json(
      { ok: false, message: "That request could not be read." },
      { status: 400 },
    );
  }

  const key = hashIp(clientIp(request.headers)) ?? "unknown";
  if (tooManyAttempts(key)) {
    return NextResponse.json(
      { ok: false, message: "Too many attempts. Wait a few minutes." },
      { status: 429 },
    );
  }

  if (!passcode || !verifyPasscode(passcode)) {
    return NextResponse.json(
      { ok: false, message: "That code is not right." },
      { status: 401 },
    );
  }

  await grantOrganizerSession();

  // Warm the connection so the first leads fetch feels instant at the booth.
  void supabaseAdmin();

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await revokeOrganizerSession();
  return NextResponse.json({ ok: true });
}
