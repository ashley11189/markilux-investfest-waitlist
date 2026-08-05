"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import type { LeadRow } from "@/app/api/organizer/leads/route";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/validation";
import { useKioskMode } from "@/lib/use-kiosk-mode";

type Tab = "leads" | "qr" | "settings";
type StatusFilter = LeadStatus | "All";

const EXPORT_COLUMNS: [keyof LeadRow, string][] = [
  ["created_at", "Signed up"],
  ["name", "Name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["role", "Role"],
  ["interests", "Interested in"],
  ["timeline", "Timeline"],
  ["location", "Location"],
  ["notes", "Their notes"],
  ["status", "Status"],
  ["staff_notes", "Internal notes"],
  ["confirmation", "Confirmation"],
];

export function BackOffice() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [passcode, setPasscode] = useState("");
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [tab, setTab] = useState<Tab>("leads");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const [kiosk, toggleKiosk] = useKioskMode();
  const passcodeRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const loadLeads = useCallback(async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/organizer/leads", {
        cache: "no-store",
      });
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
    if (authenticated === true) headingRef.current?.focus();
  }, [authenticated]);

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

  /** Optimistic: the row updates immediately and rolls back if the save fails. */
  const saveLead = useCallback(
    async (id: string, patch: { status?: LeadStatus; staff_notes?: string | null }) => {
      const previous = leads;
      setLeads((rows) =>
        rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      );
      try {
        const response = await fetch(`/api/organizer/leads/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const body = (await response.json()) as {
          ok?: boolean;
          message?: string;
        };
        if (!body.ok) {
          setLeads(previous);
          setMessage(body.message ?? "Could not save that change.");
        } else {
          setMessage(null);
        }
      } catch {
        setLeads(previous);
        setMessage("Could not save that change. Check the connection.");
      }
    },
    [leads],
  );

  const counts = useMemo(() => {
    const tally: Record<string, number> = { All: leads.length };
    for (const status of LEAD_STATUSES) tally[status] = 0;
    for (const lead of leads) tally[lead.status] = (tally[lead.status] ?? 0) + 1;
    return tally;
  }, [leads]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter !== "All" && lead.status !== statusFilter) return false;
      if (!needle) return true;
      return [
        lead.name,
        lead.email,
        lead.phone,
        lead.location,
        lead.role,
        lead.notes,
        lead.staff_notes,
        lead.confirmation,
        lead.interests.join(" "),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [leads, query, statusFilter]);

  const toCsv = (rows: LeadRow[]) =>
    [EXPORT_COLUMNS.map(([, label]) => label).join(",")]
      .concat(
        rows.map((lead) =>
          EXPORT_COLUMNS.map(([key]) => {
            const raw = lead[key];
            const value = Array.isArray(raw) ? raw.join("; ") : (raw ?? "");
            return `"${String(value).replace(/"/g, '""')}"`;
          }).join(","),
        ),
      )
      .join("\n");

  function downloadCsv() {
    const blob = new Blob([toCsv(visible)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "markilux-investfest-list.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyCsv() {
    try {
      await navigator.clipboard.writeText(toCsv(visible));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setMessage("Could not copy. Use Download CSV instead.");
    }
  }

  if (authenticated === null) {
    return (
      <main className="office">
        <p className="note">Checking access…</p>
      </main>
    );
  }

  if (authenticated === false) {
    return (
      <main className="office office-narrow">
        <p className="kick">markilux back office</p>
        <h1 className="h1" tabIndex={-1} ref={headingRef}>
          Sign in.
        </h1>
        <form onSubmit={signIn}>
          <p className="note">
            Enter the organizer passcode. It is checked on the server — no lead
            data is sent to this device without it.
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
          <div aria-live="assertive">
            {message && <p className="err">{message}</p>}
          </div>
          <button className="btn" type="submit" disabled={busy || !passcode}>
            {busy ? "Checking…" : "Unlock"}
          </button>
        </form>
        <div className="foot">
          <span>markilux USA · InvestFest 2026</span>
          <Link href="/">Back to the form</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="office">
      <div className="office-head">
        <div>
          <p className="kick">markilux back office</p>
          <h1 className="h1" tabIndex={-1} ref={headingRef}>
            Private sale list
          </h1>
        </div>
        <div className="tools">
          <button className="btn ghost" type="button" onClick={loadLeads} disabled={busy}>
            {busy ? "Loading…" : "Refresh"}
          </button>
          <button className="btn ghost" type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {(
          [
            ["leads", "Sign ups"],
            ["qr", "QR code"],
            ["settings", "Settings"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className="tab"
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div aria-live="polite">{message && <p className="err">{message}</p>}</div>

      {tab === "leads" && (
        <>
          <div className="filters">
            <div className="statbar" role="group" aria-label="Filter by status">
              {(["All", ...LEAD_STATUSES] as StatusFilter[]).map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`statpill${statusFilter === status ? " on" : ""}`}
                  aria-pressed={statusFilter === status}
                  onClick={() => setStatusFilter(status)}
                >
                  {status} <em>{counts[status] ?? 0}</em>
                </button>
              ))}
            </div>
            <div className="filter-actions">
              <label className="sr-only" htmlFor="lead-search">
                Search the list
              </label>
              <input
                className="inp"
                id="lead-search"
                type="search"
                placeholder="Search name, email, notes…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                className="btn ghost"
                type="button"
                onClick={downloadCsv}
                disabled={visible.length === 0}
              >
                Download CSV
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={copyCsv}
                disabled={visible.length === 0}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          {leads.length === 0 ? (
            <p className="note">
              No sign ups yet. They will appear here as people join, and you
              will get an email for each one.
            </p>
          ) : visible.length === 0 ? (
            <p className="note">Nothing matches that filter.</p>
          ) : (
            <div className="pane">
              <table className="tbl">
                <thead>
                  <tr>
                    <th scope="col">Signed up</th>
                    <th scope="col">Name</th>
                    <th scope="col">Contact</th>
                    <th scope="col">Role</th>
                    <th scope="col">Interested in</th>
                    <th scope="col">Timeline</th>
                    <th scope="col">Location</th>
                    <th scope="col">Their notes</th>
                    <th scope="col">Status</th>
                    <th scope="col">Internal notes</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((lead) => (
                    <LeadRowView key={lead.id} lead={lead} onSave={saveLead} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "qr" && <QrPane />}

      {tab === "settings" && (
        <SettingsPane kiosk={kiosk} onToggleKiosk={toggleKiosk} />
      )}

      <div className="foot">
        <span>markilux USA · InvestFest 2026</span>
        <Link href="/">Back to the form</Link>
      </div>
    </main>
  );
}

function LeadRowView({
  lead,
  onSave,
}: {
  lead: LeadRow;
  onSave: (
    id: string,
    patch: { status?: LeadStatus; staff_notes?: string | null },
  ) => Promise<void>;
}) {
  const saved = lead.staff_notes ?? "";
  const [draft, setDraft] = useState(saved);
  const [syncedTo, setSyncedTo] = useState(saved);

  // A Refresh replaces the row, so the box has to pick up what came back.
  // Adjusting during render rather than in an effect: React re-runs this
  // component immediately with the new value instead of painting the stale
  // one first, and it does not clobber what someone is mid-way through typing.
  if (syncedTo !== saved) {
    setSyncedTo(saved);
    setDraft(saved);
  }

  const signedUp = new Date(lead.created_at);

  return (
    <tr>
      <td className="nowrap">
        {signedUp.toLocaleDateString()}
        <br />
        <span className="dim">
          {signedUp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </td>
      <td>
        {lead.name}
        <br />
        <span className="dim">{lead.confirmation}</span>
      </td>
      <td>
        <a href={`mailto:${lead.email}`}>{lead.email}</a>
        {lead.phone && (
          <>
            <br />
            <a href={`tel:${lead.phone}`}>{lead.phone}</a>
          </>
        )}
      </td>
      <td>{lead.role}</td>
      <td>{lead.interests.join(", ")}</td>
      <td>{lead.timeline ?? ""}</td>
      <td>{lead.location ?? ""}</td>
      <td className="wrap">{lead.notes ?? ""}</td>
      <td>
        <label className="sr-only" htmlFor={`status-${lead.id}`}>
          Status for {lead.name}
        </label>
        <select
          id={`status-${lead.id}`}
          className={`sel status-${lead.status.toLowerCase().replace(/[^a-z]/g, "")}`}
          value={lead.status}
          onChange={(e) => void onSave(lead.id, { status: e.target.value as LeadStatus })}
        >
          {LEAD_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </td>
      <td>
        <label className="sr-only" htmlFor={`notes-${lead.id}`}>
          Internal notes for {lead.name}
        </label>
        <textarea
          id={`notes-${lead.id}`}
          className="inp notes-cell"
          rows={2}
          value={draft}
          placeholder="Add a note…"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const next = draft.trim();
            if (next === saved) return;
            void onSave(lead.id, { staff_notes: next });
          }}
        />
      </td>
    </tr>
  );
}

function SettingsPane({
  kiosk,
  onToggleKiosk,
}: {
  kiosk: boolean;
  onToggleKiosk: () => void;
}) {
  const [email, setEmail] = useState<{
    enabled: boolean;
    transport: string;
    to: string[];
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/organizer/test-email", { cache: "no-store" })
      .then((r) => r.json())
      .then((body: { enabled?: boolean; transport?: string; to?: string[] }) =>
        setEmail({
          enabled: Boolean(body.enabled),
          transport: body.transport ?? "none",
          to: body.to ?? [],
        }),
      )
      .catch(() => setEmail({ enabled: false, transport: "none", to: [] }));
  }, []);

  async function sendTest() {
    setSending(true);
    setResult(null);
    try {
      const response = await fetch("/api/organizer/test-email", {
        method: "POST",
      });
      const body = (await response.json()) as { message?: string };
      setResult(body.message ?? "Done.");
    } catch {
      setResult("Could not reach the server.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="pane pane-pad">
      <h2 className="sub">Kiosk mode</h2>
      <p className="note">
        Turns the public page into a booth kiosk: a welcome screen, no link to
        this back office, and an automatic reset seven seconds after each
        confirmation so the next visitor never sees the previous person&rsquo;s
        details.
      </p>
      <button className="btn ghost" type="button" onClick={onToggleKiosk}>
        Kiosk mode is {kiosk ? "on" : "off"} — turn it {kiosk ? "off" : "on"}
      </button>

      <h2 className="sub">Email notifications</h2>
      <p className="note">
        {email === null ? (
          "Checking…"
        ) : email.enabled ? (
          <>
            Sending via{" "}
            <strong>
              {email.transport === "gmail" ? "the Gmail API" : "SMTP"}
            </strong>{" "}
            to <strong>{email.to.join(", ")}</strong>. Every new signup is
            emailed there.
          </>
        ) : (
          "Not configured. Signups are still saved — you just will not be emailed. Set the GMAIL_* variables (or the SMTP_* ones) together with SIGNUP_NOTIFY_TO."
        )}
      </p>
      <button
        className="btn ghost"
        type="button"
        onClick={sendTest}
        disabled={sending || email?.enabled === false}
      >
        {sending ? "Sending…" : "Send a test email"}
      </button>
      <div aria-live="polite">{result && <p className="note">{result}</p>}</div>
    </div>
  );
}

/** QR generation is local so it works on a hostile convention-centre network. */
function QrPane() {
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
    <div className="pane pane-pad">
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
          <img
            src={dataUrl}
            alt={`QR code linking to ${url}`}
            width={260}
            height={260}
          />
        </div>
      )}
    </div>
  );
}
