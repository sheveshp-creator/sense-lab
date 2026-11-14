export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MatchOptions {
  /** A match needs IoU >= this, or a centre distance under maxCentreDist. */
  minIou: number;
  /** Max centre distance, as a fraction of the track box diagonal. */
  maxCentreDist: number;
}

export function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/** Bounding box of `count` (x, y, z) landmark triples starting at `offset`. */
export function boxFromLandmarks(
  lm: ArrayLike<number>,
  offset: number,
  count: number,
  out: Box,
): void {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = offset; i < offset + count * 3; i += 3) {
    const x = lm[i]!;
    const y = lm[i + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  out.x = minX;
  out.y = minY;
  out.w = maxX - minX;
  out.h = maxY - minY;
}

interface Pair {
  track: number;
  det: number;
  score: number;
}

/**
 * Greedy one-to-one matching of detections to tracks, best score first (IoU plus closeness).
 * Greedy is enough for a handful of objects. Fills outTrackForDet[d] with a track index or -1.
 * The pair list is allocated per call: at most 4x4 entries, so not worth pooling.
 */
export function matchBoxes(
  trackBoxes: readonly Box[],
  detBoxes: readonly Box[],
  detCount: number,
  opts: MatchOptions,
  outTrackForDet: number[],
): void {
  const pairs: Pair[] = [];
  for (let t = 0; t < trackBoxes.length; t++) {
    const tb = trackBoxes[t]!;
    const diag = Math.hypot(tb.w, tb.h) || 1;
    for (let d = 0; d < detCount; d++) {
      const db = detBoxes[d]!;
      const overlap = iou(tb, db);
      const dist =
        Math.hypot(tb.x + tb.w / 2 - (db.x + db.w / 2), tb.y + tb.h / 2 - (db.y + db.h / 2)) / diag;
      if (overlap >= opts.minIou || dist <= opts.maxCentreDist) {
        pairs.push({ track: t, det: d, score: overlap + (1 - Math.min(1, dist)) });
      }
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  for (let d = 0; d < detCount; d++) outTrackForDet[d] = -1;
  const trackTaken = new Set<number>();
  for (const p of pairs) {
    if (trackTaken.has(p.track) || outTrackForDet[p.det]! >= 0) continue;
    trackTaken.add(p.track);
    outTrackForDet[p.det] = p.track;
  }
}
