import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * InterstitialPage — conflict resolution page displayed when a user's
 * private alias and a global alias share the same name.
 *
 * Expected query params:
 *   alias       — the alias name
 *   privateUrl  — destination for the user's private alias
 *   globalUrl   — destination for the global alias
 *
 * Auto-redirects to the private destination after 5 seconds.
 * Clicking either link cancels the countdown.
 */

const COUNTDOWN_SECONDS = 5;

export function InterstitialPage() {
  const [params] = useSearchParams();
  const alias = params.get("alias") ?? "";
  const privateUrl = params.get("privateUrl") ?? "/";
  const globalUrl = params.get("globalUrl") ?? "/";

  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelledRef = useRef(false);

  const cancelTimer = useCallback(() => {
    cancelledRef.current = true;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          if (!cancelledRef.current) {
            window.location.href = privateUrl;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [privateUrl]);

  const handleClick = () => {
    cancelTimer();
  };

  const truncate = (url: string, max = 60) =>
    url.length > max ? url.slice(0, max) + "…" : url;

  return (
    <div className="interstitial">
      <div className="interstitial__card glass">
        <h1 className="interstitial__heading">go/{alias}</h1>
        <p className="interstitial__subtitle">
          This alias exists as both a personal and a global link.
        </p>

        <a
          className="interstitial__option interstitial__option--private glass--subtle"
          href={privateUrl}
          onClick={handleClick}
          aria-label={`Go to your personal link: ${privateUrl}`}
        >
          <span className="interstitial__option-label">Personal</span>
          <span className="interstitial__option-url">
            {truncate(privateUrl)}
          </span>
        </a>

        <a
          className="interstitial__option interstitial__option--global glass--subtle"
          href={globalUrl}
          onClick={handleClick}
          aria-label={`Go to the global link: ${globalUrl}`}
        >
          <span className="interstitial__option-label">Global</span>
          <span className="interstitial__option-url">
            {truncate(globalUrl)}
          </span>
        </a>

        <p className="interstitial__countdown" aria-live="polite">
          {cancelledRef.current ? (
            "Auto-redirect cancelled."
          ) : remaining > 0 ? (
            <>
              Redirecting to your personal link in{" "}
              <span className="interstitial__seconds">{remaining}</span>s…
            </>
          ) : (
            "Redirecting…"
          )}
        </p>
      </div>
    </div>
  );
}
