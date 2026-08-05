#!/usr/bin/env node
/**
 * One-shot Gmail OAuth helper.
 *
 * Exchanges a Google OAuth client for the long-lived refresh token the app
 * uses to send signup notifications. Run it once, paste the output into
 * .env.local and Vercel, and you never need it again.
 *
 *   node scripts/gmail-auth.mjs
 *
 * Prerequisites, all in the Google Cloud console for the project that owns
 * the mailbox:
 *   1. APIs & Services → Library → enable "Gmail API"
 *   2. APIs & Services → Credentials → Create credentials → OAuth client ID
 *   3. Put the client id and secret in .env.local as GMAIL_CLIENT_ID and
 *      GMAIL_CLIENT_SECRET (or export them before running this).
 *
 * Uses a loopback redirect so no code has to be pasted between windows.
 *
 * A "Desktop app" client accepts loopback automatically. A "Web application"
 * client does NOT — you must add the exact redirect URI this script prints to
 * the client's "Authorized redirect URIs" list, or Google answers
 * redirect_uri_mismatch. Override the port with GMAIL_REDIRECT_PORT if 53682
 * is taken.
 */

import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Only the ability to send. Not read, not modify, not delete. */
const SCOPE = "https://www.googleapis.com/auth/gmail.send";
const PORT = Number(process.env.GMAIL_REDIRECT_PORT || 53682);
const REDIRECT = `http://127.0.0.1:${PORT}`;

/**
 * Write the minted values straight into .env.local. Printing them and asking
 * for a copy/paste is where this process goes wrong — a truncated refresh
 * token fails much later, at send time, with an opaque error.
 */
function writeEnvFile(values) {
  const path = join(ROOT, ".env.local");
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    /* first run; create it */
  }

  for (const [key, value] of Object.entries(values)) {
    if (!value) continue;
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    text = pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}`;
  }

  writeFileSync(path, `${text.trimEnd()}\n`, { mode: 0o600 });
  return path;
}

function fromEnvFile(key) {
  try {
    const file = readFileSync(join(ROOT, ".env.local"), "utf8");
    const line = file
      .split("\n")
      .find((l) => l.startsWith(`${key}=`) && !l.trim().startsWith("#"));
    return line ? line.slice(key.length + 1).trim() : "";
  } catch {
    return "";
  }
}

const clientId = process.env.GMAIL_CLIENT_ID || fromEnvFile("GMAIL_CLIENT_ID");
const clientSecret =
  process.env.GMAIL_CLIENT_SECRET || fromEnvFile("GMAIL_CLIENT_SECRET");

if (!clientId || !clientSecret) {
  console.error(
    "\nMissing credentials.\n\n" +
      "Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env.local (or export\n" +
      "them), then run this again. See the header of this file for how to\n" +
      "create them in the Google Cloud console.\n",
  );
  process.exit(1);
}

const state = randomBytes(16).toString("hex");

const authUrl =
  "https://accounts.google.com/o/oauth2/v2/auth?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: SCOPE,
    // offline + consent is what actually returns a refresh token; without
    // prompt=consent Google omits it on any authorisation after the first.
    access_type: "offline",
    prompt: "consent",
    state,
  });

const page = (title, body) =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
  `<body style="font-family:system-ui;padding:48px;max-width:640px;margin:0 auto">` +
  `<h1 style="font-size:20px">${title}</h1><p>${body}</p></body>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT);
  if (url.pathname !== "/") {
    res.writeHead(404).end();
    return;
  }

  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");

  if (error || !code) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(page("Authorisation failed", error ?? "No code was returned."));
    console.error(`\nAuthorisation failed: ${error ?? "no code returned"}\n`);
    if (error === "redirect_uri_mismatch") {
      console.error(
        "This client does not accept the loopback redirect. In the Google\n" +
          "Cloud console open the OAuth client and add EXACTLY this under\n" +
          `"Authorized redirect URIs":\n\n    ${REDIRECT}\n\n` +
          "Save, wait a few seconds, then run this again.\n",
      );
    }
    server.close();
    process.exit(1);
  }

  if (url.searchParams.get("state") !== state) {
    res.writeHead(400, { "Content-Type": "text/html" });
    res.end(page("Authorisation failed", "State mismatch."));
    console.error("\nState mismatch — start over.\n");
    server.close();
    process.exit(1);
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT,
        grant_type: "authorization_code",
      }),
    });

    const body = await response.json();

    if (!response.ok || !body.refresh_token) {
      res.writeHead(400, { "Content-Type": "text/html" });
      res.end(page("No refresh token", "Check the terminal."));
      console.error("\nToken exchange failed:\n", body, "\n");
      server.close();
      process.exit(1);
    }

    // Ask Gmail which mailbox this actually authorised, so the value written
    // into GMAIL_SENDER is the real one rather than whatever was assumed.
    let sender = "";
    try {
      const profile = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        { headers: { Authorization: `Bearer ${body.access_token}` } },
      );
      if (profile.ok) sender = (await profile.json()).emailAddress ?? "";
    } catch {
      /* non-fatal */
    }

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      page(
        "Authorised",
        "You can close this tab and return to the terminal.",
      ),
    );

    const written = writeEnvFile({
      GMAIL_REFRESH_TOKEN: body.refresh_token,
      GMAIL_SENDER: sender,
    });

    console.log("\n─────────────────────────────────────────────────────────");
    console.log(`Saved to ${written}:\n`);
    console.log(`  GMAIL_REFRESH_TOKEN  (${body.refresh_token.length} chars)`);
    if (sender) console.log(`  GMAIL_SENDER         ${sender}`);
    console.log("─────────────────────────────────────────────────────────");
    console.log(
      "\nThe refresh token is secret — it can send mail as that mailbox\n" +
        "until you revoke it at myaccount.google.com/permissions.\n" +
        "Copy both to Vercel next; see DEPLOYMENT.md.\n",
    );

    server.close();
    process.exit(0);
  } catch (err) {
    console.error("\nToken exchange error:", err, "\n");
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `\nIf this is a "Web application" client, it must already list\n` +
      `    ${REDIRECT}\n` +
      `under "Authorized redirect URIs". Desktop clients need nothing.\n`,
  );
  console.log("Authorise the app by opening this URL:\n");
  console.log(authUrl);
  console.log(
    `\nSign in as the mailbox that should SEND the notifications.` +
      `\nWaiting on ${REDIRECT} …\n`,
  );
});
