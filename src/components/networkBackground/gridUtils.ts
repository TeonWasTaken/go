export interface GridNode {
  /** Unique index in the flat node array */
  id: number;
  /** Column in the hex grid */
  col: number;
  /** Row in the hex grid */
  row: number;
  /** Fixed base X position (hex layout) */
  baseX: number;
  /** Fixed base Y position (hex layout) */
  baseY: number;
  /** Current rendered X (baseX + displacement) */
  x: number;
  /** Current rendered Y (baseY + displacement) */
  y: number;
}

export interface MeshEdge {
  /** Index of first node (always the lower id) */
  a: number;
  /** Index of second node (always the higher id) */
  b: number;
}

/** A trail entry: node ID + timestamp */
export interface TrailEntry {
  nodeId: number;
  time: number;
}

export interface AnimationState {
  mouse: { x: number; y: number } | null;
  leaveTime: number | null;
  reducedMotion: boolean;
  degradedMode: boolean;
  degradedSince: number | null;
  frameTimes: number[];
  /** Rolling buffer of recent closest-node entries with timestamps, newest last */
  nodeTrail: TrailEntry[];
  /** Persistent jitter: maps trail index → swapped neighbor node ID */
  jitterMap: Map<number, number>;
}

export interface ThemeColors {
  /** Dark: rgba(255,255,255,0.15), Light: rgba(0,0,0,0.15) */
  dotColor: string;
  /** Dark: rgba(255,255,255,0.06), Light: rgba(0,0,0,0.06) */
  meshColor: string;
  /** Primary glow color (#0ea5e9 dark / muted variant light) */
  glowColor: string;
  /** Accent glow color (#e946a0) */
  accentGlow: string;
}

/**
 * Build a flat array of hex grid nodes filling the given canvas dimensions.
 * Uses honeycomb offset layout: odd rows are shifted right by half the spacing.
 */
export function buildHexGrid(
  width: number,
  height: number,
  spacing: number,
  padding = 2
): GridNode[] {
  const rowHeight = spacing * Math.sqrt(3) / 2;
  const cols = Math.floor(width / spacing) + 1 + padding * 2;
  const rows = Math.floor(height / rowHeight) + 1 + padding * 2;
  const offsetX = -padding * spacing;
  const offsetY = -padding * rowHeight;

  const nodes: GridNode[] = [];
  let id = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const baseX = offsetX + col * spacing + (row % 2 === 1 ? spacing / 2 : 0);
      const baseY = offsetY + row * rowHeight;
      nodes.push({ id, col, row, baseX, baseY, x: baseX, y: baseY });
      id++;
    }
  }

  return nodes;
}

/**
 * Build mesh edges connecting each hex grid node to its up to 6 hex neighbors.
 * Uses even/odd row neighbor offsets for honeycomb layout.
 * Edges are stored with canonical ordering (a < b) to guarantee deduplication.
 */
export function buildMeshEdges(
  nodes: GridNode[],
  cols: number,
  rows: number
): MeshEdge[] {
  const seen = new Set<string>();
  const edges: MeshEdge[] = [];

  for (const node of nodes) {
    const { col, row } = node;
    const isOdd = row % 2 === 1;

    // Neighbor offsets: [colOffset, rowOffset]
    const neighbors: [number, number][] = isOdd
      ? [
          [col + 1, row],     // East
          [col - 1, row],     // West
          [col + 1, row - 1], // NE
          [col, row - 1],     // NW
          [col + 1, row + 1], // SE
          [col, row + 1],     // SW
        ]
      : [
          [col + 1, row],     // East
          [col - 1, row],     // West
          [col, row - 1],     // NE
          [col - 1, row - 1], // NW
          [col, row + 1],     // SE
          [col - 1, row + 1], // SW
        ];

    const nodeId = node.id;

    for (const [nc, nr] of neighbors) {
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;

      const neighborId = nr * cols + nc;
      const a = Math.min(nodeId, neighborId);
      const b = Math.max(nodeId, neighborId);
      const key = `${a},${b}`;

      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ a, b });
      }
    }
  }

  return edges;
}

/**
 * Compute the gravity displacement for a single node toward the mouse cursor.
 * Uses cubic falloff for a wide, smooth gravity field.
 * strength = (1 - dist/radius)^3 — very gentle at the edges, strong up close.
 */
export function computeDisplacement(
  nodeBaseX: number,
  nodeBaseY: number,
  mouseX: number,
  mouseY: number,
  gravityRadius: number,
  maxDisplacement: number
): { dx: number; dy: number } {
  const diffX = mouseX - nodeBaseX;
  const diffY = mouseY - nodeBaseY;
  const dist = Math.sqrt(diffX * diffX + diffY * diffY);

  if (dist === 0 || dist > gravityRadius) {
    return { dx: 0, dy: 0 };
  }

  // Cubic falloff: very smooth at boundary, strong near center
  const t = 1 - dist / gravityRadius;
  const strength = t * t * t;
  const magnitude = Math.min(strength * maxDisplacement, maxDisplacement);
  const dx = (diffX / dist) * magnitude;
  const dy = (diffY / dist) * magnitude;
  return { dx, dy };
}

/**
 * Propagate signal illumination outward from seed edges via BFS through the adjacency map.
 *
 * Algorithm:
 * 1. Seed edges start at propagation level 0.
 * 2. For each level L (0..depth-1), find all neighbor edges of the current frontier
 *    that haven't been illuminated yet.
 * 3. Use rng() to randomly select a subset of those candidates (fork selection).
 * 4. Stop early if the total illuminated edge count reaches maxEdges.
 * 5. Build a node map: for each illuminated edge, both endpoint nodes get the
 *    minimum propagation level among their connected illuminated edges.
 *
 * @returns edges: Map<edgeIndex, propagationLevel>, nodes: Map<nodeId, propagationLevel>
 */
export function propagateSignal(
  seedEdgeIndices: number[],
  edges: MeshEdge[],
  adjacency: Map<number, number[]>,
  depth: number,
  maxEdges: number,
  rng: () => number
): {
  edges: Map<number, number>;
  nodes: Map<number, number>;
} {
  const illuminatedEdges = new Map<number, number>();

  // Seed edges at level 0, respecting maxEdges
  for (const idx of seedEdgeIndices) {
    if (illuminatedEdges.size >= maxEdges) break;
    if (!illuminatedEdges.has(idx)) {
      illuminatedEdges.set(idx, 0);
    }
  }

  // BFS: expand frontier level by level
  let frontier = [...illuminatedEdges.keys()];

  for (let level = 1; level <= depth; level++) {
    if (illuminatedEdges.size >= maxEdges || frontier.length === 0) break;

    // Collect candidate neighbor edges not yet illuminated
    const candidates: number[] = [];
    for (const edgeIdx of frontier) {
      const edge = edges[edgeIdx];
      if (!edge) continue;
      // Get neighbor edges through both endpoint nodes
      const neighborsA = adjacency.get(edge.a);
      const neighborsB = adjacency.get(edge.b);
      if (neighborsA) {
        for (const nIdx of neighborsA) {
          if (!illuminatedEdges.has(nIdx)) {
            candidates.push(nIdx);
          }
        }
      }
      if (neighborsB) {
        for (const nIdx of neighborsB) {
          if (!illuminatedEdges.has(nIdx)) {
            candidates.push(nIdx);
          }
        }
      }
    }

    // Deduplicate candidates
    const uniqueCandidates = [...new Set(candidates)];

    if (uniqueCandidates.length === 0) break;

    // Exponential drop-off fork selection: probability decreases with level
    // Level 1: ~60% chance per candidate, Level 2: ~36%, Level 3: ~22%, etc.
    // This creates varied-length forks — most are short, some reach far
    const keepProb = Math.pow(0.6, level);
    const selected: number[] = [];
    for (const cIdx of uniqueCandidates) {
      if (rng() < keepProb) {
        selected.push(cIdx);
      }
    }

    // If nothing was selected but we have candidates, pick at least one to keep propagation alive
    if (selected.length === 0 && uniqueCandidates.length > 0) {
      const pickIdx = Math.floor(rng() * uniqueCandidates.length);
      const pick = uniqueCandidates[Math.min(pickIdx, uniqueCandidates.length - 1)];
      if (pick !== undefined) selected.push(pick);
    }

    // Add selected edges at this level, respecting maxEdges
    const nextFrontier: number[] = [];
    for (const sIdx of selected) {
      if (illuminatedEdges.size >= maxEdges) break;
      if (!illuminatedEdges.has(sIdx)) {
        illuminatedEdges.set(sIdx, level);
        nextFrontier.push(sIdx);
      }
    }

    frontier = nextFrontier;
  }

  // Build node map: each endpoint of an illuminated edge gets the minimum level
  const illuminatedNodes = new Map<number, number>();
  for (const [edgeIdx, level] of illuminatedEdges) {
    const edge = edges[edgeIdx];
    if (!edge) continue;
    const currentA = illuminatedNodes.get(edge.a);
    if (currentA === undefined || level < currentA) {
      illuminatedNodes.set(edge.a, level);
    }
    const currentB = illuminatedNodes.get(edge.b);
    if (currentB === undefined || level < currentB) {
      illuminatedNodes.set(edge.b, level);
    }
  }

  return { edges: illuminatedEdges, nodes: illuminatedNodes };
}

/**
 * Compute illumination intensity for a given propagation level.
 * Returns a value in [0, 1] that monotonically decreases as level increases.
 * Level 0 yields the highest intensity (1.0), maxLevel yields the lowest (0.0).
 *
 * Uses a linear falloff: intensity = 1 - (clamped_level / maxLevel).
 */
export function levelIntensity(
  level: number,
  maxLevel: number
): number {
  if (maxLevel <= 0) return 1;
  // Clamp level to [0, maxLevel]
  const clamped = Math.max(0, Math.min(level, maxLevel));
  return 1 - clamped / maxLevel;
}

/**
 * Compute trail contribution factor for a given trail position.
 * Returns a value that linearly decays from 1.0 (newest, index 0) to 0.0 (oldest, index trailLength-1).
 * For trailLength of 1, always returns 1.0.
 */
export function trailFactor(
  trailIndex: number,
  trailLength: number
): number {
  if (trailLength <= 1) return 1;
  return 1 - trailIndex / (trailLength - 1);
}

/**
 * Determine whether the animation should degrade to static mode based on
 * rolling frame timestamps.
 *
 * Computes average FPS from the timestamp buffer:
 *   FPS = (count - 1) / ((last - first) / 1000)
 *
 * Returns `true` when the average FPS is below `threshold`.
 * Returns `false` if fewer than 2 timestamps are available (not enough data).
 */
export function shouldDegrade(
  frameTimestamps: number[],
  threshold: number
): boolean {
  if (frameTimestamps.length < 2) return false;

  const first = frameTimestamps[0]!;
  const last = frameTimestamps[frameTimestamps.length - 1]!;
  const elapsed = last - first;

  // If no time has elapsed, we can't compute FPS — don't degrade
  if (elapsed <= 0) return false;

  const fps = (frameTimestamps.length - 1) / (elapsed / 1000);
  return fps < threshold;
}

/**
 * Build an adjacency map from the edge list for O(1) neighbor-edge lookup.
 * For each edge at index `i`, adds `i` to the adjacency list of both `edge.a` and `edge.b`.
 */
export function buildAdjacencyMap(
  edges: MeshEdge[]
): Map<number, number[]> {
  const map = new Map<number, number[]>();

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    if (!edge) continue;
    const { a, b } = edge;

    let listA = map.get(a);
    if (listA === undefined) {
      listA = [];
      map.set(a, listA);
    }
    listA.push(i);

    let listB = map.get(b);
    if (listB === undefined) {
      listB = [];
      map.set(b, listB);
    }
    listB.push(i);
  }

  return map;
}

/**
 * Build a node-to-node adjacency map: for each node, the set of directly connected neighbor node IDs.
 */
export function buildNodeAdjacency(
  edges: MeshEdge[]
): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const { a, b } of edges) {
    let listA = map.get(a);
    if (!listA) { listA = []; map.set(a, listA); }
    listA.push(b);
    let listB = map.get(b);
    if (!listB) { listB = []; map.set(b, listB); }
    listB.push(a);
  }
  return map;
}

/**
 * Find the closest grid node to a given (x, y) position.
 */
export function findClosestNode(
  nodes: GridNode[],
  x: number,
  y: number
): number {
  let bestId = 0;
  let bestDist = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const dx = node.baseX - x;
    const dy = node.baseY - y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      bestId = i;
    }
  }
  return bestId;
}

/**
 * Advance the signal head toward the target node by up to `hopsPerFrame` steps
 * using a greedy walk (each step picks the neighbor closest to the target).
 * Returns the new signal head node ID.
 */
export function advanceSignalHead(
  headId: number,
  targetId: number,
  nodeAdj: Map<number, number[]>,
  nodes: GridNode[],
  hopsPerFrame: number
): number {
  if (headId === targetId) return headId;

  let current = headId;
  for (let hop = 0; hop < hopsPerFrame; hop++) {
    if (current === targetId) break;
    const neighbors = nodeAdj.get(current);
    if (!neighbors || neighbors.length === 0) break;

    // Greedy: pick the neighbor closest to target
    const tgt = nodes[targetId];
    if (!tgt) break;
    let bestN = current;
    let bestDist = Infinity;
    for (const n of neighbors) {
      const nn = nodes[n];
      if (!nn) continue;
      const dx = nn.baseX - tgt.baseX;
      const dy = nn.baseY - tgt.baseY;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; bestN = n; }
    }
    current = bestN;
  }
  return current;
}

/**
 * Biased random walk from startId toward endId on the mesh graph.
 * At each step, picks a neighbor with probability weighted by how much closer
 * it is to the target — but with randomness so the path jitters like an electric arc.
 * Re-rolling this each frame makes the arc "dance."
 */
export function findRandomPath(
  startId: number,
  endId: number,
  nodes: GridNode[],
  nodeAdj: Map<number, number[]>,
  maxSteps = 40
): number[] {
  if (startId === endId) return [startId];

  const path: number[] = [startId];
  const visited = new Set<number>([startId]);
  let current = startId;

  for (let step = 0; step < maxSteps; step++) {
    if (current === endId) break;

    const neighbors = nodeAdj.get(current);
    if (!neighbors || neighbors.length === 0) break;

    const candidates = neighbors.filter(n => n === endId || !visited.has(n));
    if (candidates.length === 0) break;

    let picked: number;
    if (Math.random() < 0.85 || candidates.length === 1) {
      // Greedy: pick the candidate closest to target
      const tgt = nodes[endId];
      if (!tgt) break;
      let bestDist = Infinity;
      picked = candidates[0]!;
      for (const cId of candidates) {
        const cn = nodes[cId];
        if (!cn) continue;
        const dx = cn.baseX - tgt.baseX;
        const dy = cn.baseY - tgt.baseY;
        const d = dx * dx + dy * dy;
        if (d < bestDist) { bestDist = d; picked = cId; }
      }
    } else {
      // Random: pick any candidate for a slight deviation
      picked = candidates[Math.floor(Math.random() * candidates.length)]!;
    }

    visited.add(picked);
    path.push(picked);
    current = picked;
  }

  return path;
}
