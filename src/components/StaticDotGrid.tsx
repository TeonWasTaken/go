import { useEffect, useRef } from "react";
import { useTheme } from "./ThemeProvider";

export interface StaticDotGridProps {
  /** Spacing between dots in pixels (default 30) */
  spacing?: number;
  /** Dot radius in pixels (default 1) */
  dotRadius?: number;
  /** Whether the grid is visible (controls CSS opacity fade) */
  visible?: boolean;
}

/**
 * A simple static dot grid background drawn once on a canvas.
 * Redraws only on resize or theme change — no animation loop.
 */
export function StaticDotGrid({
  spacing = 30,
  dotRadius = 1,
  visible = true,
}: StaticDotGridProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { resolved } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function draw() {
      const W = window.innerWidth;
      const H = window.innerHeight;
      canvas!.width = W;
      canvas!.height = H;

      const dotColor = resolved === "dark"
        ? "rgba(255,255,255,0.07)"
        : "rgba(0,0,0,0.12)";

      ctx!.clearRect(0, 0, W, H);
      ctx!.fillStyle = dotColor;
      ctx!.beginPath();
      for (let y = spacing / 2; y < H; y += spacing) {
        for (let x = spacing / 2; x < W; x += spacing) {
          ctx!.moveTo(x + dotRadius, y);
          ctx!.arc(x, y, dotRadius, 0, Math.PI * 2);
        }
      }
      ctx!.fill();
    }

    draw();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => draw());
      ro.observe(document.documentElement);
    } else {
      window.addEventListener("resize", draw);
    }

    return () => {
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", draw);
    };
  }, [resolved, spacing, dotRadius]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.6s ease",
      }}
    />
  );
}
