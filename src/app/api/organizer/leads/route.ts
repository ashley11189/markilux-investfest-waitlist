import { NextResponse } from "next/server";
import { hasOrganizerSession } from "@/lib/organizer-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface LeadRow {
  created_at: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  interests: string[];
  timeline: string | null;
  location: string | null;
  notes: string | null;
  confirmation: string;
}

/**
 * Every lead for the current event. Gated on the signed organizer cookie —
 * without it this returns 401 and no data is assembled at all.
 */
export async function GET() {
  if (!(await hasOrganizerSession())) {
    return NextResponse.json(
      { ok: false, message: "Not authorized." },
      { status: 401 },
    );
  }

  const db = supabaseAdmin();

  const { data: event, error: eventError } = await db
    .from("events")
    .select("id, name")
    .eq("slug", serverEnv.eventSlug)
    .single();

  if (eventError || !event) {
    console.error("[leads] event lookup failed", eventError);
    return NextResponse.json(
      { ok: false, message: "Could not load the event." },
      { status: 500 },
    );
  }

  const { data, error } = await db
    .from("signups")
    .select(
      "created_at, name, email, phone, role, interests, timeline, location, notes, confirmation",
    )
    .eq("event_id", event.id)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    console.error("[leads] query failed", error);
    return NextResponse.json(
      { ok: false, message: "Could not load the list." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    event: event.name,
    count: data?.length ?? 0,
    leads: (data ?? []) as LeadRow[],
  });
}
