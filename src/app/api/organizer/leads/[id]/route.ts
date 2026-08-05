import { NextResponse } from "next/server";
import { hasOrganizerSession } from "@/lib/organizer-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { leadUpdateSchema, firstError } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Update one lead's follow-up state. Cookie-gated exactly like the list, and
 * scoped to the current event so an id from another show cannot be edited by
 * guessing it.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await hasOrganizerSession())) {
    return NextResponse.json(
      { ok: false, message: "Not authorized." },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  if (!UUID.test(id)) {
    return NextResponse.json(
      { ok: false, message: "That lead id is not valid." },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "That request could not be read." },
      { status: 400 },
    );
  }

  const parsed = leadUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: firstError(parsed.error) },
      { status: 400 },
    );
  }

  const db = supabaseAdmin();

  const { data: event, error: eventError } = await db
    .from("events")
    .select("id")
    .eq("slug", serverEnv.eventSlug)
    .single();

  if (eventError || !event) {
    console.error("[lead] event lookup failed", eventError);
    return NextResponse.json(
      { ok: false, message: "Could not load the event." },
      { status: 500 },
    );
  }

  // updated_at is maintained by a trigger, so it is deliberately not set here.
  const { data, error } = await db
    .from("signups")
    .update(parsed.data)
    .eq("id", id)
    .eq("event_id", event.id)
    .select("id, status, staff_notes, updated_at")
    .maybeSingle();

  if (error) {
    console.error("[lead] update failed", error);
    return NextResponse.json(
      { ok: false, message: "Could not save that change." },
      { status: 500 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { ok: false, message: "That lead is not on this event's list." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, lead: data });
}
