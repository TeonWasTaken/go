import { useEffect, useState } from "react";
import type { AliasRecord } from "../services/api";
import { ApiError, getLinks } from "../services/api";
import { SkeletonLoader } from "./SkeletonLoader";
import { useToast } from "./ToastProvider";

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

interface PopularLinksProps {
  refreshKey?: number;
}

export function PopularLinks({ refreshKey = 0 }: PopularLinksProps) {
  const [links, setLinks] = useState<AliasRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const data = await getLinks({ scope: "popular" });
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
  }, [showToast, refreshKey]);

  const maxHeat = links.reduce((m, l) => Math.max(m, l.heat_score), 0);

  return (
    <section className="popular-links" aria-label="Popular links">
      <h2 className="popular-links__heading">Popular Links</h2>
      {loading ? (
        <SkeletonLoader height="2rem" borderRadius="var(--radius)" count={5} />
      ) : links.length === 0 ? (
        <p className="popular-links__empty">No popular links yet.</p>
      ) : (
        <ol className="popular-links__list">
          {links.map((link) => (
            <li key={link.id} role="listitem">
              <a
                href={link.destination_url}
                target="_blank"
                rel="noopener noreferrer"
                className="popular-links__item"
              >
                <div className="popular-links__info">
                  <span className="popular-links__alias">go/{link.alias}</span>
                  {link.title && (
                    <span className="popular-links__title">{link.title}</span>
                  )}
                  <span className="popular-links__url">
                    {link.destination_url}
                  </span>
                </div>
                <HeatIndicator score={link.heat_score} max={maxHeat} />
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
