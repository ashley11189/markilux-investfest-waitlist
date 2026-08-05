import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { smtpConfig } from "@/lib/env";
import type { SignupPayload } from "@/lib/validation";

/**
 * New-signup notification.
 *
 * Every function here swallows its own failures. A booth signup that reached
 * the database is a success even if the mail server is unreachable, so nothing
 * in this file is allowed to throw into the request path.
 */

let cached: Transporter | null = null;

function transport(): Transporter | null {
  if (cached) return cached;
  const config = smtpConfig();
  if (!config) return null;

  cached = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.password },
    // A conference network is the wrong place to hang a request on a slow
    // handshake; give up quickly and let the signup finish regardless.
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 8000,
  });

  return cached;
}

export function notificationsEnabled(): boolean {
  return smtpConfig() !== null;
}

interface NewSignupEmail {
  signup: SignupPayload;
  confirmation: string;
  eventName: string;
  source: "web" | "kiosk";
  organizerUrl: string;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function rows(details: [string, string][]): string {
  return details
    .map(
      ([label, value]) =>
        `<tr>
           <td style="padding:6px 16px 6px 0;color:#6b6664;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td>
           <td style="padding:6px 0;color:#201e1d">${escapeHtml(value)}</td>
         </tr>`,
    )
    .join("");
}

function buildDetails({
  signup,
  confirmation,
  source,
}: NewSignupEmail): [string, string][] {
  const details: [string, string][] = [
    ["Name", signup.name],
    ["Email", signup.email],
  ];
  if (signup.phone) details.push(["Phone", signup.phone]);
  details.push(["Role", signup.role]);
  if (signup.interests.length)
    details.push(["Interested in", signup.interests.join(", ")]);
  if (signup.timeline) details.push(["Timeline", signup.timeline]);
  if (signup.location) details.push(["Location", signup.location]);
  if (signup.notes) details.push(["Their notes", signup.notes]);
  details.push(["Confirmation", confirmation]);
  details.push(["Signed up on", source === "kiosk" ? "Booth iPad" : "Own device"]);
  return details;
}

/**
 * Fire-and-forget. Callers should NOT await this before responding — the
 * visitor is standing at the booth waiting for a confirmation screen.
 */
export async function sendNewSignupEmail(input: NewSignupEmail): Promise<void> {
  const mailer = transport();
  const config = smtpConfig();
  if (!mailer || !config) return;

  const details = buildDetails(input);
  const { signup, eventName, organizerUrl } = input;

  const text = [
    `New ${eventName} private sale signup`,
    "",
    ...details.map(([label, value]) => `${label}: ${value}`),
    "",
    `Open the back office: ${organizerUrl}`,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f3f2f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e3e0de;padding:28px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#c8102e">${escapeHtml(eventName)}</p>
    <h1 style="margin:0 0 20px;font-size:20px;color:#201e1d">New private sale signup</h1>
    <table style="border-collapse:collapse;font-size:14px;line-height:1.5;width:100%">${rows(details)}</table>
    <p style="margin:24px 0 0">
      <a href="${escapeHtml(organizerUrl)}" style="display:inline-block;background:#201e1d;color:#fff;text-decoration:none;padding:10px 18px;font-size:14px">Open the back office</a>
    </p>
  </div>
</body></html>`;

  try {
    await mailer.sendMail({
      from: config.from,
      to: config.to,
      // Replying goes straight to the person who signed up.
      replyTo: `${signup.name} <${signup.email}>`,
      subject: `New signup — ${signup.name} (${signup.role})`,
      text,
      html,
    });
  } catch (error) {
    console.error("[notify] could not send signup email", error);
  }
}

/** Used by the back office to prove the mailbox works before the event. */
export async function sendTestEmail(): Promise<{ ok: boolean; message: string }> {
  const mailer = transport();
  const config = smtpConfig();
  if (!mailer || !config) {
    return {
      ok: false,
      message:
        "Email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD and SIGNUP_NOTIFY_TO.",
    };
  }

  try {
    await mailer.verify();
    await mailer.sendMail({
      from: config.from,
      to: config.to,
      subject: "markilux waitlist — test notification",
      text:
        "This is a test from the markilux private sale waitlist back office.\n" +
        "If you are reading it, new signup notifications will reach you.",
    });
    return { ok: true, message: `Test email sent to ${config.to.join(", ")}.` };
  } catch (error) {
    console.error("[notify] test email failed", error);
    return {
      ok: false,
      message:
        error instanceof Error
          ? `Could not send: ${error.message}`
          : "Could not send the test email.",
    };
  }
}
