import { useState } from "react";
import { getIconColor, getIconLetter } from "./iconFallbackUtils";

export interface IconFallbackProps {
  iconUrl: string | null;
  title: string;
  alias: string;
  size: number;
}

export function IconFallback({
  iconUrl,
  title,
  alias,
  size,
}: IconFallbackProps) {
  const [imgError, setImgError] = useState(false);

  if (iconUrl && !imgError) {
    return (
      <img
        src={iconUrl}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        style={{ borderRadius: "50%" }}
        onError={() => setImgError(true)}
      />
    );
  }

  const letter = getIconLetter(title, alias);
  const bgColor = getIconColor(title);

  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        backgroundColor: bgColor,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: "bold",
        fontSize: size * 0.6,
        lineHeight: 1,
      }}
    >
      {letter}
    </div>
  );
}
