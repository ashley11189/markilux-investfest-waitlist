"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SignupForm, type SignupSuccess } from "@/components/SignupForm";
import { useKioskMode } from "@/lib/use-kiosk-mode";

type Screen = "welcome" | "form" | "done";

/**
 * How long the confirmation lingers before the kiosk resets for the next
 * person.
 *
 * Was 7s, which is a WCAG 2.2.1 failure: a hard time limit on content with no
 * way to extend it. Seven seconds is measured from when the screen appears,
 * not from when the visitor finishes reading, so someone reaching for their
 * phone to photograph their confirmation code could simply lose it — as could
 * anyone reading English as a second language, or a screen-reader user still
 * being read the paragraph above it.
 *
 * 20s, and any touch or key press restarts the clock, which is the "extend"
 * mechanism 2.2.1 asks for. It still clears on its own so the next visitor
 * never sees the previous person's name.
 */
const KIOSK_RESET_MS = 20000;

export function SignupExperience() {
  // Kiosk mode is set in the back office; this page only reads it.
  const [kiosk] = useKioskMode();

  // null means "whatever this mode starts on", which keeps the kiosk welcome
  // screen out of the render path until localStorage has actually been read.
  const [screen, setScreen] = useState<Screen | null>(null);
  const [result, setResult] = useState<SignupSuccess | null>(null);

  const current: Screen = screen ?? (kiosk ? "welcome" : "form");
  const headingRef = useRef<HTMLHeadingElement>(null);

  const go = useCallback((next: Screen) => {
    setScreen(next);
    window.scrollTo(0, 0);
  }, []);

  // Auto-return to the welcome screen so the next visitor never sees the last
  // person's name sitting on the iPad. Touching the screen or pressing a key
  // restarts the countdown, so nobody loses their confirmation code mid-read.
  useEffect(() => {
    if (current !== "done" || !kiosk) return;

    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      setResult(null);
      setScreen("welcome");
      window.scrollTo(0, 0);
    };
    const restart = () => {
      clearTimeout(timer);
      timer = setTimeout(reset, KIOSK_RESET_MS);
    };

    restart();
    window.addEventListener("pointerdown", restart);
    window.addEventListener("keydown", restart);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", restart);
      window.removeEventListener("keydown", restart);
    };
  }, [current, kiosk]);

  // Send focus to the new heading on every screen change, so a screen-reader
  // or keyboard user is not stranded at the bottom of the previous view.
  useEffect(() => {
    headingRef.current?.focus();
  }, [current]);

  const handleSuccess = useCallback(
    (value: SignupSuccess) => {
      setResult(value);
      go("done");
    },
    [go],
  );

  if (current === "welcome") {
    return (
      <main className="center">
          <Brand />
          <h2 ref={headingRef} tabIndex={-1}>
            Private sale.
            <br />
            By invitation.
          </h2>
          <p>
            German engineered shading at private sale pricing, released to our
            list before it opens to the market. Add your name and we will send
            you first access.
          </p>
          <button
            className="btn"
            type="button"
            style={{ width: "auto", padding: "19px 40px" }}
            onClick={() => go("form")}
          >
            Start
          </button>
          <p className="tap">markilux USA · InvestFest 2026 · Booth</p>
      </main>
    );
  }

  if (current === "done") {
    const firstName = result?.name?.split(" ")[0] ?? "You";
    const reset = () => {
      setResult(null);
      setScreen(kiosk ? "welcome" : "form");
      window.scrollTo(0, 0);
    };

    return (
      <main className="center">
        <Brand />
        <div className="mark" style={{ marginTop: "var(--leading)" }}>
          <span aria-hidden="true">✓</span>
        </div>
        <h2 ref={headingRef} tabIndex={-1}>
          {result?.duplicate
            ? `${firstName}, you are already on the list.`
            : `${firstName}, you are on the list.`}
        </h2>
        <p>
          {result?.duplicate
            ? "We already had this email, so there is nothing more to do. The private sale details are on their way to you."
            : "Pricing, allocation, and the opening date go out by email before the sale is announced. Watch for a message from markilux USA."}
        </p>
        {result?.confirmation && (
          <div className="ticket">CONFIRMATION {result.confirmation}</div>
        )}
        <button
          className="btn ghost"
          type="button"
          onClick={reset}
          style={{ marginTop: "var(--leading)" }}
        >
          {kiosk ? "Next person" : "Back to the form"}
        </button>
        {kiosk && (
          <p className="tap">
            Returning to the start shortly — touch the screen to keep it open
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="shell">
      <Brand />

        <div className="hero-media" style={{ marginTop: "var(--leading)" }}>
          <Image
            src="/img/awning-hero-1280.webp"
            alt="A markilux awning shading a residential terrace"
            width={1280}
            height={720}
            priority
            sizes="(max-width: 620px) 100vw, 620px"
          />
        </div>

        <p className="kick">Private sale list · InvestFest 2026</p>
        <h1 className="h1" ref={headingRef} tabIndex={-1}>
          Get first access before it opens.
        </h1>
        <p className="lede">
          We are releasing a limited allocation of markilux systems at private
          sale pricing. List members hear pricing and dates first, ahead of the
          public Fall 2026 opening.
        </p>

        <SignupForm kiosk={kiosk} onSuccess={handleSuccess} />

        {!kiosk && (
          <div className="foot">
            <span>markilux USA · InvestFest 2026</span>
            <Link href="/organizer">Organizer</Link>
          </div>
        )}
      </main>
  );
}

function Brand() {
  return (
    <span className="brand">
      <Image
        src="/img/markilux-wordmark.png"
        alt="markilux"
        width={300}
        height={38}
        style={{ height: 15, width: "auto" }}
        priority
      />
      <span>USA</span>
    </span>
  );
}
