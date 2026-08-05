import { NextResponse } from "next/server";
import { hasOrganizerSession } from "@/lib/organizer-session";
import { sendTestEmail, notificationsEnabled } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whether notifications are configured at all — drives the back-office badge. */
export async function GET() {
  if (!(await hasOrganizerSession())) {
    return NextResponse.json(
      { ok: false, message: "Not authorized." },
      { status: 401 },
    );
  }
  return NextResponse.json({ ok: true, enabled: notificationsEnabled() });
}

export async function POST() {
  if (!(await hasOrganizerSession())) {
    return NextResponse.json(
      { ok: false, message: "Not authorized." },
      { status: 401 },
    );
  }

  const result = await sendTestEmail();
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
