"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { LeadRow } from "@/app/api/organizer/leads/route";

interface Props {
  kiosk: boolean;
  onToggleKiosk: () => void;
  onClose: () => void;
}

type Tab = "list" | "qr";

const COLUMNS: [keyof LeadRow, string][] = [
  ["created_at", "Signed up"],
  ["name", "Name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["role", "Role"],
  ["interests", "Interested in"],
  ["timeline", "Timeline"],
  ["location", "Location"],
  ["notes", "Notes"],
  ["confirmation", "Confirmation"],
];

export function OrganizerPanel({ kiosk, onToggleKiosk, onClose }: Props) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [passcode, setPasscode] = useState("");
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [tab, setTab] = useState<Tab>("list");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const passcodeRef = useRef<HTMLInputElement>(null);

  const loadLeads = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/organizer/leads", { cache: "no-store" });
      if (response.status === 401) {
        setAuthenticated(false);
        return;
      }
      const body = (await response.json()) as {
        ok?: boolean;
        leads?: LeadRow[];
        message?: string;
      };
      if (body.ok && body.leads) {
        setLeads(body.leads);
        setMessage(null);
      } else {
        setMessage(body.message ?? "Could not load the list.");
      }
    } catch {
      setMessage("Could not reach the server. Check the connection.");
    } finally {
      setBusy(false);
    }
  }, []);

  // Ask the server whether this device already holds a valid session.
  useEffect(() => {
    let live = true;
    fetch("/api/organizer/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((body: { authenticated?: boolean }) => {
        if (!live) return;
        const ok = Boolean(body.authenticated);
        setAuthenticated(ok);
        if (ok) void loadLeads();
      })
      .catch(() => live && setAuthenticated(false));
    return () => {
      live = false;
    };
  }, [loadLeads]);

  useEffect(() => {
    if (authenticated === false) passcodeRef.current?.focus();
  }, [authenticated]);

  // Escape closes; Tab is trapped inside the dialog.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/organizer/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        message?: string;
      };
      if (body.ok) {
        setPasscode("");
        setAuthenticated(true);
        await loadLeads();
      } else {
        setMessage(body.message ?? "That code is not right.");
      }
    } catch {
      setMessage("Could not reach the server. Check the connection.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/organizer/session", { method: "DELETE" });
    setAuthenticated(false);
    setLeads([]);
  }

  const toCsv = () =>
    [COLUMNS.map(([, label]) => label).join(",")]
      .concat(
        leads.map((lead) =>
          COLUMNS.map(([key]) => {
            const raw = lead[key];
            const value = Array.isArray(raw) ? raw.join("; ") : (raw ?? "");
            return `"${String(value).replace(/"/g, '""')}"`;
          }).join(","),
        ),
      )
      .join("\n");

  function downloadCsv() {
    const blob = new Blob([toCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "markilux-investfest-list.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyCsv() {
    try {
      await navigator.clipboard.writeText(toCsv());
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setMessage("Could not copy. Use Download CSV instead.");
    }
  }

  return (
    <div
      className="admin"
      role="dialog"
      aria-modal="true"
      aria-label="Organizer panel"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="admin-card" ref={dialogRef}>
        <div className="admin-head">
          <h3>
            Private sale list{" "}
            {authenticated && leads.length > 0 && <em>({leads.length})</em>}
          </h3>
          <div className="tools">
            {authenticated && (
              <>
                <button className="btn ghost" type="button" onClick={onToggleKiosk}>
                  Kiosk mode {kiosk ? "on" : "off"}
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={downloadCsv}
                  disabled={leads.length === 0}
                >
                  Download CSV
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={copyCsv}
                  disabled={leads.length === 0}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={loadLeads}
                  disabled={busy}
                >
                  {busy ? "Loading…" : "Refresh"}
                </button>
                <button className="btn ghost" type="button" onClick={signOut}>
                  Sign out
                </button>
              </>
            )}
            <button className="btn ghost" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {authenticated === null && <p className="note">Checking access…</p>}

        {authenticated === false && (
          <form onSubmit={signIn}>
            <p className="note">
              Enter the organizer passcode. It is set on the server — the list
              is never sent to this device without it.
            </p>
            <div className="field" style={{ marginTop: "var(--half)" }}>
              <label className="lbl" htmlFor="organizer-passcode">
                Organizer passcode
              </label>
              <input
                className="inp"
                id="organizer-passcode"
                ref={passcodeRef}
                type="password"
                autoComplete="current-password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
              />
            </div>
            <div aria-live="polite">
              {message && <p className="err">{message}</p>}
            </div>
            <button className="btn" type="submit" disabled={busy || !passcode}>
              {busy ? "Checking…" : "Unlock"}
            </button>
          </form>
        )}

        {authenticated === true && (
          <>
            <div className="tabs" role="tablist">
              <button
                className="tab"
                type="button"
                role="tab"
                aria-selected={tab === "list"}
                onClick={() => setTab("list")}
              >
                Sign ups
              </button>
              <button
                className="tab"
                type="button"
                role="tab"
                aria-selected={tab === "qr"}
                onClick={() => setTab("qr")}
              >
                QR code
              </button>
            </div>

            <div aria-live="polite">
              {message && <p className="err">{message}</p>}
            </div>

            {tab === "list" && (
              <div className="pane">
                {leads.length === 0 ? (
                  <p className="note">
                    No sign ups yet. They will show up here as people join.
                  </p>
                ) : (
                  <table className="tbl">
                    <thead>
                      <tr>
                        {COLUMNS.map(([key, label]) => (
                          <th key={key} scope="col">
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((lead) => (
                        <tr key={lead.confirmation}>
                          {COLUMNS.map(([key]) => (
                            <td key={key}>{formatCell(lead, key)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {tab === "qr" && <QrPane />}
          </>
        )}
      </div>
    </div>
  );
}

function formatCell(lead: LeadRow, key: keyof LeadRow): string {
  const raw = lead[key];
  if (key === "created_at" && typeof raw === "string") {
    const date = new Date(raw);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }
  if (Array.isArray(raw)) return raw.join("; ");
  return raw ?? "";
}

/**
 * QR generation is local — the export loaded qrcodejs from a CDN, which is the
 * one thing you cannot rely on at a convention centre.
 */
function QrPane() {
  // Lazy initializer rather than an effect: this pane only ever mounts after
  // an organizer signs in, so there is no server render to disagree with.
  const [url, setUrl] = useState(() =>
    typeof window === "undefined" ? "" : window.location.origin,
  );
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    if (!url.trim()) {
      setError("Paste the link first.");
      setDataUrl(null);
      return;
    }
    try {
      setDataUrl(
        await QRCode.toDataURL(url.trim(), {
          width: 260,
          margin: 1,
          color: { dark: "#201e1d", light: "#f3f2f2" },
        }),
      );
    } catch {
      setError("That link could not be encoded.");
      setDataUrl(null);
    }
  }

  return (
    <div className="pane">
      <p className="note">
        Print or display this code at the booth so people can sign up on their
        own phone.
      </p>
      <div className="field" style={{ marginTop: "var(--half)" }}>
        <label className="lbl" htmlFor="qr-url">
          Page link
        </label>
        <input
          className="inp"
          id="qr-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
        />
      </div>
      <button className="btn ghost" type="button" onClick={generate}>
        Make QR code
      </button>
      <div aria-live="polite">{error && <p className="err">{error}</p>}</div>
      {dataUrl && (
        <div className="qr-box">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={dataUrl} alt={`QR code linking to ${url}`} width={260} height={260} />
        </div>
      )}
    </div>
  );
}
