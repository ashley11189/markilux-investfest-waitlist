import { z } from "zod";

/**
 * Single source of truth for what a valid waitlist signup looks like.
 *
 * The client imports this for instant feedback; the API route re-parses every
 * request with the exact same schema, because client-side validation is a
 * courtesy to the user and nothing more.
 */

export const ROLES = [
  "Property owner",
  "Contractor or builder",
  "Designer or architect",
] as const;

export const INTERESTS = ["markilux 1600", "Other product lines"] as const;

export const TIMELINES = ["Ready now", "Next 90 days", "Later this year"] as const;

/** Follow-up state, owned by staff. Mirrors the lead_status enum. */
export const LEAD_STATUSES = [
  "New",
  "Contacted",
  "Follow-up",
  "Closed",
] as const;

export type Role = (typeof ROLES)[number];
export type Interest = (typeof INTERESTS)[number];
export type Timeline = (typeof TIMELINES)[number];
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Trim, then treat an empty string as "not provided". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null);

export const signupSchema = z.object({
  // The message is set on the base type too, so a missing field reads the same
  // as an empty one instead of leaking "expected string, received undefined".
  name: z
    .string({ message: "Add a name to continue." })
    .trim()
    .min(1, "Add a name to continue.")
    .max(120, "That name is too long."),

  email: z
    .string({ message: "Check the email address." })
    .trim()
    .min(1, "Check the email address.")
    .max(254, "That email address is too long.")
    .toLowerCase()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Check the email address."),

  phone: optionalText(40),
  location: optionalText(120),
  notes: optionalText(1000),

  role: z.enum(ROLES, { message: "Pick the one that fits best." }),

  interests: z.array(z.enum(INTERESTS)).max(INTERESTS.length).default([]),

  timeline: z.enum(TIMELINES).nullable().default(null),

  consent: z.literal(true, {
    message: "Check the box so we can send the private sale details.",
  }),

  /**
   * Bot trap. A real browser never fills this — it is off-screen and unlabeled.
   *
   * Deliberately unconstrained: rejecting a filled honeypot here would return a
   * 400 naming the field, which tells a bot exactly which input to leave alone.
   * The API route accepts it and answers with a plausible success instead.
   */
  company: z.string().max(200).optional().default(""),

  /** Milliseconds the form was on screen before submit. Humans take a while. */
  elapsedMs: z.number().int().nonnegative().optional(),
});

export type SignupInput = z.input<typeof signupSchema>;
export type SignupPayload = z.output<typeof signupSchema>;

/**
 * A staff edit from the back office. Both fields are optional so the UI can
 * save a status flip without also resubmitting the notes, but at least one
 * must be present — an empty patch is a bug, not a no-op worth writing.
 */
export const leadUpdateSchema = z
  .object({
    status: z.enum(LEAD_STATUSES).optional(),
    staff_notes: z
      .string()
      .trim()
      .max(2000, "Keep notes under 2000 characters.")
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
  })
  .refine((v) => v.status !== undefined || v.staff_notes !== undefined, {
    message: "Nothing to update.",
  });

export type LeadUpdate = z.output<typeof leadUpdateSchema>;

/** Anything faster than this is a script, not a person filling in six fields. */
export const MIN_FILL_MS = 2000;

/**
 * Flattens a ZodError into `{ field: message }`, keeping only the first message
 * per field so the UI can show one error per input.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/** The first human-readable message, for the single error banner. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Something did not look right. Try again.";
}
