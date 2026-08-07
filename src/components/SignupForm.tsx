"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ROLES,
  INTERESTS,
  TIMELINES,
  signupSchema,
  fieldErrors,
  firstError,
  type Role,
  type Interest,
  type Timeline,
} from "@/lib/validation";

export interface SignupSuccess {
  name: string;
  confirmation: string | null;
  duplicate: boolean;
}

interface Props {
  kiosk: boolean;
  onSuccess: (result: SignupSuccess) => void;
}

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  location: "",
  hoa_community: "",
  notes: "",
};

export function SignupForm({ kiosk, onSuccess }: Props) {
  const [text, setText] = useState(EMPTY);
  const [role, setRole] = useState<Role | null>(null);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Time-on-form is one of the cheapest bot signals available. Stamped in an
  // effect rather than during render, which must stay pure.
  const mountedAt = useRef<number | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);

  const ids = useId();
  const fid = (n: string) => `${ids}-${n}`;

  const set = (key: keyof typeof EMPTY) => (value: string) => {
    setText((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const toggleInterest = (value: Interest) =>
    setInterests((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );

  function showFailure(message: string, fields?: Record<string, string>) {
    setBanner(message);
    if (fields) setErrors(fields);
    // Move focus to the message so it is announced and reachable, rather than
    // silently appearing above a form the user has already scrolled past.
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setBanner(null);
    setErrors({});

    const payload = {
      ...text,
      role,
      interests,
      timeline,
      consent,
      mkxRef: honeypot,
      elapsedMs:
        mountedAt.current === null ? undefined : Date.now() - mountedAt.current,
    };

    const parsed = signupSchema.safeParse(payload);
    if (!parsed.success) {
      showFailure(firstError(parsed.error), fieldErrors(parsed.error));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(kiosk ? { "x-mkx-kiosk": "1" } : {}),
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        fields?: Record<string, string>;
        name?: string;
        confirmation?: string | null;
        duplicate?: boolean;
      } | null;

      if (!response.ok || !result?.ok) {
        showFailure(
          result?.message ??
            "We could not save that just now. Please try again.",
          result?.fields,
        );
        return;
      }

      onSuccess({
        name: result.name ?? parsed.data.name,
        confirmation: result.confirmation ?? null,
        duplicate: Boolean(result.duplicate),
      });

      setText(EMPTY);
      setRole(null);
      setInterests([]);
      setTimeline(null);
      setConsent(false);
      // Also cleared: if anything ever does populate the trap, leaving it set
      // would silently discard every later signup from this device too.
      setHoneypot("");
      mountedAt.current = Date.now();
    } catch {
      // Network failure. Unlike the export, we never claim success we can't
      // confirm — the visitor is told plainly so staff can re-take the details.
      showFailure(
        "That did not reach us — check the connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const describedBy = (key: string) =>
    errors[key] ? `${fid(key)}-error` : undefined;

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div aria-live="assertive" aria-atomic="true">
        {banner && (
          <div className="err" ref={errorRef} tabIndex={-1} role="alert">
            {banner}
          </div>
        )}
      </div>

      <div className="field">
        <label className="lbl" htmlFor={fid("name")}>
          Name<i aria-hidden="true">*</i>
          <span className="sr-only"> (required)</span>
        </label>
        <input
          className="inp"
          id={fid("name")}
          name="name"
          type="text"
          autoComplete="name"
          placeholder="First and last"
          value={text.name}
          onChange={(e) => set("name")(e.target.value)}
          required
          aria-required="true"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={describedBy("name")}
        />
        <FieldError id={`${fid("name")}-error`} message={errors.name} />
      </div>

      <div className="field">
        <label className="lbl" htmlFor={fid("email")}>
          Email<i aria-hidden="true">*</i>
          <span className="sr-only"> (required)</span>
        </label>
        <input
          className="inp"
          id={fid("email")}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="you@email.com"
          value={text.email}
          onChange={(e) => set("email")(e.target.value)}
          required
          aria-required="true"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={describedBy("email")}
        />
        <FieldError id={`${fid("email")}-error`} message={errors.email} />
      </div>

      <div className="row2">
        <div className="field">
          <label className="lbl" htmlFor={fid("phone")}>
            Phone
          </label>
          <input
            className="inp"
            id={fid("phone")}
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(404) 555 0148"
            value={text.phone}
            onChange={(e) => set("phone")(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="lbl" htmlFor={fid("location")}>
            City and state
          </label>
          <input
            className="inp"
            id={fid("location")}
            name="location"
            type="text"
            autoComplete="address-level2"
            placeholder="Atlanta, GA"
            value={text.location}
            onChange={(e) => set("location")(e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label className="lbl" htmlFor={fid("hoa_community")}>
          Subdivision or HOA community
        </label>
        <input
          className="inp"
          id={fid("hoa_community")}
          name="hoa_community"
          type="text"
          autoComplete="off"
          placeholder="Skip if your property is not in one"
          aria-describedby={`${fid("hoa_community")}-hint`}
          value={text.hoa_community}
          onChange={(e) => set("hoa_community")(e.target.value)}
        />
        <p className="hint" id={`${fid("hoa_community")}-hint`}>
          For architectural approval purposes only.
        </p>
      </div>

      <p className="legend">Tell us where you fit</p>

      <fieldset
        className="field"
        aria-describedby={errors.role ? `${fid("role")}-error` : undefined}
      >
        <legend className="lbl">
          You are<i aria-hidden="true">*</i>
          <span className="sr-only"> (required)</span>
        </legend>
        <div className="chips">
          {ROLES.map((value) => (
            <label className="chip" key={value}>
              <input
                type="radio"
                name="role"
                value={value}
                required
                checked={role === value}
                onChange={() => {
                  setRole(value);
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next.role;
                    return next;
                  });
                }}
              />
              <span>{value}</span>
            </label>
          ))}
        </div>
        <FieldError id={`${fid("role")}-error`} message={errors.role} />
      </fieldset>

      <fieldset className="field">
        <legend className="lbl">Would you be interested in</legend>
        <div className="chips">
          {INTERESTS.map((value) => (
            <label className="chip" key={value}>
              <input
                type="checkbox"
                name="interests"
                value={value}
                checked={interests.includes(value)}
                onChange={() => toggleInterest(value)}
              />
              <span>
                {value === "markilux 1600"
                  ? "The markilux 1600"
                  : "Our other product lines"}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend className="lbl">Timeline</legend>
        <div className="chips">
          {TIMELINES.map((value) => (
            <label className="chip" key={value}>
              <input
                type="radio"
                name="timeline"
                value={value}
                checked={timeline === value}
                onChange={() => setTimeline(value)}
              />
              <span>{value}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label className="lbl" htmlFor={fid("notes")}>
          Notes
        </label>
        <input
          className="inp"
          id={fid("notes")}
          name="notes"
          type="text"
          placeholder="Optional. What you talked about at the booth."
          value={text.notes}
          onChange={(e) => set("notes")(e.target.value)}
        />
      </div>

      {/* Honeypot. Hidden from people and from screen readers; bots fill it.
          The name is deliberately meaningless: called "company" it was being
          filled by iOS/Chrome contact autofill and by password managers, which
          silently discarded real signups. data-1p-ignore / data-lpignore ask
          1Password and LastPass to skip it as well. */}
      <div className="hp" aria-hidden="true">
        <label htmlFor={fid("mkxRef")}>Leave this field empty</label>
        <input
          id={fid("mkxRef")}
          name="mkxRef"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <label className="consent" htmlFor={fid("consent")}>
        <input
          id={fid("consent")}
          name="consent"
          type="checkbox"
          checked={consent}
          onChange={(e) => {
            setConsent(e.target.checked);
            setErrors((prev) => {
              const next = { ...prev };
              delete next.consent;
              return next;
            });
          }}
          required
          aria-required="true"
          aria-invalid={Boolean(errors.consent)}
        />
        <span>
          Send me private sale pricing and dates by email. I can unsubscribe any
          time.
        </span>
      </label>

      <button className="btn" type="submit" disabled={submitting}>
        {submitting ? "Saving…" : "Join the list"}
      </button>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p
      id={id}
      style={{
        margin: "7px 0 0",
        fontSize: 13,
        fontWeight: 600,
        color: "var(--mxred-d)",
      }}
    >
      {message}
    </p>
  );
}
