import { useRef, useState } from "react";
import { useAuthConfig, useUser } from "../App";

export function UserBadge() {
  const user = useUser();
  const authConfig = useAuthConfig();
  const [imgFailed, setImgFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  if (!user) return null;

  const isAdmin = user.roles.some((r) => r.toLowerCase() === "admin");
  const initial = user.email.charAt(0).toUpperCase();
  const avatarSrc = user.pictureUrl;

  // SSO modes (corporate/public with external IdPs) use SWA's built-in logout.
  // Dev mode doesn't need sign-out.
  const isSSOMode =
    authConfig?.mode === "corporate" || authConfig?.mode === "public";
  const showSignOut = authConfig?.mode !== "dev";
  const logoutUrl = isSSOMode ? "/.auth/logout" : "/.auth/logout";

  const handleBlur = (e: React.FocusEvent) => {
    if (!wrapperRef.current?.contains(e.relatedTarget as Node)) {
      setMenuOpen(false);
    }
  };

  return (
    <div
      className="user-badge"
      title={user.email}
      ref={wrapperRef}
      onBlur={handleBlur}
    >
      <button
        className="user-badge__trigger"
        onClick={() => setMenuOpen((o) => !o)}
        aria-expanded={menuOpen}
        aria-haspopup="true"
        aria-label="User menu"
        type="button"
      >
        <div className="user-badge__avatar-wrapper">
          {avatarSrc && !imgFailed ? (
            <img
              className="user-badge__avatar-img"
              src={avatarSrc}
              alt=""
              referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span className="user-badge__avatar-initial">{initial}</span>
          )}
          {isAdmin && (
            <span className="user-badge__crown" aria-label="Admin">
              👑
            </span>
          )}
        </div>
      </button>
      {menuOpen && (
        <div className="user-badge__menu" role="menu">
          <span className="user-badge__menu-email">{user.email}</span>
          {isAdmin && <span className="user-badge__menu-role">Admin</span>}
          {showSignOut && (
            <a
              className="user-badge__menu-item"
              href={logoutUrl}
              role="menuitem"
            >
              Sign Out
            </a>
          )}
        </div>
      )}
    </div>
  );
}
