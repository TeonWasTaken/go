import { useEffect, useRef, useState } from "react";
import { useAliasPrefix } from "../App";
import type { AliasRecord } from "../services/api";
import { ApiError, getLinks } from "../services/api";
import { IconFallback } from "./IconFallback";
import { SkeletonLoader } from "./SkeletonLoader";

interface SearchResultsPanelProps {
  searchTerm: string;
}

export function SearchResultsPanel({ searchTerm }: SearchResultsPanelProps) {
  const [results, setResults] = useState<AliasRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasLoaded = useRef(false);
  const aliasPrefix = useAliasPrefix();

  useEffect(() => {
    let cancelled = false;
    if (!hasLoaded.current) {
      setLoading(true);
    }
    setFetching(true);
    setError(null);
    (async () => {
      try {
        const data = await getLinks({ search: searchTerm });
        if (!cancelled) {
          setResults(data);
          hasLoaded.current = true;
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Failed to load search results",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setFetching(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchTerm]);

  const isDev = import.meta.env.DEV;
  const buildRedirectUrl = (alias: string) =>
    isDev
      ? `/go-redirect/${encodeURIComponent(alias)}`
      : `/api/redirect/${encodeURIComponent(alias)}`;

  return (
    <section className="popular-links" aria-label="Search results">
      <div className="popular-links__header">
        <h2 className="popular-links__heading">Search Results</h2>
      </div>
      {loading ? (
        <SkeletonLoader height="2rem" borderRadius="var(--radius)" count={5} />
      ) : error ? (
        <p className="popular-links__empty">{error}</p>
      ) : results.length === 0 ? (
        <p className="popular-links__empty">
          No results found for &lsquo;{searchTerm}&rsquo;
        </p>
      ) : (
        <ol
          className="popular-links__list"
          style={{
            opacity: fetching ? 0.6 : 1,
            transition: "opacity 150ms ease",
          }}
        >
          {results.map((link) => (
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
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
