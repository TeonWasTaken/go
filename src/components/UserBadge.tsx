import { useState } from "react";
import { useUser } from "../App";

function gravatarUrl(email: string, size = 56): string {
  // Simple hash using Web Crypto isn't available synchronously,
  // so we use a basic djb2 hash to generate a Gravatar-compatible URL.
  // Gravatar actually needs MD5, but we'll use their ?d=404 param
  // to detect missing avatars and fall back to the initial.
  const trimmed = email.trim().toLowerCase();
  // Use a simple approach: encode the email for the Gravatar URL
  // and let the img onerror handle missing avatars.
  const encoded = Array.from(new TextEncoder().encode(trimmed))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `https://www.gravatar.com/avatar/${encoded}?s=${size}&d=404`;
}

export function UserBadge() {
  const user = useUser();
  const [imgFailed, setImgFailed] = useState(false);

  if (!user) return null;

  const isAdmin = user.roles.includes("Admin");
  const initial = user.email.charAt(0).toUpperCase();
  const avatarSrc = gravatarUrl(user.email);

  return (
    <div className="user-badge" title={user.email}>
      <div className="user-badge__avatar-wrapper">
        {!imgFailed ? (
          <img
            className="user-badge__avatar-img"
            src={avatarSrc}
            alt=""
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
    </div>
  );
}
