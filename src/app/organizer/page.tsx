import type { Metadata } from "next";
import { BackOffice } from "@/components/BackOffice";

/**
 * Back office. The passcode gate lives in the API routes, not here — this page
 * ships no lead data in its HTML, so rendering it without a session reveals
 * nothing beyond the existence of a login form.
 */
export const metadata: Metadata = {
  title: "Back office · markilux private sale list",
  // Keep the page out of search results even though it is passcode-gated.
  robots: { index: false, follow: false, nocache: true },
};

export default function OrganizerPage() {
  return <BackOffice />;
}
