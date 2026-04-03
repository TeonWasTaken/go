import { useEffect, useState } from "react";
import { useAliasPrefix } from "../App";
import type { AliasRecord } from "../services/api";
import { ApiError, getLinks } from "../services/api";
import { IconFallback } from "./IconFallback";
import { SkeletonLoader } from "./SkeletonLoader";
import { useToast } from "./ToastProvider";

type PopularMode = "recent" | "alltime";

/** Visual heat indicator: horizontal progress bar based on relative heat score. */
function HeatIndicator({ score, max }: { score: number; max: number }) {
  const percentage = max > 0 ? Math.round((score / max) * 100) : 0;
  const level = max > 0 ? Math.ceil((score / max) * 5) : 0;
  return (
    <div
      className="heat-bar"
      role="meter"
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Popularity: ${level} of 5`}
    >
      <div className="heat-bar__fill" style={{ width: `${percentage}%` }} />
    </div>
  );
}

/** Visual popularity indicator using log scale so high-traffic links don't dominate. */
function ClickIndicator({ count, max }: { count: number; max: number }) {
  const logCount = count > 0 ? Math.log(count + 1) : 0;
  const logMax = max > 0 ? Math.log(max + 1) : 0;
  const percentage = logMax > 0 ? Math.round((logCount / logMax) * 100) : 0;
  const level = logMax > 0 ? Math.ceil((logCount / logMax) * 5) : 0;
  return (
    <div
      className="heat-bar"
      role="meter"
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Popularity: ${level} of 5`}
    >
      <div className="heat-bar__fill" style={{ width: `${percentage}%` }} />
    </div>
  );
}

interface PopularLinksProps {
  refreshKey?: number;
}

export function PopularLinks({ refreshKey = 0 }: PopularLinksProps) {
  const [links, setLinks] = useState<AliasRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<PopularMode>("recent");
  const { showToast } = useToast();
  const aliasPrefix = useAliasPrefix();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const scope = mode === "recent" ? "popular" : "popular-clicks";
        const data = await getLinks({ scope });
        if (!cancelled) setLinks(data);
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof ApiError
              ? err.message
              : "Failed to load popular links";
          showToast(msg, "error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showToast, refreshKey, mode]);

  const maxHeat = links.reduce((m, l) => Math.max(m, l.heat_score), 0);
  const maxClicks = links.reduce((m, l) => Math.max(m, l.click_count), 0);

  // Route clicks through the redirect API so they're recorded
  const isDev = import.meta.env.DEV;
  const buildRedirectUrl = (alias: string) =>
    isDev
      ? `/go-redirect/${encodeURIComponent(alias)}`
      : `/api/redirect/${encodeURIComponent(alias)}`;

  return (
    <section className="popular-links" aria-label="Popular links">
      <div className="popular-links__header">
        <h2 className="popular-links__heading">Popular Links</h2>
        <div
          className="popular-links__pill glass--subtle"
          role="tablist"
          aria-label="Popular links time range"
        >
          <button
            role="tab"
            aria-selected={mode === "recent"}
            className={`popular-links__pill-option${mode === "recent" ? " popular-links__pill-option--active" : ""}`}
            onClick={() => setMode("recent")}
          >
            Recent
          </button>
          <button
            role="tab"
            aria-selected={mode === "alltime"}
            className={`popular-links__pill-option${mode === "alltime" ? " popular-links__pill-option--active" : ""}`}
            onClick={() => setMode("alltime")}
          >
            All Time
          </button>
        </div>
      </div>
      {loading ? (
        <SkeletonLoader height="2rem" borderRadius="var(--radius)" count={5} />
      ) : links.length === 0 ? (
        <p className="popular-links__empty">No popular links yet.</p>
      ) : (
        <ol className="popular-links__list">
          {links.map((link) => (
            <li key={link.id} role="listitem">
              <a
                href={buildRedirectUrl(link.alias)}
                className="popular-links__item"
              >
                <IconFallback
                  iconUrl={link.icon_url}
                  title={link.title}
                  alias={link.alias}
                  size={32}
                />
                <div className="popular-links__info">
                  <span className="popular-links__alias">
                    {aliasPrefix}/{link.alias}
                  </span>
                  {link.title && (
                    <span className="popular-links__title">{link.title}</span>
                  )}
                  <span className="popular-links__url">
                    {link.destination_url}
                  </span>
                </div>
                {mode === "recent" ? (
                  <HeatIndicator score={link.heat_score} max={maxHeat} />
                ) : (
                  <ClickIndicator count={link.click_count} max={maxClicks} />
                )}
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
