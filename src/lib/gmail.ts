import "server-only";
import { gmailConfig, type GmailConfig } from "@/lib/env";

/**
 * Gmail API sender.
 *
 * Deliberately built on fetch rather than googleapis: this runs in a serverless
 * function that cold-starts on every booth signup, and the official client
 * pulls in a large dependency tree to do what two HTTP calls do here.
 *
 * Auth is a long-lived OAuth refresh token exchanged for a short-lived access
 * token. Minted once with scripts/gmail-auth.mjs — see DEPLOYMENT.md.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL =
  "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

/**
 * Timeouts must sum to less than the route's maxDuration in vercel.json
 * (10s), including the database work that already happened before after()
 * runs. If they exceed it the platform kills the function mid-send and the
 * notification vanishes with no error logged anywhere.
 */
const TOKEN_TIMEOUT_MS = 3000;
const SEND_TIMEOUT_MS = 4000;

/** Cached across invocations on a warm function; refreshed a minute early. */
let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(config: GmailConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS),
  });

  const body = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !body.access_token) {
    throw new Error(
      `Gmail token refresh failed: ${body.error_description ?? body.error ?? response.status}`,
    );
  }

  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(0, (body.expires_in ?? 3600) - 60) * 1000,
  };
  return cachedToken.value;
}

const base64url = (input: string) =>
  Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const encodedWord = (value: string) =>
  `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;

/**
 * RFC 2047 for anything outside printable ASCII. A name like "José" in a
 * Subject is otherwise mangled by the receiving client.
 *
 * Encoding anything non-printable is also what stops CR/LF header injection:
 * a name containing a newline fails this test and is base64'd. Do not widen
 * the accepted range without re-checking that.
 */
function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return encodedWord(value);
}

/**
 * A display name in an address header.
 *
 * Stricter than encodeHeader on purpose. `<`, `>`, `,`, `;`, `:` and `"` are
 * all printable ASCII, so encodeHeader passes them through — and a visitor
 * calling themselves `Bob <ops@attacker.tld>, X` then turns
 *   Reply-To: <name> <visitor@example.com>
 * into a two-recipient header. Staff hitting Reply would send the private-sale
 * details, and the quoted lead, to the attacker. Anything outside a plain
 * name alphabet is encoded, which makes it a single opaque token.
 */
function phrase(value: string): string {
  return /^[A-Za-z0-9 .'\-()]*$/.test(value) ? value : encodedWord(value);
}

function address(name: string, email: string): string {
  return `${phrase(name)} <${email}>`;
}

export interface GmailMessage {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  replyToName?: string;
  replyToEmail?: string;
}

function buildMime(config: GmailConfig, message: GmailMessage): string {
  const boundary = `mkx_${base64url(String(message.subject.length)).slice(0, 8)}_boundary`;
  const headers = [
    `From: ${address(config.senderName, config.sender)}`,
    `To: ${message.to.join(", ")}`,
    `Subject: ${encodeHeader(message.subject)}`,
    "MIME-Version: 1.0",
  ];

  if (message.replyToEmail) {
    headers.push(
      `Reply-To: ${address(message.replyToName ?? message.replyToEmail, message.replyToEmail)}`,
    );
  }

  if (!message.html) {
    headers.push('Content-Type: text/plain; charset="UTF-8"', "", message.text);
    return headers.join("\r\n");
  }

  headers.push(
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    message.text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "",
    message.html,
    "",
    `--${boundary}--`,
  );

  return headers.join("\r\n");
}

export async function sendViaGmail(message: GmailMessage): Promise<void> {
  const config = gmailConfig();
  if (!config) throw new Error("Gmail is not configured.");

  const token = await accessToken(config);

  const response = await fetch(SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: base64url(buildMime(config, message)) }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // A stale access token should not poison the next attempt.
    if (response.status === 401) cachedToken = null;
    throw new Error(
      `Gmail send failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }
}
