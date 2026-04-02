import { useState } from "react";
import { useUser } from "../App";

export function UserBadge() {
  const user = useUser();
  const [imgFailed, setImgFailed] = useState(false);

  if (!user) return null;

  const isAdmin = user.roles.some((r) => r.toLowerCase() === "admin");
  const initial = user.email.charAt(0).toUpperCase();
  const avatarSrc = user.pictureUrl;

  return (
    <div className="user-badge" title={user.email}>
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
    </div>
  );
}
