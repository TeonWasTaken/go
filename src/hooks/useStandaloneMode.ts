import { useEffect, useState } from "react";

/**
 * Detects whether the app is running in PWA standalone mode.
 *
 * Checks `window.matchMedia('(display-mode: standalone)')` and
 * the iOS-specific `navigator.standalone` property.
 * Listens for matchMedia change events so the value updates live.
 * Returns `false` when matchMedia is not supported (graceful fallback).
 */
export function useStandaloneMode(): boolean {
  const [isStandalone, setIsStandalone] = useState<boolean>(() => {
    // iOS Safari standalone check
    if ((navigator as any).standalone === true) {
      return true;
    }

    // Standard matchMedia check
    if (typeof window.matchMedia === "function") {
      return window.matchMedia("(display-mode: standalone)").matches;
    }

    return false;
  });

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const mql = window.matchMedia("(display-mode: standalone)");

    const handleChange = (e: MediaQueryListEvent) => {
      setIsStandalone(e.matches || (navigator as any).standalone === true);
    };

    mql.addEventListener("change", handleChange);
    return () => {
      mql.removeEventListener("change", handleChange);
    };
  }, []);

  return isStandalone;
}
