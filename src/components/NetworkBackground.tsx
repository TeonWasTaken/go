import { useEffect, useRef } from "react";
import { useTheme } from "./ThemeProvider";

// ─── Data types ──────────────────────────────────────────────────────────────

interface Particle {
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  /** Constant per-particle drift so the mesh feels alive even without mouse */
  driftVx: number;
  driftVy: number;
  /** Only visible particles are drawn and connected in the mesh */
  visible: boolean;
}

interface TrailEntry {
  particleIdx: number;
  time: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert "#rrggbb" to "r,g,b" for use in rgba() strings */
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "255,255,255";
  return `${r},${g},${b}`;
}

// ─── Spatial grid for O(1) neighbor lookups ──────────────────────────────────

/** Buckets particles into a uniform grid so neighbor queries are O(nearby) not O(n) */
class SpatialGrid {
  private cellSize: number;
  private cols: number;
  private rows: number;
  private cells: Int32Array;   // flat array of particle indices, packed per cell
  private offsets: Int32Array;  // offsets[cellIdx] = start index in cells[]
  private counts: Int32Array;   // counts[cellIdx] = how many particles in that cell

  constructor(cellSize: number, w: number, h: number, maxParticles: number) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(w / cellSize) + 1;
    this.rows = Math.ceil(h / cellSize) + 1;
    const totalCells = this.cols * this.rows;
    this.cells = new Int32Array(maxParticles);
    this.offsets = new Int32Array(totalCells);
    this.counts = new Int32Array(totalCells);
  }

  /** Rebuild the grid from current particle positions. Call once per frame. */
  rebuild(particles: Particle[], pad: number) {
    const { cellSize, cols, rows, counts } = this;
    const totalCells = cols * rows;
    counts.fill(0);

    // First pass: count particles per cell
    for (let i = 0; i < particles.length; i++) {
      const cx = Math.floor((particles[i]!.x + pad) / cellSize);
      const cy = Math.floor((particles[i]!.y + pad) / cellSize);
      if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) {
        const idx = cy * cols + cx;
        counts[idx] = (counts[idx] ?? 0) + 1;
      }
    }

    // Compute prefix-sum offsets
    let sum = 0;
    for (let c = 0; c < totalCells; c++) {
      this.offsets[c] = sum;
      sum += counts[c] ?? 0;
    }

    // Second pass: place particle indices into cells
    const tempCounts = new Int32Array(totalCells);
    for (let i = 0; i < particles.length; i++) {
      const cx = Math.floor((particles[i]!.x + pad) / cellSize);
      const cy = Math.floor((particles[i]!.y + pad) / cellSize);
      if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) {
        const cellIdx = cy * cols + cx;
        this.cells[(this.offsets[cellIdx] ?? 0) + (tempCounts[cellIdx] ?? 0)] = i;
        tempCounts[cellIdx] = (tempCounts[cellIdx] ?? 0) + 1;
      }
    }
  }

  /**
   * Call `callback(j)` for every particle in cells overlapping the square
   * centered at (x, y) with half-width = radius.
   */
  forEachNear(x: number, y: number, radius: number, pad: number, callback: (j: number) => void) {
    const { cellSize, cols, rows } = this;
    const minCx = Math.max(0, Math.floor((x - radius + pad) / cellSize));
    const maxCx = Math.min(cols - 1, Math.floor((x + radius + pad) / cellSize));
    const minCy = Math.max(0, Math.floor((y - radius + pad) / cellSize));
    const maxCy = Math.min(rows - 1, Math.floor((y + radius + pad) / cellSize));
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const cellIdx = cy * cols + cx;
        const start = this.offsets[cellIdx]!;
        const count = this.counts[cellIdx]!;
        for (let k = 0; k < count; k++) {
          callback(this.cells[start + k]!);
        }
      }
    }
  }
}

// ─── Component props ─────────────────────────────────────────────────────────

export interface NetworkBackgroundProps {
  particleSpacing?: number;
  connectionRadius?: number;
  maxConnections?: number;
  driftSpeed?: number;
  /** Radius of fluid disturbance around mouse (default 250) */
  disturbRadius?: number;
  /** Strength of the fluid push (default 3) */
  disturbStrength?: number;
  /** How quickly particles spring back to home (0-1, default 0.0008) */
  springBack?: number;
  trailDurationMs?: number;
  visibleFraction?: number;
  /** Called periodically with the current FPS value */
  onFps?: (fps: number) => void;
}

/** Max trail entries kept in memory — prevents unbounded growth on fast mouse */
const MAX_TRAIL_LENGTH = 60;

// ─── Component ───────────────────────────────────────────────────────────────

export function NetworkBackground({
  particleSpacing = 40,
  connectionRadius = 120,
  maxConnections = 2,
  driftSpeed = 0.12,
  disturbRadius = 250,
  disturbStrength = 3,
  springBack = 0.0003,
  trailDurationMs = 5000,
  visibleFraction = 0.4,
  onFps,
}: NetworkBackgroundProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafIdRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const prevMouseRef = useRef<{ x: number; y: number } | null>(null);
  const trailRef = useRef<TrailEntry[]>([]);
  const reducedMotionRef = useRef(false);
  /** Spatial grid ref — rebuilt each frame, reused across frames to avoid alloc */
  const gridRef = useRef<SpatialGrid | null>(null);
  /** Reusable typed arrays for display positions — avoids per-frame allocation */
  const dispXRef = useRef<Float32Array>(new Float32Array(0));
  const dispYRef = useRef<Float32Array>(new Float32Array(0));
  /** The padding used for the particle grid — must be consistent across all grid lookups */
  const padRef = useRef(0);

  // Keep onFps in a ref so the animation loop always calls the latest callback
  const onFpsRef = useRef(onFps);
  onFpsRef.current = onFps;
  const fpsFramesRef = useRef<number[]>([]);
  /** Last FPS value emitted to onFps — only emit when the rounded value changes */
  const lastEmittedFpsRef = useRef<number>(-1);
  /** Timestamp of the last onFps emission — throttle to at most 4 times/second */
  const lastFpsEmitTimeRef = useRef<number>(0);

  const { resolved } = useTheme();
  const glowColorRef = useRef("#0ea5e9");
  const dotColorRef = useRef("rgba(255,255,255,0.07)");
  const meshColorRef = useRef("rgba(255,255,255,0.04)");

  // Sync theme colors into refs so the animation loop reads them without re-renders
  useEffect(() => {
    const style = getComputedStyle(document.documentElement);
    const primary = style.getPropertyValue("--color-primary").trim() || "#0ea5e9";
    if (resolved === "dark") {
      glowColorRef.current = primary;
      dotColorRef.current = "rgba(255,255,255,0.07)";
      meshColorRef.current = "rgba(255,255,255,0.04)";
    } else {
      glowColorRef.current = "#0284c7";
      dotColorRef.current = "rgba(0,0,0,0.12)";
      meshColorRef.current = "rgba(0,0,0,0.07)";
    }
  }, [resolved]);

  /**
   * Create the particle grid. Each particle sits on a jittered grid point
   * and drifts slowly in a random direction. Only `visibleFraction` of
   * particles are drawn — the rest are "shadow" nodes used for arc routing.
   */
  function initParticles(w: number, h: number) {
    // Pad extends the particle grid well beyond screen edges so that
    // edge particles + mouse disturbance don't cause wrap-around artifacts
    const pad = Math.max(particleSpacing, disturbRadius + particleSpacing);
    padRef.current = pad;
    const cols = Math.ceil((w + pad * 2) / particleSpacing);
    const rows = Math.ceil((h + pad * 2) / particleSpacing);
    const particles: Particle[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = -pad + c * particleSpacing + (Math.random() - 0.5) * particleSpacing * 0.8;
        const y = -pad + r * particleSpacing + (Math.random() - 0.5) * particleSpacing * 0.8;
        const angle = Math.random() * Math.PI * 2;
        const speed = driftSpeed * (0.5 + Math.random() * 0.5);
        particles.push({
          x, y, homeX: x, homeY: y,
          vx: 0, vy: 0,
          driftVx: Math.cos(angle) * speed,
          driftVy: Math.sin(angle) * speed,
          visible: Math.random() < visibleFraction,
        });
      }
    }
    particlesRef.current = particles;
    trailRef.current = [];

    // Allocate spatial grid and display buffers for the new particle count
    gridRef.current = new SpatialGrid(connectionRadius, w + pad * 2, h + pad * 2, particles.length);
    dispXRef.current = new Float32Array(particles.length);
    dispYRef.current = new Float32Array(particles.length);
  }

  // ─── Main effect: canvas setup, animation loop, event listeners ────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let W = 0, H = 0;

    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      canvas!.width = W; canvas!.height = H;
      initParticles(W, H);
    }
    resize();

    // Prefer ResizeObserver for reliable resize detection, fall back to window event
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => resize());
      ro.observe(document.documentElement);
    } else {
      window.addEventListener("resize", resize);
    }

    // Respect prefers-reduced-motion: draw one static frame and stop the loop
    let motionQuery: MediaQueryList | null = null;
    try {
      motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      reducedMotionRef.current = motionQuery.matches;
    } catch {
      reducedMotionRef.current = false;
    }
    function stopLoop() {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
    }
    function handleMotionChange(ev: MediaQueryListEvent) {
      reducedMotionRef.current = ev.matches;
      if (ev.matches) {
        stopLoop();
        drawFrame(true);
        return;
      }
      if (!rafIdRef.current) rafIdRef.current = requestAnimationFrame(loop);
    }
    if (motionQuery) motionQuery.addEventListener("change", handleMotionChange);

    function loop() {
      if (reducedMotionRef.current) {
        drawFrame(true);
        stopLoop();
        return;
      }
      drawFrame(false);

      // FPS tracking: measure over a rolling 1-second window
      const now = performance.now();
      const frames = fpsFramesRef.current;
      frames.push(now);
      // Drop frames older than 1 second
      while (frames.length > 0 && now - frames[0]! > 1000) frames.shift();
      if (onFpsRef.current && frames.length >= 2) {
        const elapsed = now - frames[0]!;
        if (elapsed > 0) {
          const currentFps = Math.round((frames.length - 1) / (elapsed / 1000));
          // Throttle: emit at most 4 times/second and only when the value changes
          if (
            currentFps !== lastEmittedFpsRef.current &&
            now - lastFpsEmitTimeRef.current >= 250
          ) {
            lastEmittedFpsRef.current = currentFps;
            lastFpsEmitTimeRef.current = now;
            onFpsRef.current(currentFps);
          }
        }
      }

      rafIdRef.current = requestAnimationFrame(loop);
    }

    // ─── Shared computation: mouse speed ───────────────────────────────────
    // Computed once per frame and reused by both trail pruning and drawing.

    function computeMouseSpeed(particles: Particle[], trail: TrailEntry[]): number {
      if (trail.length < 2) return 0;
      const newest = trail[trail.length - 1]!;
      const older = trail[Math.max(0, trail.length - 6)]!;
      const dt = newest.time - older.time;
      if (dt <= 0) return 0;
      const pA = particles[newest.particleIdx];
      const pB = particles[older.particleIdx];
      if (!pA || !pB) return 0;
      const dx = pA.x - pB.x, dy = pA.y - pB.y;
      return Math.sqrt(dx * dx + dy * dy) / (dt / 1000);
    }

    /** Compute effective trail decay duration — faster mouse = shorter trail */
    function effectiveDecay(mouseSpeed: number): number {
      const speedFactor = 1 + mouseSpeed / 200;
      return Math.max(800, trailDurationMs / speedFactor);
    }

    // ─── Core frame: physics + draw ────────────────────────────────────────

    /** Arc path indices computed each frame before physics, used to exclude
     *  arc nodes from fluid disturbance so the trail stays stable. */
    let currentArcPath: number[] = [];

    function drawFrame(isStatic: boolean) {
      const particles = particlesRef.current;
      const pad = Math.max(particleSpacing, disturbRadius + particleSpacing);
      const grid = gridRef.current!;

      // Rebuild spatial grid with current positions (O(n))
      grid.rebuild(particles, pad);

      // ── 1. Compute arc path (the glowing trail that follows the mouse) ──
      currentArcPath = [];
      let mouseSpeed = 0;

      if (!isStatic) {
        const now = performance.now();
        const trail = trailRef.current;
        mouseSpeed = computeMouseSpeed(particles, trail);

        // Prune old trail entries based on speed-adaptive decay
        const decay = effectiveDecay(mouseSpeed);
        trailRef.current = trail.filter(e => now - e.time < decay);
        const filteredTrail = trailRef.current;

        if (filteredTrail.length >= 2) {
          // Deduplicate consecutive waypoints (same particle visited twice)
          const waypoints: number[] = [];
          for (const entry of filteredTrail) {
            if (waypoints.length === 0 || entry.particleIdx !== waypoints[waypoints.length - 1]) {
              waypoints.push(entry.particleIdx);
            }
          }

          // Greedy pathfinding: for each consecutive waypoint pair, walk through
          // nearby particles toward the target, preferring nodes closer to goal.
          const arcRadSq = connectionRadius * connectionRadius * 1.5;
          if (waypoints.length > 0) currentArcPath.push(waypoints[0]!);
          const arcUsedShadow = new Set<number>();

          for (let i = 0; i < waypoints.length - 1; i++) {
            const from = waypoints[i]!;
            const to = waypoints[i + 1]!;
            if (from === to) continue;
            const visited = new Set<number>(currentArcPath);
            let cur = from;

            for (let step = 0; step < 25 && cur !== to; step++) {
              const target = particles[to]!;
              const curP = particles[cur]!;
              const dxT = curP.x - target.x, dyT = curP.y - target.y;
              const directDist = dxT * dxT + dyT * dyT;

              // Find the unvisited neighbor closest to the goal
              let bestIdx = to;
              let bestDist = Infinity;
              const arcRad = Math.sqrt(arcRadSq);
              grid.forEachNear(curP.x, curP.y, arcRad, pad, (k) => {
                if (k === cur || visited.has(k)) return;
                const pk = particles[k]!;
                const dxC = pk.x - curP.x, dyC = pk.y - curP.y;
                if (dxC * dxC + dyC * dyC > arcRadSq) return;
                const dxG = pk.x - target.x, dyG = pk.y - target.y;
                const goalDist = dxG * dxG + dyG * dyG;
                if (goalDist < bestDist) { bestDist = goalDist; bestIdx = k; }
              });

              // If we're close enough to jump directly to the target, do so
              if (bestDist >= directDist && directDist < arcRadSq * 4) {
                currentArcPath.push(to);
                break;
              }
              if (!particles[bestIdx]!.visible) arcUsedShadow.add(bestIdx);
              visited.add(bestIdx);
              currentArcPath.push(bestIdx);
              cur = bestIdx;
            }
          }

          // "Promote" invisible nodes used by the arc so they become visible,
          // and hide a random visible node to keep the total count balanced.
          const arcSet = new Set(currentArcPath);
          for (const sIdx of arcUsedShadow) {
            particles[sIdx]!.visible = true;
            for (let attempt = 0; attempt < 5; attempt++) {
              const rIdx = Math.floor(Math.random() * particles.length);
              if (particles[rIdx]!.visible && !arcSet.has(rIdx)) {
                particles[rIdx]!.visible = false;
                break;
              }
            }
          }
        }
      }

      const arcNodeSet = new Set(currentArcPath);

      // ── 2. Physics: fluid disturbance, spring-back, drift, damping ──────
      if (!isStatic) {
        const mouse = mouseRef.current;
        const prevMouse = prevMouseRef.current;

        // Mouse velocity this frame (used for directional push)
        let mvx = 0, mvy = 0;
        if (mouse && prevMouse) {
          mvx = mouse.x - prevMouse.x;
          mvy = mouse.y - prevMouse.y;
        }
        const mouseSpd = Math.sqrt(mvx * mvx + mvy * mvy);

        // Disturbance originates from the arc head (tip of the trail),
        // falling back to raw mouse position if no arc exists yet.
        let disturbX = mouse?.x ?? 0;
        let disturbY = mouse?.y ?? 0;
        if (currentArcPath.length > 0) {
          const headP = particles[currentArcPath[currentArcPath.length - 1]!]!;
          disturbX = headP.x;
          disturbY = headP.y;
        }
        const disturbRadSq = disturbRadius * disturbRadius;

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i]!;

          // Push particles away from the arc head (skip arc nodes so trail stays stable)
          if (mouse && mouseSpd > 0.5 && !arcNodeSet.has(i)) {
            const dx = p.x - disturbX;
            const dy = p.y - disturbY;
            const dSq = dx * dx + dy * dy;
            if (dSq < disturbRadSq && dSq > 0) {
              const dist = Math.sqrt(dSq);
              const t = 1 - dist / disturbRadius;           // falloff: 1 at center, 0 at edge
              const speedScale = Math.min(mouseSpd / 10, 3); // cap so it doesn't explode
              const pushStrength = t * t * disturbStrength * speedScale;
              p.vx += (dx / dist) * pushStrength * 0.4 + mvx * pushStrength * 0.015;
              p.vy += (dy / dist) * pushStrength * 0.4 + mvy * pushStrength * 0.015;
            }
          }

          // Spring force pulls particle back toward its home position
          p.vx += (p.homeX - p.x) * springBack;
          p.vy += (p.homeY - p.y) * springBack;

          // Slow constant drift gives the mesh an organic feel
          p.homeX += p.driftVx;
          p.homeY += p.driftVy;

          // Velocity damping (0.92 ≈ light friction)
          p.vx *= 0.92;
          p.vy *= 0.92;
          p.x += p.vx;
          p.y += p.vy;

          // Wrap around screen edges so particles never leave the viewport
          if (p.x < -pad) { p.x += W + pad * 2; p.homeX += W + pad * 2; }
          if (p.x > W + pad) { p.x -= W + pad * 2; p.homeX -= W + pad * 2; }
          if (p.y < -pad) { p.y += H + pad * 2; p.homeY += H + pad * 2; }
          if (p.y > H + pad) { p.y -= H + pad * 2; p.homeY -= H + pad * 2; }
        }
        prevMouseRef.current = mouse ? { ...mouse } : null;
      }

      // ── 3. Mesh connections: connect nearby visible particles ────────────
      // Uses spatial grid for O(n·k) instead of O(n²), where k = avg neighbors.
      const conns: [number, number][] = [];
      const radSq = connectionRadius * connectionRadius;
      const connSet = new Set<string>();
      const connCount = new Map<number, number>();

      for (let i = 0; i < particles.length; i++) {
        if (!particles[i]!.visible) continue;
        const pi = particles[i]!;
        const candidates: { idx: number; dSq: number }[] = [];

        // Only check particles in nearby grid cells instead of all particles
        grid.forEachNear(pi.x, pi.y, connectionRadius, pad, (j) => {
          if (j === i || !particles[j]!.visible) return;
          const pj = particles[j]!;
          const dx = pi.x - pj.x, dy = pi.y - pj.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < radSq) candidates.push({ idx: j, dSq });
        });

        // Sort by distance so we connect to the closest neighbors first
        candidates.sort((a, b) => a.dSq - b.dSq);
        let count = connCount.get(i) ?? 0;
        for (let c = 0; c < candidates.length && count < maxConnections; c++) {
          const j = candidates[c]!.idx;
          if ((connCount.get(j) ?? 0) >= maxConnections) continue;
          // Canonical key (smaller index first) prevents duplicate edges
          const a = Math.min(i, j), b = Math.max(i, j);
          const key = `${a},${b}`;
          if (connSet.has(key)) continue;
          connSet.add(key);
          conns.push([a, b]);
          connCount.set(i, (connCount.get(i) ?? 0) + 1);
          connCount.set(j, (connCount.get(j) ?? 0) + 1);
          count++;
        }
      }

      // ── 4. Copy positions into reusable typed arrays for drawing ─────────
      const dispX = dispXRef.current;
      const dispY = dispYRef.current;
      for (let i = 0; i < particles.length; i++) {
        dispX[i] = particles[i]!.x;
        dispY[i] = particles[i]!.y;
      }

      // ── 5. Draw: clear → mesh lines → dots → arc trail ─────────────────
      ctx!.clearRect(0, 0, W, H);

      // Mesh connection lines (single batched path for all edges)
      ctx!.strokeStyle = meshColorRef.current;
      ctx!.lineWidth = 0.5;
      ctx!.beginPath();
      for (const [a, b] of conns) {
        ctx!.moveTo(dispX[a]!, dispY[a]!);
        ctx!.lineTo(dispX[b]!, dispY[b]!);
      }
      ctx!.stroke();

      // Visible particle dots — batched into a single path + fill call
      ctx!.fillStyle = dotColorRef.current;
      ctx!.beginPath();
      for (let i = 0; i < particles.length; i++) {
        if (!particles[i]!.visible) continue;
        ctx!.moveTo(dispX[i]! + 1, dispY[i]!);
        ctx!.arc(dispX[i]!, dispY[i]!, 1, 0, Math.PI * 2);
      }
      ctx!.fill();

      // ── 6. Draw arc trail (glowing path that follows the mouse) ─────────
      if (!isStatic && currentArcPath.length >= 2) {
        const now = performance.now();
        const filteredTrail = trailRef.current;
        const decay = effectiveDecay(mouseSpeed);

        const pathNodes = currentArcPath;
        const rgb = hexToRgb(glowColorRef.current);

        // "lighter" blend mode makes the glow additive (brighter on overlap)
        ctx!.globalCompositeOperation = "lighter";
        ctx!.shadowBlur = 4;
        ctx!.shadowColor = glowColorRef.current;

        // Draw each segment with opacity based on age and position along trail
        for (let j = 0; j < pathNodes.length - 1; j++) {
          const aIdx = pathNodes[j]!;
          const bIdx = pathNodes[j + 1]!;

          // posFade: brighter toward the head (newest end of trail)
          const posFade = (j + 1) / pathNodes.length;

          // Map path segment index to a trail timestamp for age-based fade
          const trailIdx = Math.min(
            Math.round(j * (filteredTrail.length - 1) / (pathNodes.length - 1)),
            filteredTrail.length - 1
          );
          const tEntry = filteredTrail[trailIdx];
          const age = tEntry ? now - tEntry.time : 0;
          const ageFade = Math.max(0, 1 - age / decay);
          const fade = ageFade * posFade;

          ctx!.strokeStyle = `rgba(${rgb},${fade * 0.12})`;
          ctx!.lineWidth = 0.8;
          ctx!.beginPath();
          ctx!.moveTo(dispX[aIdx]!, dispY[aIdx]!);
          ctx!.lineTo(dispX[bIdx]!, dispY[bIdx]!);
          ctx!.stroke();
        }

        // Head node: bright glow dot + random "spark" lines to nearby particles
        const lastEntry = filteredTrail[filteredTrail.length - 1];
        if (lastEntry) {
          const headIdx = pathNodes[pathNodes.length - 1]!;
          const headAge = now - lastEntry.time;
          const headFade = Math.max(0, 1 - headAge / 800);
          if (headFade > 0) {
            // Glow dot at the head
            ctx!.fillStyle = `rgba(${rgb},${headFade * 0.2})`;
            ctx!.beginPath();
            ctx!.arc(dispX[headIdx]!, dispY[headIdx]!, 2.5, 0, Math.PI * 2);
            ctx!.fill();

            // Spark lines to nearby particles (25% chance each, for a flickering effect)
            const headP = particles[headIdx]!;
            const sparkRadSq = connectionRadius * connectionRadius;
            grid.forEachNear(headP.x, headP.y, connectionRadius, pad, (k) => {
              if (k === headIdx) return;
              const pk = particles[k]!;
              const dx = pk.x - headP.x, dy = pk.y - headP.y;
              if (dx * dx + dy * dy > sparkRadSq) return;
              if (Math.random() < 0.15) {
                ctx!.strokeStyle = `rgba(${rgb},${headFade * 0.15})`;
                ctx!.lineWidth = 0.7;
                ctx!.beginPath();
                ctx!.moveTo(dispX[headIdx]!, dispY[headIdx]!);
                ctx!.lineTo(dispX[k]!, dispY[k]!);
                ctx!.stroke();
              }
            });
          }
        }

        // Reset composite mode and shadow
        ctx!.globalCompositeOperation = "source-over";
        ctx!.shadowBlur = 0;
        ctx!.shadowColor = "transparent";
      }
    } // end drawFrame

    // ─── Mouse event handlers ──────────────────────────────────────────────

    /**
     * On each mouse move, find the nearest particle and append it to the trail.
     * Uses spatial grid for O(nearby) lookup instead of scanning all particles.
     */
    function handleMouseMove(e: MouseEvent) {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      const particles = particlesRef.current;
      const grid = gridRef.current;
      if (particles.length === 0 || !grid) return;

      // Find nearest particle using spatial grid
      let bestIdx = 0, bestDist = Infinity;
      const searchRadius = particleSpacing * 2;
      const pad = padRef.current;
      grid.forEachNear(e.clientX, e.clientY, searchRadius, pad, (i) => {
        const p = particles[i]!;
        const dx = p.x - e.clientX, dy = p.y - e.clientY;
        const d = dx * dx + dy * dy;
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      });

      // Fallback: if grid search found nothing (mouse far from any cell), brute force
      if (bestDist === Infinity) {
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i]!;
          const dx = p.x - e.clientX, dy = p.y - e.clientY;
          const d = dx * dx + dy * dy;
          if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
      }

      const trail = trailRef.current;
      const last = trail[trail.length - 1];
      if (!last || last.particleIdx !== bestIdx) {
        trail.push({ particleIdx: bestIdx, time: performance.now() });
        if (trail.length > MAX_TRAIL_LENGTH) {
          trailRef.current = trail.slice(trail.length - MAX_TRAIL_LENGTH);
        }
      }
    }

    function handleMouseLeave() { mouseRef.current = null; }

    // Always register mouse listeners so they're available if reduced-motion toggles off
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);

    // ─── Start loop or draw static frame ───────────────────────────────────
    if (reducedMotionRef.current) {
      drawFrame(true);
    } else {
      rafIdRef.current = requestAnimationFrame(loop);
    }

    // ─── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      if (rafIdRef.current) { cancelAnimationFrame(rafIdRef.current); rafIdRef.current = 0; }
      if (motionQuery) motionQuery.removeEventListener("change", handleMotionChange);
      if (ro) ro.disconnect(); else window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [particleSpacing, connectionRadius, maxConnections, driftSpeed, visibleFraction, disturbRadius, disturbStrength, springBack, trailDurationMs]);

  return (
    <canvas ref={canvasRef} aria-hidden="true" role="presentation"
      style={{
        position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none",
      }} />
  );
}
