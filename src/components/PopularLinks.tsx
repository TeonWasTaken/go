import { useEffect, useState } from "react";
import type { AliasRecord } from "../services/api";
import { ApiError, getLinks } from "../services/api";
import { SkeletonLoader } from "./SkeletonLoader";
import { useToast } from "./ToastProvider";

/** Visual heat indicator: 1–5 bars based on relative heat score. */
function HeatIndicator({ score, max }: { score: number; max: number }) {
  const level = max > 0 ? Math.ceil((score / max) * 5) : 0;
  return (
    <span className="heat-indicator" aria-label={`Heat level ${level} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`heat-indicator__bar${i < level ? " heat-indicator__bar--active" : ""}`}
        />
      ))}
    </span>
  );
}

export function PopularLinks() {
  const [links, setLinks] = useState<AliasRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
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
  }, [showToast]);

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
            <li key={link.id} className="popular-links__item glass">
              <div className="popular-links__info">
                <span className="popular-links__alias">go/{link.alias}</span>
                {link.title && (
                  <span className="popular-links__title">{link.title}</span>
                )}
              </div>
              <HeatIndicator score={link.heat_score} max={maxHeat} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
