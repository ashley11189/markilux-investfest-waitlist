import { NextResponse, after } from "next/server";
import { serverEnv } from "@/lib/env";
import { sendNewSignupEmail } from "@/lib/notify";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  signupSchema,
  fieldErrors,
  firstError,
  MIN_FILL_MS,
} from "@/lib/validation";
import { clientIp, hashIp, confirmationCode } from "@/lib/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Postgres unique-violation. The table has TWO unique constraints. */
const UNIQUE_VIOLATION = "23505";

/**
 * Which constraint a 23505 came from.
 *
 * signups has a unique index on (event_id, lower(email)) AND a global unique
 * on confirmation. Treating every 23505 as "already on the list" loses a real
 * signup whenever a confirmation code happens to collide: the visitor is told
 * they are already registered, no row is written, and nobody is notified.
 */
function isEmailCollision(error: { message?: string; details?: string }): boolean {
  const text = `${error.details ?? ""} ${error.message ?? ""}`;
  if (text.includes("signups_confirmation_key") || /\(confirmation\)/.test(text)) {
    return false;
  }
  return true;
}

/** How many fresh codes to try before giving up on a collision. */
const CONFIRMATION_ATTEMPTS = 5;

/**
 * Per-IP rate limit.
 *
 * Deliberately generous: at a conference every visitor's phone shares the
 * venue's NAT, and the booth iPad submits every kiosk signup from one address,
 * so a tight limit would lock out real people. The actual duplicate protection
 * is the unique index on (event_id, lower(email)) — flooding this endpoint
 * requires a fresh address every time. This is only a backstop against a script
 * generating them, alongside the honeypot and the time-on-form check.
 */
const RATE_LIMIT_WINDOW = "10 minutes";
const RATE_LIMIT_MAX = 30;

type Failure = {
  status: number;
  message: string;
  fields?: Record<string, string>;
  code?: string;
};

function fail({ status, message, fields, code }: Failure) {
  return NextResponse.json({ ok: false, message, fields, code }, { status });
}

export async function POST(request: Request) {
  // ── 1. Parse ──────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail({ status: 400, message: "That request could not be read." });
  }

  // ── 2. Validate, server-side, with the same schema the client used ────────
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return fail({
      status: 400,
      message: firstError(parsed.error),
      fields: fieldErrors(parsed.error),
    });
  }
  const data = parsed.data;

  // ── 3. Spam gates ─────────────────────────────────────────────────────────
  // Honeypot: a hidden field a person can't see and won't fill.
  if (data.mkxRef !== "") {
    // Logged, because this path silently discards a signup. If autofill or an
    // accessibility tool ever starts tripping it again, this is the only way
    // anyone finds out — the visitor is shown a success either way.
    console.warn("[signup] honeypot tripped; submission discarded", {
      email: data.email,
    });
    // Answer as though it worked. A bot that learns it was caught adapts.
    return NextResponse.json({
      ok: true,
      confirmation: confirmationCode(),
      name: data.name,
      duplicate: false,
    });
  }

  // Submitted implausibly fast for a six-field form.
  if (typeof data.elapsedMs === "number" && data.elapsedMs < MIN_FILL_MS) {
    return fail({
      status: 429,
      message: "That came through a little too fast. Try once more.",
      code: "too_fast",
    });
  }

  // ── 4. Resolve the event ──────────────────────────────────────────────────
  const db = supabaseAdmin();
  const { data: event, error: eventError } = await db
    .from("events")
    .select("id, name")
    .eq("slug", serverEnv.eventSlug)
    .single();

  if (eventError || !event) {
    console.error("[signup] event lookup failed", eventError);
    return fail({
      status: 500,
      message: "We could not save that just now. Please try again.",
    });
  }

  // ── 5. Rate limit by hashed IP ────────────────────────────────────────────
  // A blank SIGNUP_IP_SALT makes hashIp throw. That is a deploy mistake, but
  // it must not take every signup at the booth down with it — the limiter is
  // already allowed to fail open a few lines below, so it fails open here too.
  let ipHash: string | null = null;
  try {
    ipHash = hashIp(clientIp(request.headers));
  } catch (error) {
    console.error("[signup] could not hash client IP; rate limiting is off", error);
  }
  if (ipHash) {
    const { data: exceeded, error: rateError } = await db.rpc(
      "signup_rate_exceeded",
      {
        p_ip_hash: ipHash,
        p_window: RATE_LIMIT_WINDOW,
        p_limit: RATE_LIMIT_MAX,
      },
    );
    if (rateError) {
      // Log it, but never block a real signup because the limiter had a bad day.
      console.error("[signup] rate check failed", rateError);
    } else if (exceeded) {
      return fail({
        status: 429,
        message:
          "That is a lot of signups from one device. Give it a few minutes.",
        code: "rate_limited",
      });
    }
  }

  // ── 6. Insert ─────────────────────────────────────────────────────────────
  const source = request.headers.get("x-mkx-kiosk") === "1" ? "kiosk" : "web";
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null;

  let confirmation = confirmationCode();
  let insertError: { code?: string; message?: string; details?: string } | null =
    null;

  // Retry only a confirmation collision. The code space is large but shared
  // across every event forever, so a clash is rare rather than impossible —
  // and a fresh code is all it takes to recover.
  for (let attempt = 0; attempt < CONFIRMATION_ATTEMPTS; attempt += 1) {
    const { error } = await db.from("signups").insert({
      event_id: event.id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      location: data.location,
      notes: data.notes,
      role: data.role,
      timeline: data.timeline,
      interests: data.interests,
      consent: true,
      ip_hash: ipHash,
      user_agent: userAgent,
      source,
      confirmation,
    });

    insertError = error;
    if (!error) break;
    if (error.code === UNIQUE_VIOLATION && !isEmailCollision(error)) {
      console.warn("[signup] confirmation collision, retrying", { attempt });
      confirmation = confirmationCode();
      continue;
    }
    break;
  }

  if (insertError) {
    // The unique index on (event_id, lower(email)) is what actually prevents
    // duplicates — checking first would race. Treat it as a friendly success.
    if (insertError.code === UNIQUE_VIOLATION && isEmailCollision(insertError)) {
      // Deliberately NOT returning the stored confirmation code.
      //
      // This endpoint is unauthenticated, so echoing it back turns a signup
      // into an oracle: anyone can POST a competitor's address and learn both
      // that they are on the private-sale list and what their code is. The
      // duplicate flag alone is enough for the screen the visitor sees, and
      // a genuine returning visitor already had their code emailed to them.
      return NextResponse.json({
        ok: true,
        duplicate: true,
        name: data.name,
        confirmation: null,
      });
    }

    console.error("[signup] insert failed", insertError);
    return fail({
      status: 500,
      message: "We could not save that just now. Please try again.",
    });
  }

  // Notify after the response is flushed. The visitor is standing at the booth
  // waiting on the confirmation screen, and a slow mail server must not be
  // something they wait for. Only genuine new rows notify — a duplicate means
  // this person was already reported once.
  after(async () => {
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(request.url).origin;
    await sendNewSignupEmail({
      signup: data,
      confirmation,
      eventName: event.name,
      source,
      organizerUrl: `${origin.replace(/\/$/, "")}/organizer`,
    });
  });

  return NextResponse.json({
    ok: true,
    duplicate: false,
    name: data.name,
    confirmation,
  });
}
