import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env";
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

/** Postgres unique-violation. Here it means "already on the list". */
const UNIQUE_VIOLATION = "23505";

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
  if (data.company !== "") {
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
  const ipHash = hashIp(clientIp(request.headers));
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
  const confirmation = confirmationCode();
  const { error: insertError } = await db.from("signups").insert({
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
    user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    source: request.headers.get("x-mkx-kiosk") === "1" ? "kiosk" : "web",
    confirmation,
  });

  if (insertError) {
    // The unique index on (event_id, lower(email)) is what actually prevents
    // duplicates — checking first would race. Treat it as a friendly success.
    if (insertError.code === UNIQUE_VIOLATION) {
      // eq, not ilike: the schema lower-cases every email on the way in, and
      // an underscore in an address is a single-character LIKE wildcard that
      // could otherwise match somebody else's row.
      const { data: existing } = await db
        .from("signups")
        .select("confirmation")
        .eq("event_id", event.id)
        .eq("email", data.email)
        .maybeSingle();

      return NextResponse.json({
        ok: true,
        duplicate: true,
        name: data.name,
        confirmation: existing?.confirmation ?? null,
      });
    }

    console.error("[signup] insert failed", insertError);
    return fail({
      status: 500,
      message: "We could not save that just now. Please try again.",
    });
  }

  return NextResponse.json({
    ok: true,
    duplicate: false,
    name: data.name,
    confirmation,
  });
}
