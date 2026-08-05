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

/** Who gets told about a new signup. Shared by every transport. */
export function notifyRecipients(): string[] {
  return (process.env.SIGNUP_NOTIFY_TO ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** The mailbox the refresh token belongs to; Gmail sends as this address. */
  sender: string;
  senderName: string;
  to: string[];
}

/**
 * Gmail API credentials. Returns null unless the whole set is present, so a
 * half-finished setup falls through to SMTP rather than failing at send time.
 */
export function gmailConfig(): GmailConfig | null {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();
  const sender = process.env.GMAIL_SENDER?.trim();
  const to = notifyRecipients();

  if (!clientId || !clientSecret || !refreshToken || !sender || to.length === 0)
    return null;

  return {
    clientId,
    clientSecret,
    refreshToken,
    sender,
    senderName: process.env.GMAIL_SENDER_NAME?.trim() || "markilux private sale",
    to,
  };
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  to: string[];
}

/**
 * SMTP settings for the new-signup notification.
 *
 * Returns null when the mailbox is not configured, and the signup route treats
 * that as "notifications are off". Notifying somebody is strictly less
 * important than capturing the lead, so an unset — or misconfigured — mailbox
 * must never be able to fail a submission at the booth.
 */
export function smtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD;
  const to = notifyRecipients();

  if (!host || !user || !password || to.length === 0) return null;

  // 465 is implicit TLS; 587 and 25 start plaintext and upgrade via STARTTLS.
  const port = Number(process.env.SMTP_PORT?.trim() || 587);
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE.trim() === "true"
    : port === 465;

  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    user,
    password,
    from: process.env.SMTP_FROM?.trim() || user,
    to,
  };
}

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
