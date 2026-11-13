import { RES } from './constants';
import { expansionOf } from './config';
import { rand, randInt, shuffle } from './rng';
import type { Board, Config, Edge, MapConfig, Port, Res, Rng, SeaTile, ShapeId, Tile, TileKind, Vertex } from './types';

/** axial hex coordinates [q, r] */
type Hex = [number, number];

const SQ3 = Math.sqrt(3);
const DIRS: Hex[] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const hk = (q: number, r: number): string => q + ',' + r;
export const hexCenter = (q: number, r: number) => ({ x: SQ3 * (q + r / 2), y: 1.5 * r });
const hexDist = (a: Hex, b: Hex): number => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[0] + a[1] - b[0] - b[1])) / 2;

function corner(q: number, r: number, i: number) {
  const c = hexCenter(q, r);
  const a = (Math.PI / 180) * (60 * i - 30);
  return { x: c.x + Math.cos(a), y: c.y + Math.sin(a) };
}
const pkey = (p: { x: number; y: number }): string => Math.round(p.x * 1000) + ',' + Math.round(p.y * 1000);

// ---------- shapes ----------
export function hexagon(R: number): Hex[] {
  const out: Hex[] = [];
  for (let q = -R; q <= R; q++)
    for (let r = Math.max(-R, -q - R); r <= Math.min(R, -q + R); r++) out.push([q, r]);
  return out;
}

function rows(counts: number[]): Hex[] {
  const out: Hex[] = [];
  const half = Math.floor(counts.length / 2);
  counts.forEach((c, i) => {
    const r = i - half;
    const qmin = -Math.floor((c - 1 + r) / 2);
    for (let k = 0; k < c; k++) out.push([qmin + k, r]);
  });
  return out;
}

function neighborsOf([q, r]: Hex): Hex[] {
  return DIRS.map(([dq, dr]) => [q + dq, r + dr]);
}

function weightedPick<T>(rng: Rng, items: T[], w: (it: T) => number): T {
  const tot = items.reduce((a, it) => a + w(it), 0);
  let x = rand(rng) * tot;
  for (const it of items) {
    x -= w(it);
    if (x <= 0) return it;
  }
  return items[items.length - 1]!;
}

// Random compact continent grown from the center.
function blob(rng: Rng, n: number): Hex[] {
  const set = new Map<string, Hex>([[hk(0, 0), [0, 0]]]);
  while (set.size < n) {
    const cands = new Map<string, [number, number, number]>();
    for (const h of set.values())
      for (const nb of neighborsOf(h)) {
        const k = hk(...nb);
        if (set.has(k)) continue;
        const c: [number, number, number] = cands.get(k) || [nb[0], nb[1], 0];
        c[2]++;
        cands.set(k, c);
      }
    const c = weightedPick(rng, [...cands.values()], c => c[2] ** 3);
    set.set(hk(c[0], c[1]), [c[0], c[1]]);
  }
  return [...set.values()];
}

export function pixelToHex(x: number, y: number): Hex {
  const q = (SQ3 / 3) * x - y / 3;
  const r = (2 / 3) * y;
  let rx = Math.round(q), rz = Math.round(r), ry = Math.round(-q - r);
  const dx = Math.abs(rx - q), dz = Math.abs(rz - r), dy = Math.abs(ry + q + r);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dz > dy) rz = -rx - ry;
  return [rx, rz];
}

// Several islands separated by at least one sea hex.
function islands(rng: Rng, n: number, k: number, radA = 1.9, radB = 1.4): Hex[] {
  const size = Math.ceil(n / k);
  const rad = radA * Math.sqrt(size) + radB;
  const off = rand(rng) * Math.PI * 2;
  const owner = new Map<string, number>();
  const isl: Hex[][] = [];
  for (let i = 0; i < k; i++) {
    const a = off + (i / k) * Math.PI * 2;
    const c = pixelToHex(Math.cos(a) * rad * (k > 1 ? 1 : 0), Math.sin(a) * rad * (k > 1 ? 1 : 0));
    isl.push([c]);
    owner.set(hk(...c), i);
  }
  let total = k;
  let stuck = 0;
  while (total < n && stuck < k * 4) {
    let grew = false;
    for (let i = 0; i < k && total < n; i++) {
      const cands: [Hex, number][] = [];
      for (const h of isl[i]!)
        for (const nb of neighborsOf(h)) {
          const kk = hk(...nb);
          if (owner.has(kk)) continue;
          // must not touch any other island
          if (neighborsOf(nb).some(x => owner.has(hk(...x)) && owner.get(hk(...x)) !== i)) continue;
          const touching = neighborsOf(nb).filter(x => owner.get(hk(...x)) === i).length;
          cands.push([nb, touching]);
        }
      if (!cands.length) continue;
      const [nb] = weightedPick(rng, cands, c => c[1] ** 3);
      owner.set(hk(...nb), i);
      isl[i]!.push(nb);
      total++;
      grew = true;
    }
    stuck = grew ? 0 : stuck + 1;
  }
  return isl.flat();
}

/** Land hexes wanted by the Seafarers-only shapes: never fewer than what the players need. */
export function seaMapSize(shape: ShapeId, np: number): number {
  return shape === 'mainland' ? 14 + 4 * np : 7 * seaIslandCount(np);
}
const seaIslandCount = (np: number): number => (np <= 4 ? 4 : np <= 6 ? 5 : 6);

/** Several medium islands only 1-2 sea hexes apart, so a ship or two can cross. */
function seaIslands(rng: Rng, n: number, np: number): Hex[] {
  const k = seaIslandCount(np);
  return islands(rng, Math.max(n, seaMapSize('seaIslands', np)), k, 1.45, 1.3);
}

/** One big home island (first hexes of the result) plus small islands 1-2 sea hexes away. */
function mainland(rng: Rng, n: number, np: number): Hex[] {
  const total = Math.max(n, seaMapSize('mainland', np));
  const homeN = Math.round(total * 0.62);
  const home = blob(rng, homeN);
  const smallK = np <= 3 ? 3 : np <= 5 ? 4 : np <= 6 ? 5 : 6;
  const owner = new Map<string, number>(home.map((h, i) => [hk(...h), 0] as [string, number]));
  const isl: Hex[][] = [home];
  const distTo = (h: Hex, set: Hex[]) => Math.min(...set.map(o => hexDist(h, o)));
  const off = rand(rng) * Math.PI * 2;
  let left = total - homeN;
  for (let i = 0; i < smallK; i++) {
    const want = Math.max(2, Math.min(5, Math.round(left / (smallK - i) + (rand(rng) - 0.5) * 2.4)));
    const cands: Hex[] = [];
    const R = 12;
    for (const h of hexagon(R)) {
      if (owner.has(hk(...h))) continue;
      if (neighborsOf(h).some(x => owner.has(hk(...x)))) continue;
      const d = distTo(h, home);
      if (d < 2 || d > 3) continue;
      if (isl.slice(1).some(o => distTo(h, o) < 3)) continue;
      cands.push(h);
    }
    if (!cands.length) break;
    const a = off + (i / smallK) * Math.PI * 2;
    const c = hexCenter(0, 0);
    const score = (h: Hex) => {
      const p = hexCenter(h[0], h[1]);
      return Math.abs(Math.atan2(p.y - c.y, p.x - c.x) - a + Math.PI * 4) % (Math.PI * 2);
    };
    const ang = (h: Hex) => { const v = score(h); return Math.min(v, Math.PI * 2 - v); };
    const best = cands.map(h => [h, ang(h)] as [Hex, number]).sort((x, y) => x[1] - y[1]).slice(0, 4);
    const seed = best[randInt(rng, best.length)]![0];
    const me = [seed];
    owner.set(hk(...seed), i + 1);
    while (me.length < want) {
      const gc: [Hex, number][] = [];
      for (const h of me)
        for (const nb of neighborsOf(h)) {
          const kk = hk(...nb);
          if (owner.has(kk)) continue;
          if (neighborsOf(nb).some(x => owner.has(hk(...x)) && owner.get(hk(...x)) !== i + 1)) continue;
          gc.push([nb, neighborsOf(nb).filter(x => owner.get(hk(...x)) === i + 1).length]);
        }
      if (!gc.length) break;
      const [nb] = weightedPick(rng, gc, g => g[1] ** 2);
      if (owner.has(hk(...nb))) continue;
      owner.set(hk(...nb), i + 1);
      me.push(nb);
    }
    isl.push(me);
    left -= me.length;
  }
  return isl.flat();
}

interface ShapeDef {
  name: string;
  desc: string;
  random?: boolean;
  /** Seafarers-only shape */
  sea?: boolean;
  /** the island of the first hex is the only one where setup is allowed */
  homeFirst?: boolean;
  gen: (rng: Rng, m: MapConfig, np: number) => Hex[];
}

export const SHAPES: Record<ShapeId, ShapeDef> = {
  classic: { name: 'Cổ điển', desc: 'Bàn cờ quen thuộc: 19 ô.', gen: () => hexagon(2) },
  mini: { name: 'Mini', desc: '14 ô. Đấu nhanh cho 2-3 người.', gen: () => rows([2, 3, 4, 3, 2]) },
  extended: { name: 'Mở rộng', desc: '30 ô, dành cho 5-6 người.', gen: () => rows([3, 4, 5, 6, 5, 4, 3]) },
  big: { name: 'Lớn', desc: '37 ô, cho những ván dài.', gen: () => hexagon(3) },
  huge: { name: 'Khổng lồ', desc: '61 ô. Nguyên cả một lục địa.', gen: () => hexagon(4) },
  ring: {
    name: 'Vòng Hồ', desc: 'Một vòng đất bao quanh hồ ở giữa, có cảng.',
    gen: () => hexagon(3).filter(h => hexDist(h, [0, 0]) > 1),
  },
  star: {
    name: 'Ngôi sao', desc: 'Lục giác sáu cánh: tranh giành ở các mũi.',
    gen: (): Hex[] => [...hexagon(2), ...DIRS.map(([q, r]): Hex => [q * 3, r * 3]), ...DIRS.map(([q, r], i): Hex => {
      const [q2, r2] = DIRS[(i + 1) % 6]!;
      return [q * 2 + q2, r * 2 + r2];
    })].filter((h, i, arr) => arr.findIndex(o => o[0] === h[0] && o[1] === h[1]) === i),
  },
  kingdoms: {
    name: 'Hai Vương Quốc', desc: 'Hai nửa nối với nhau bằng hai dải đất.',
    gen: () => hexagon(3).filter(([q, r]) => r !== 0 || q === -1 || q === 1),
  },
  islands: {
    name: 'Quần đảo', desc: 'Các đảo cách nhau bởi biển. Hãy chọn kỹ chỗ bắt đầu.', random: true,
    gen: (rng, m, np) => islands(rng, m.size || 26, np > 4 ? 4 : 3),
  },
  pangea: {
    name: 'Lục địa ngẫu nhiên', desc: 'Một lục địa có hình dạng ngẫu nhiên. Tùy chỉnh được kích thước.', random: true,
    gen: (rng, m) => blob(rng, m.size || 24),
  },
  seaIslands: {
    name: 'Quần đảo biển', desc: 'Vài hòn đảo vừa, cách nhau một hai ô biển. Bắt đầu ở đảo nào cũng được, rồi đóng tàu sang đảo khác.', random: true, sea: true,
    gen: (rng, m, np) => seaIslands(rng, m.size || 0, np),
  },
  mainland: {
    name: 'Đảo chính & đảo nhỏ', desc: 'Một đảo lớn để xuất phát, quanh đó là các đảo nhỏ cần tàu. Ô vàng nằm ở đảo nhỏ.', random: true, sea: true, homeFirst: true,
    gen: (rng, m, np) => mainland(rng, m.size || 0, np),
  },
  custom: { name: 'Tự tạo', desc: 'Bản đồ làm bằng trình chỉnh sửa.', gen: () => hexagon(2) },
};

// ---------- resources & numbers ----------
const RES_WEIGHT: Record<Res, number> = { wood: 4, brick: 3, sheep: 4, wheat: 4, ore: 3 };

function balancedResources(rng: Rng, count: number): Res[] {
  const total = 18;
  const alloc = RES.map(r => {
    const exact = (count * RES_WEIGHT[r]) / total;
    return { r, n: Math.floor(exact), frac: exact - Math.floor(exact) + rand(rng) * 1e-3 };
  });
  let left = count - alloc.reduce((a, x) => a + x.n, 0);
  alloc.sort((a, b) => b.frac - a.frac);
  for (let i = 0; left > 0; i = (i + 1) % alloc.length, left--) alloc[i]!.n++;
  const out: Res[] = [];
  for (const a of alloc) for (let i = 0; i < a.n; i++) out.push(a.r);
  return shuffle(rng, out);
}

function chaosResources(rng: Rng, count: number): Res[] {
  const out: Res[] = [];
  for (let i = 0; i < count; i++) out.push(i < 5 && count >= 5 ? RES[i]! : RES[randInt(rng, 5)]!);
  return shuffle(rng, out);
}

const BASE_TOKENS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const EXTRA_ORDER = [5, 9, 4, 10, 6, 8, 3, 11, 5, 9, 4, 10, 2, 12, 6, 8, 3, 11];

function genTokens(k: number): number[] {
  const out: number[] = [];
  while (out.length + BASE_TOKENS.length <= k) out.push(...BASE_TOKENS);
  for (let i = 0; out.length < k; i++) out.push(EXTRA_ORDER[i % EXTRA_ORDER.length]!);
  return out;
}

function adjacencyViolations(tiles: Tile[], adj: number[][]) {
  let bad = 0;
  const per: number[] = new Array(tiles.length).fill(0);
  for (let i = 0; i < tiles.length; i++) {
    const a = tiles[i]!.num;
    if (!a) continue;
    for (const j of adj[i]!) {
      if (j < i) continue;
      const b = tiles[j]!.num;
      if (!b) continue;
      const red = (a === 6 || a === 8) && (b === 6 || b === 8);
      if (red || a === b) {
        bad++;
        per[i]!++;
        per[j]!++;
      }
    }
  }
  return { bad, per };
}

// Place tokens trying to avoid adjacent 6/8 and equal numbers (hill climbing).
function placeNumbers(rng: Rng, tiles: Tile[], adj: number[][], movable: number[], balanced: boolean) {
  if (!balanced || movable.length < 2) return;
  let { bad, per } = adjacencyViolations(tiles, adj);
  for (let it = 0; it < 4000 && bad > 0; it++) {
    const offenders = movable.filter(i => per[i]! > 0);
    const a = (offenders.length ? offenders[randInt(rng, offenders.length)] : movable[randInt(rng, movable.length)])!;
    const b = movable[randInt(rng, movable.length)]!;
    if (a === b) continue;
    [tiles[a]!.num, tiles[b]!.num] = [tiles[b]!.num, tiles[a]!.num];
    const next = adjacencyViolations(tiles, adj);
    if (next.bad <= bad || rand(rng) < 0.02) {
      bad = next.bad;
      per = next.per;
    } else {
      [tiles[a]!.num, tiles[b]!.num] = [tiles[b]!.num, tiles[a]!.num];
    }
  }
}

// ---------- full board ----------
/** An edge where a ship may sit: touches sea and is not on the outer frame (both sides are tiles). */
export function isShipEdge(board: Board, e: Edge): boolean {
  const sea = e.sea?.length ?? 0;
  return sea >= 1 && e.hexes.length + sea === 2;
}

export function generateBoard(config: Config, rng: Rng): Board {
  const m = config.map;
  const np = config.players.length;
  let coords: Hex[];
  let fixed: NonNullable<MapConfig['custom']>['tiles'] | null = null;
  if (m.shape === 'custom' && m.custom && m.custom.tiles && m.custom.tiles.length >= 3) {
    fixed = m.custom.tiles;
    coords = fixed.map(t => [t.q, t.r]);
  } else {
    coords = (SHAPES[m.shape] || SHAPES.classic).gen(rng, m, np);
  }
  const N = coords.length;
  // `res` starts as null and is assigned for every tile below (custom hand-painted maps count the
  // tiles that already have a kind while resources are still being dealt)
  const tiles: Tile[] = coords.map(([q, r], i) => ({ id: i, q, r, ...hexCenter(q, r), kind: 'land' as const, res: null as unknown as TileKind, num: null, verts: [] as number[], revealed: true, numRevealed: true }));
  const index = new Map(tiles.map(t => [hk(t.q, t.r), t.id]));
  const adj = tiles.map(t => neighborsOf([t.q, t.r]).map(h => index.get(hk(...h))).filter((x): x is number => x !== undefined));

  // Seafarers: islands = connected components of land hexes (tile 0's island is index 0)
  const seafarers = expansionOf(config) === 'seafarers';
  if (seafarers) {
    let comp = 0;
    for (const t of tiles) {
      if (t.island !== undefined) continue;
      t.island = comp;
      const stack = [t.id];
      while (stack.length) for (const j of adj[stack.pop()!]!) if (tiles[j]!.island === undefined) { tiles[j]!.island = comp; stack.push(j); }
      comp++;
    }
  }
  const homeOnly = seafarers && !fixed && !!SHAPES[m.shape]?.homeFirst;

  // resources
  const free: number[] = [];
  tiles.forEach((t, i) => {
    const f = fixed && fixed[i];
    if (f && f.res && f.res !== 'random') t.res = f.res;
    else free.push(i);
  });
  let deserts = m.deserts === 'auto' || m.deserts == null ? Math.max(1, Math.round(N / 19)) : +m.deserts;
  let gold = +m.gold || 0;
  if (fixed) {
    // on custom maps deserts/gold painted by hand count towards the totals
    deserts = Math.max(0, deserts - tiles.filter(t => t.res === 'desert').length);
    gold = Math.max(0, gold - tiles.filter(t => t.res === 'gold').length);
  }
  deserts = Math.min(deserts, free.length);
  gold = Math.min(gold, free.length - deserts);
  shuffle(rng, free);
  const pool: TileKind[] = [];
  for (let i = 0; i < deserts; i++) pool.push('desert');
  for (let i = 0; i < gold; i++) pool.push('gold');
  const rest = free.length - pool.length;
  pool.push(...(m.resources === 'chaos' ? chaosResources(rng, rest) : balancedResources(rng, rest)));
  shuffle(rng, pool);
  free.forEach((ti, k) => (tiles[ti]!.res = pool[k]!));
  if (homeOnly) {
    // swaps only: the resource counts stay balanced. Desert on the home island, gold away from it.
    const isHome = (t: Tile) => t.island === 0;
    const swap = (a: Tile, b: Tile) => { const x = a.res; a.res = b.res; b.res = x; };
    for (const kind of ['desert', 'gold'] as const) {
      const wantHome = kind === 'desert';
      for (const t of tiles) {
        if (t.res !== kind || isHome(t) === wantHome) continue;
        const to = tiles.find(o => isHome(o) === wantHome && o.res !== 'desert' && o.res !== 'gold');
        if (to) swap(t, to);
      }
    }
  }

  // numbers
  const needNum: number[] = [];
  tiles.forEach((t, i) => {
    if (t.res === 'desert') return;
    const f = fixed && fixed[i];
    if (f && f.num) t.num = f.num;
    else needNum.push(i);
  });
  const tokens = shuffle(rng, genTokens(needNum.length));
  needNum.forEach((ti, k) => (tiles[ti]!.num = tokens[k]!));
  placeNumbers(rng, tiles, adj, needNum, m.numbers !== 'random');

  // sea ring (visual only in the base game; 2 hexes wide and playable in Seafarers)
  const seaKeys = new Map<string, Hex>();
  for (const t of tiles)
    for (const nb of neighborsOf([t.q, t.r])) {
      const k = hk(...nb);
      if (!index.has(k) && !seaKeys.has(k)) seaKeys.set(k, nb);
    }
  if (seafarers) {
    // second ring: no RNG involved, so land generation is identical to the base game
    for (const h of Array.from(seaKeys.values()))
      for (const nb of neighborsOf(h)) {
        const k = hk(...nb);
        if (!index.has(k) && !seaKeys.has(k)) seaKeys.set(k, nb);
      }
  }
  const sea: SeaTile[] = [...seaKeys.values()].map(([q, r], i) => (seafarers ? { id: i, q, r, ...hexCenter(q, r), verts: [] as number[] } : { q, r, ...hexCenter(q, r) }));

  // vertices & edges (land first so their ids match the base game; sea hexes follow)
  const vmap = new Map<string, number>();
  const vertices: Vertex[] = [];
  const emap = new Map<string, number>();
  const edges: Edge[] = [];
  const addCell = (q: number, r: number, id: number, verts: number[], isSea: boolean) => {
    for (let i = 0; i < 6; i++) {
      const p = corner(q, r, i);
      const k = pkey(p);
      let v = vmap.get(k);
      if (v === undefined) {
        v = vertices.length;
        vmap.set(k, v);
        vertices.push(seafarers ? { id: v, x: p.x, y: p.y, hexes: [], adj: [], edges: [], port: null, sea: [] } : { id: v, x: p.x, y: p.y, hexes: [], adj: [], edges: [], port: null });
      }
      if (isSea) vertices[v]!.sea!.push(id);
      else vertices[v]!.hexes.push(id);
      verts.push(v);
    }
    for (let i = 0; i < 6; i++) {
      const a = verts[i]!, b = verts[(i + 1) % 6]!;
      const k = a < b ? a + '-' + b : b + '-' + a;
      let e = emap.get(k);
      if (e === undefined) {
        e = edges.length;
        emap.set(k, e);
        edges.push(seafarers ? { id: e, a: Math.min(a, b), b: Math.max(a, b), hexes: [], sea: [] } : { id: e, a: Math.min(a, b), b: Math.max(a, b), hexes: [] });
        vertices[a]!.edges.push(e);
        vertices[b]!.edges.push(e);
        vertices[a]!.adj.push(b);
        vertices[b]!.adj.push(a);
      }
      if (isSea) edges[e]!.sea!.push(id);
      else edges[e]!.hexes.push(id);
    }
  };
  for (const t of tiles) addCell(t.q, t.r, t.id, t.verts, false);
  if (seafarers) for (const st of sea) addCell(st.q, st.r, st.id!, st.verts!, true);

  // ports on coastal edges
  const ports: Port[] = [];
  const cx = tiles.reduce((a, t) => a + t.x, 0) / N;
  const cy = tiles.reduce((a, t) => a + t.y, 0) / N;
  const coastal = edges
    .filter(e => e.hexes.length === 1)
    .map(e => {
      const va = vertices[e.a]!, vb = vertices[e.b]!;
      const mx = (va.x + vb.x) / 2, my = (va.y + vb.y) / 2;
      return { e, mx, my, ang: Math.atan2(my - cy, mx - cx) };
    })
    .sort((a, b) => a.ang - b.ang);
  const portDensity = { none: 0, few: 1 / 5, normal: 1 / 3.3, many: 1 / 2.2 }[m.ports || 'normal'] ?? 1 / 3.3;
  const nPorts = Math.min(Math.round(coastal.length * portDensity), Math.floor(coastal.length / 2));
  if (nPorts > 0) {
    const nSpecific = Math.round((nPorts * 5) / 9);
    const types: (Res | 'any')[] = [];
    const resOrder = shuffle(rng, [...RES]);
    for (let i = 0; i < nPorts; i++) types.push(i < nSpecific ? resOrder[i % 5]! : 'any');
    shuffle(rng, types);
    const step = coastal.length / nPorts;
    const start = rand(rng) * step;
    const used = new Set();
    for (let i = 0; i < nPorts; i++) {
      const base = Math.floor(start + i * step) % coastal.length;
      for (const d of [0, 1, -1, 2, -2]) {
        const c = coastal[(base + d + coastal.length) % coastal.length]!;
        if (used.has(c.e.a) || used.has(c.e.b)) continue;
        used.add(c.e.a);
        used.add(c.e.b);
        const land = tiles[c.e.hexes[0]!]!;
        let nx = c.mx - land.x, ny = c.my - land.y;
        const len = Math.hypot(nx, ny);
        nx /= len;
        ny /= len;
        const type = types[ports.length]!;
        const pid = ports.length;
        ports.push({ id: pid, edge: c.e.id, type, ratio: type === 'any' ? 3 : 2, x: c.mx + nx * 0.62, y: c.my + ny * 0.62, nx, ny });
        vertices[c.e.a]!.port = pid;
        vertices[c.e.b]!.port = pid;
        break;
      }
    }
  }

  const all = [...tiles, ...sea];
  const bounds = {
    minX: Math.min(...all.map(t => t.x)) - 1,
    maxX: Math.max(...all.map(t => t.x)) + 1,
    minY: Math.min(...all.map(t => t.y)) - 1.2,
    maxY: Math.max(...all.map(t => t.y)) + 1.2,
  };
  const desert = tiles.find(t => t.res === 'desert');
  const board: Board = { tiles, sea, vertices, edges, ports, bounds, robber: desert ? desert.id : -1 };
  if (homeOnly) board.homeIslands = [0];
  return board;
}
