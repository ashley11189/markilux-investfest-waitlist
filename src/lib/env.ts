import "server-only";

/**
 * Server-side environment access.
 *
 * Deliberately lazy: reading these at module scope would break `next build`
 * on a machine that has no secrets, and would turn a missing variable into an
 * opaque build failure instead of a clear runtime error.
 */

class MissingEnvError extends Error {
  constructor(key: string) {
    super(
      `Missing required environment variable: ${key}. ` +
        `See .env.example and DEPLOYMENT.md.`,
    );
    this.name = "MissingEnvError";
  }
}

function required(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === "") throw new MissingEnvError(key);
  return value.trim();
}

export const serverEnv = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  /** Salt for hashing client IPs. Rotating it resets rate-limit history. */
  get ipSalt() {
    return required("SIGNUP_IP_SALT");
  },
  /** What booth staff type to open the organizer panel. */
  get organizerPasscode() {
    return required("ORGANIZER_PASSCODE");
  },
  /** Signs the organizer session cookie. Must be >= 32 chars. */
  get organizerSessionSecret() {
    const secret = required("ORGANIZER_SESSION_SECRET");
    if (secret.length < 32) {
      throw new Error(
        "ORGANIZER_SESSION_SECRET must be at least 32 characters. " +
          "Generate one with: openssl rand -base64 32",
      );
    }
    return secret;
  },
  get eventSlug() {
    return process.env.NEXT_PUBLIC_EVENT_SLUG?.trim() || "investfest-2026";
  },
};

/** Reports which required variables are absent, for a health check. */
export function missingEnvKeys(): string[] {
  const keys = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SIGNUP_IP_SALT",
    "ORGANIZER_PASSCODE",
    "ORGANIZER_SESSION_SECRET",
  ];
  return keys.filter((k) => !process.env[k]?.trim());
}
