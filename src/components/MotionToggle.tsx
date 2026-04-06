import { useEffect, useState } from "react";

const STORAGE_KEY = "go-motion-pref";

/** Returns the stored preference, defaulting to "motion" */
function getStored(): "motion" | "static" {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "static") return "static";
  } catch { /* ignore */ }
  return "motion";
}

/** Small pill toggle: animated background vs static */
export function useMotionPref() {
  const [pref, setPref] = useState<"motion" | "static">(getStored);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, pref); } catch { /* ignore */ }
  }, [pref]);

  return { pref, setPref } as const;
}

export function MotionToggle({
  pref,
  setPref,
}: {
  pref: "motion" | "static";
  setPref: (v: "motion" | "static") => void;
}) {
  return (
    <fieldset
      className="motion-toggle"
      role="radiogroup"
      aria-label="Background animation"
    >
      <legend className="sr-only">Background animation</legend>
      <button
        type="button"
        role="radio"
        aria-checked={pref === "motion"}
        aria-label="Animated background"
        className={`motion-toggle__btn${pref === "motion" ? " motion-toggle__btn--active" : ""}`}
        onClick={() => setPref("motion")}
      >
        <span className="motion-toggle__icon" aria-hidden="true">✨</span>
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={pref === "static"}
        aria-label="Static background"
        className={`motion-toggle__btn${pref === "static" ? " motion-toggle__btn--active" : ""}`}
        onClick={() => setPref("static")}
      >
        <span className="motion-toggle__icon" aria-hidden="true">🔲</span>
      </button>
    </fieldset>
  );
}
