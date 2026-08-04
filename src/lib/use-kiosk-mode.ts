"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Kiosk mode, persisted so a booth iPad survives a refresh mid-event.
 *
 * Read through useSyncExternalStore rather than an effect: localStorage is
 * external state, the server has no view of it, and this keeps the first
 * client render consistent with the server's instead of flashing the wrong
 * screen and then correcting itself.
 */

const KEY = "mkx.kiosk";

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getSnapshot(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    // Private browsing. Kiosk mode still works, it just won't persist.
    return false;
  }
}

/** The server cannot know, so it always renders the public form. */
function getServerSnapshot(): boolean {
  return false;
}

export function useKioskMode(): [boolean, () => void] {
  const kiosk = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(KEY, getSnapshot() ? "0" : "1");
    } catch {
      /* ignore */
    }
    emit();
  }, []);

  return [kiosk, toggle];
}
