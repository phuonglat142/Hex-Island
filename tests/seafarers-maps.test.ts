// Seafarers wave 4: sea shapes, islands, home-island setup, gold placement, island bonus. Usage: pnpm test
import { test, expect } from 'vitest';
import * as G from '@engine/game';
import { defaultConfig, PLAYER_COLORS } from '@engine/config';
import { generateBoard, isShipEdge, SHAPES } from '@engine/board';
import { botAct } from '@engine/bot';
import type { Board, Config, ShapeId } from '@engine/types';

function cfg(shape: ShapeId, seed: number, sea: boolean, np = 4, gold = 0): Config {
  const c = defaultConfig();
  c.seed = seed;
  c.map.shape = shape;
  c.map.gold = gold;
  c.players = Array.from({ length: np }, (_, k) => ({ name: 'B' + k, kind: 'bot' as const, level: 'normal' as const, color: PLAYER_COLORS[k]! }));
  if (sea) c.rules.expansion = 'seafarers';
  return c;
}
const board = (c: Config): Board => generateBoard(c, { s: c.seed });
const NEW: ShapeId[] = ['seaIslands', 'mainland'];
const seeds = [1, 7, 42, 99, 1234];
const nIslands = (b: Board) => new Set(b.tiles.map(t => t.island)).size;

/** every island is linked to the others through connected ship edges */
function seaConnected(b: Board): boolean {
  const comp = new Map<number, number>();
  let c = 0;
  for (const v of b.vertices) {
    if (comp.has(v.id)) continue;
    const st = [v.id];
    comp.set(v.id, c);
    while (st.length) {
      const x = st.pop()!;
      for (const e of b.vertices[x]!.edges) {
        const E = b.edges[e]!;
        if (!isShipEdge(b, E)) continue;
        const y = E.a === x ? E.b : E.a;
        if (!comp.has(y)) { comp.set(y, c); st.push(y); }
      }
    }
    c++;
  }
  const parent: number[] = Array.from({ length: nIslands(b) }, (_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : find(parent[x]!));
  const byComp = new Map<number, Set<number>>();
  for (const v of b.vertices) {
    const h = v.hexes[0];
    if (h === undefined) continue;
    const k = comp.get(v.id)!;
    if (!byComp.has(k)) byComp.set(k, new Set());
    byComp.get(k)!.add(b.tiles[h]!.island!);
  }
  for (const set of byComp.values()) {
    const a = [...set];
    for (const x of a) parent[find(x)] = find(a[0]!);
  }
  return new Set(parent.map((_, i) => find(i))).size === 1;
}

test('new shapes: island count, separation, ship reachability for 2..8 players', () => {
  for (const shape of NEW)
    for (let np = 2; np <= 8; np++)
      for (const seed of seeds) {
        const b = board(cfg(shape, seed, true, np));
        const n = nIslands(b);
        if (shape === 'seaIslands') {
          expect(n).toBe(np <= 4 ? 4 : np <= 6 ? 5 : 6);
          const sizes = new Map<number, number>();
          for (const t of b.tiles) sizes.set(t.island!, (sizes.get(t.island!) ?? 0) + 1);
          for (const sz of sizes.values()) expect(sz).toBeGreaterThanOrEqual(3);
        } else {
          expect(n).toBeGreaterThanOrEqual(3);
          expect(n).toBeLessThanOrEqual(7);
          const home = b.tiles.filter(t => t.island === 0).length;
          expect(home / b.tiles.length).toBeGreaterThan(0.5);
          expect(home / b.tiles.length).toBeLessThan(0.75);
        }
        // islands never touch each other
        const at = new Map(b.tiles.map(t => [t.q + ',' + t.r, t]));
        for (const t of b.tiles)
          for (const [dq, dr] of [[1, 0], [0, 1], [-1, 1]] as const) {
            const o = at.get(t.q + dq + ',' + (t.r + dr));
            if (o) expect(o.island).toBe(t.island);
          }
        // every island has a neighbour island within 1-2 sea hexes (ships can hop in a few moves)
        const dist = (a: { q: number; r: number }, o: { q: number; r: number }) => (Math.abs(a.q - o.q) + Math.abs(a.r - o.r) + Math.abs(a.q + a.r - o.q - o.r)) / 2;
        for (let i = 0; i < n; i++) {
          const mine = b.tiles.filter(t => t.island === i);
          const rest = b.tiles.filter(t => t.island !== i);
          const near = Math.min(...mine.flatMap(a => rest.map(o => dist(a, o))));
          expect(near).toBeGreaterThanOrEqual(2);
          expect(near).toBeLessThanOrEqual(3);
        }
        expect(seaConnected(b), `${shape} np=${np} seed=${seed}`).toBe(true);
      }
});

test('mainland: setup only on the home island; seaIslands anywhere', () => {
  for (const seed of seeds) {
    const s = G.createGame(cfg('mainland', seed, true, 4));
    expect(s.board.homeIslands).toEqual([0]);
    const legal = G.legalSetupSettlements(s, 0);
    expect(legal.length).toBeGreaterThan(8);
    for (const v of legal) expect(s.board.vertices[v]!.hexes.some(h => s.board.tiles[h]!.island === 0)).toBe(true);
    const away = s.board.vertices.find(v => v.hexes.length > 0 && v.hexes.every(h => s.board.tiles[h]!.island !== 0))!;
    expect(G.canSetupSettlement(s, 0, away.id)).toBe(false);
    const sa = G.createGame(cfg('seaIslands', seed, true, 4));
    expect(sa.board.homeIslands).toBeUndefined();
    const seen = new Set(G.legalSetupSettlements(sa, 0).map(v => sa.board.tiles[sa.board.vertices[v]!.hexes[0]!]!.island));
    expect(seen.size).toBe(nIslands(sa.board));
  }
});

test('desert on the home island, gold on small islands', () => {
  for (const seed of seeds)
    for (const np of [3, 4, 6]) {
      const b = board(cfg('mainland', seed, true, np, 2));
      for (const t of b.tiles.filter(t => t.res === 'desert')) expect(t.island).toBe(0);
      const gold = b.tiles.filter(t => t.res === 'gold');
      expect(gold.length).toBe(2);
      for (const t of gold) expect(t.island).not.toBe(0);
    }
});

test('Tile.island and homeIslands exist only in seafarers; old shapes unchanged', () => {
  for (const shape of Object.keys(SHAPES).filter(k => k !== 'custom') as ShapeId[]) {
    const b = board(cfg(shape, 5, false));
    expect(b.tiles.every(t => t.island === undefined)).toBe(true);
    expect(b.homeIslands).toBeUndefined();
  }
  const a = board(cfg('islands', 9, false));
  const b = board(cfg('islands', 9, true));
  expect(b.tiles.map(t => [t.q, t.r, t.res, t.num])).toEqual(a.tiles.map(t => [t.q, t.r, t.res, t.num]));
  expect(b.homeIslands).toBeUndefined();
});

test('island bonus: +2 VP per foreign island, none for setup islands', () => {
  const c = cfg('seaIslands', 3, true, 3);
  c.rules.islandBonus = true;
  const s = G.createGame(c);
  const first = G.legalSetupSettlements(s, 0)[0]!;
  const homeIsl = s.board.tiles[s.board.vertices[first]!.hexes[0]!]!.island!;
  s.islandBonus = { 0: [homeIsl] };
  s.buildings[first] = { owner: 0, type: 'settlement' };
  const base = G.victoryPoints(s, 0);
  const foreign = s.board.vertices.find(v => v.hexes.length > 0 && s.board.tiles[v.hexes[0]!]!.island !== homeIsl)!;
  s.buildings[foreign.id] = { owner: 0, type: 'settlement' };
  expect(G.victoryPoints(s, 0)).toBe(base + 1 + 2);
  s.islandBonus = undefined;
  expect(G.victoryPoints(s, 0)).toBe(base + 1);
});

for (const shape of NEW)
  for (const bonus of [false, true])
    test(`bot games finish on ${shape}${bonus ? ' with island bonus' : ''}`, () => {
      for (const [seed, np] of [[5, 3], [11, 4]] as const) {
        const c = cfg(shape, seed, true, np, 2);
        c.rules.islandBonus = bonus;
        const s = G.createGame(c);
        let guard = 0;
        while (s.phase !== 'gameOver' && s.turn < 1500 && ++guard < 200000) {
          let acted = false;
          for (const pid of G.pendingActors(s)) {
            const a = botAct(s, pid);
            if (!a) continue;
            const r = G.applyAction(s, a);
            if (!r.ok) throw new Error(r.error);
            acted = true;
            break;
          }
          if (!acted) break;
        }
        expect(s.phase).toBe('gameOver');
      }
    }, 120000);
