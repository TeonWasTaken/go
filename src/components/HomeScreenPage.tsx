import { type FormEvent, useState } from "react";
import GoLogoDark from "../assets/GoLogo_dark.svg";
import GoLogoLight from "../assets/GoLogo_light.svg";
import { PopularLinks } from "./PopularLinks";
import { useTheme } from "./ThemeProvider";

export function HomeScreenPage() {
  const { resolved: theme } = useTheme();
  const [alias, setAlias] = useState("");
  const [browsing, setBrowsing] = useState(false);

  const trimmed = alias.trim();
  const isDisabled = trimmed.length === 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isDisabled) return;
    window.location.href = `/${trimmed}`;
  };

  return (
    <div className="home-screen-page">
      <div className="home-screen-crossfade">
        {/* Hero panel */}
        <div
          className={`home-screen-crossfade__panel${browsing ? " home-screen-crossfade__panel--hidden" : ""}`}
          aria-hidden={browsing}
        >
          <section className="home-screen-hero">
            <img
              src={theme === "dark" ? GoLogoDark : GoLogoLight}
              alt="Go"
              className="home-screen-logo"
            />
            <p className="home-screen-tagline">Where do you want to go today?</p>
            <form className="home-screen-form glass" onSubmit={handleSubmit}>
              <input
                type="text"
                className="home-screen-input"
                placeholder="Type an alias…"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                autoFocus
                tabIndex={browsing ? -1 : 0}
              />
              <button
                type="submit"
                className="home-screen-submit btn btn--primary"
                disabled={isDisabled}
                tabIndex={browsing ? -1 : 0}
              >
                Go
              </button>
            </form>
            <button
              type="button"
              className="home-screen-browse-link"
              onClick={() => setBrowsing(true)}
              tabIndex={browsing ? -1 : 0}
            >
              Browse popular links
            </button>
          </section>
        </div>

        {/* Browse panel */}
        <div
          className={`home-screen-crossfade__panel${!browsing ? " home-screen-crossfade__panel--hidden" : ""}`}
          aria-hidden={!browsing}
        >
          <div className="home-screen-browse">
            <PopularLinks />
            <button
              type="button"
              className="home-screen-back"
              onClick={() => setBrowsing(false)}
              tabIndex={!browsing ? -1 : 0}
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
