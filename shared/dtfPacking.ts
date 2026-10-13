export type DtfRectangle = { width: number; height: number; quantity: number };
type Rect = { x: number; y: number; width: number; height: number };
export type DtfLayout = { repeat: number; rectangles: Rect[] };
const EPS = 1e-8;
const contains = (a: Rect, b: Rect) => a.x <= b.x + EPS && a.y <= b.y + EPS && a.x + a.width >= b.x + b.width - EPS && a.y + a.height >= b.y + b.height - EPS;

// Free rectangles may overlap each other, but every occupied rectangle is split
// out of ALL intersecting free spaces. Consequently placed artwork never overlaps.
function splitFree(free: Rect[], used: Rect): Rect[] {
  const next: Rect[] = [];
  for (const r of free) {
    const right = r.x + r.width, bottom = r.y + r.height;
    const uRight = used.x + used.width, uBottom = used.y + used.height;
    if (used.x >= right - EPS || uRight <= r.x + EPS || used.y >= bottom - EPS || uBottom <= r.y + EPS) { next.push(r); continue; }
    if (used.x > r.x + EPS) next.push({ ...r, width: used.x - r.x });
    if (uRight < right - EPS) next.push({ ...r, x: uRight, width: right - uRight });
    if (used.y > r.y + EPS) next.push({ ...r, height: used.y - r.y });
    if (uBottom < bottom - EPS) next.push({ ...r, y: uBottom, height: bottom - uBottom });
  }
  return next.filter((r,i) => !next.some((other,j) => i !== j && contains(other,r) && (!contains(r,other) || j < i)));
}

/** Deterministic mixed-size packing with rotation and a gap between artwork.
 * Bounded search, not an optimality proof: returning null requires manual review.
 * Repeating full-sheet patterns handles large quantities without expanding copies.
 */
export function packDtf(rectangles: DtfRectangle[], width: number, height: number, gap: number) {
  if (![width,height,gap].every(Number.isFinite) || width <= 0 || height <= 0 || gap < 0) return null;
  const groups = new Map<string,DtfRectangle>();
  for (const r of rectangles) {
    if (![r.width,r.height].every(v => Number.isFinite(v) && v > 0) || !Number.isInteger(r.quantity) || r.quantity < 1) return null;
    if (!((r.width <= width + EPS && r.height <= height + EPS) || (r.height <= width + EPS && r.width <= height + EPS))) return null;
    const [w,h] = [r.width,r.height].sort((a,b) => a-b), key = `${w}x${h}`;
    const existing = groups.get(key);
    groups.set(key,{width:w,height:h,quantity:(existing?.quantity || 0) + r.quantity});
  }
  if (!groups.size) return { sheets: 0, layouts: [] as DtfLayout[], previewComplete: true };
  let best: { sheets: number; layouts: DtfLayout[]; previewComplete: boolean } | null = null;
  // Different deterministic sort/fit strategies improve mixed layouts without
  // assuming that equal total area implies a physically possible arrangement.
  for (const strategy of [0,1,2]) {
    const sorted = [...groups.values()].sort((a,b) => strategy === 1
      ? b.height-a.height || b.width-a.width
      : b.width*b.height-a.width*a.height || b.height-a.height || b.width-a.width);
    const remaining = sorted.map(r => r.quantity);
    const layouts: DtfLayout[] = [];
    let sheets = 0, operations = 0, previewCount = 0, previewComplete = true, aborted = false;
    while (remaining.some(q => q > 0)) {
      let free: Rect[] = [{x:0,y:0,width:width+gap,height:height+gap}];
      const placed: Rect[] = [], consumed = sorted.map(() => 0);
      for (let i=0;i<sorted.length;i++) {
        const r = sorted[i];
        while (remaining[i] > 0) {
          let choice: { rect: Rect; score: number; tie: number } | null = null;
          candidateSearch: for (const f of free) for (const [w,h] of [[r.width+gap,r.height+gap],[r.height+gap,r.width+gap]]) {
            if (++operations > 2000000) { aborted=true; break candidateSearch; }
            if (w > f.width + EPS || h > f.height + EPS) continue;
            const score = strategy === 2 ? f.y + h : Math.min(f.width-w,f.height-h);
            const tie = strategy === 2 ? f.x : Math.max(f.width-w,f.height-h);
            if (!choice || score < choice.score - EPS || (Math.abs(score-choice.score) < EPS && tie < choice.tie)) choice={rect:{x:f.x,y:f.y,width:w,height:h},score,tie};
          }
          if (aborted || !choice) break;
          free=splitFree(free,choice.rect);
          if (free.length > 1000) { aborted=true; break; }
          placed.push({...choice.rect,width:choice.rect.width-gap,height:choice.rect.height-gap});
          remaining[i]--; consumed[i]++;
        }
        if (aborted) break;
      }
      if (aborted || !placed.length) { aborted=true; break; }
      const extraRepeats = Math.min(...consumed.flatMap((count,i) => count ? [Math.floor(remaining[i]/count)] : []));
      const repeat = 1 + extraRepeats;
      remaining.forEach((_,i) => { remaining[i] -= consumed[i]*extraRepeats; });
      sheets += repeat;
      if (previewCount + placed.length <= 1500 && layouts.length < 30) { layouts.push({repeat,rectangles:placed}); previewCount += placed.length; }
      else previewComplete=false;
    }
    if (!aborted && (!best || sheets < best.sheets)) best={sheets,layouts,previewComplete};
  }
  return best;
}
