// Seafarers wave 1: expansion framework and the real sea board. Usage: pnpm test
import { test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import * as G from '@engine/game';
import { defaultConfig, expansionOf, PLAYER_COLORS } from '@engine/config';
import { generateBoard, isShipEdge, SHAPES } from '@engine/board';
import { botAct } from '@engine/bot';
import type { Config, GameState, ShapeId } from '@engine/types';

const shapes = Object.keys(SHAPES).filter(k => k !== 'custom') as ShapeId[];

function cfg(shape: ShapeId, seed: number, sea: boolean, np = 4): Config {
  const c = defaultConfig();
  c.seed = seed;
  c.map.shape = shape;
  c.players = Array.from({ length: np }, (_, k) => ({ name: 'B' + k, kind: 'bot' as const, level: 'normal' as const, color: PLAYER_COLORS[k]! }));
  if (sea) c.rules.expansion = 'seafarers';
  return c;
}
const board = (c: Config) => generateBoard(c, { s: c.seed });
const hash = (o: unknown) => createHash('sha256').update(JSON.stringify(o)).digest('hex');

test('missing expansion is base; defaultConfig does not write the field', () => {
  const c = defaultConfig();
  expect(expansionOf(c)).toBe('base');
  expect('expansion' in c.rules).toBe(false);
  c.rules.expansion = 'seafarers';
  expect(expansionOf(c)).toBe('seafarers');
});

test('base board: no sea ids, no sea vertices/edges', () => {
  for (const shape of shapes)
    for (const seed of [1, 42]) {
      const b = board(cfg(shape, seed, false));
      expect(b.sea.every(t => t.id === undefined && t.verts === undefined)).toBe(true);
      expect(b.vertices.every(v => v.sea === undefined && v.hexes.length >= 1)).toBe(true);
      expect(b.edges.every(e => e.sea === undefined && e.hexes.length >= 1)).toBe(true);
    }
});

test('seafarers board: land ids, tiles and ports identical to base (sea consumes no RNG)', () => {
  for (const shape of shapes)
    for (const seed of [1, 7, 42]) {
      const a = board(cfg(shape, seed, false));
      const b = board(cfg(shape, seed, true));
      expect(hash(b.tiles)).toBe(hash(a.tiles));
      expect(hash(b.ports)).toBe(hash(a.ports));
      expect(b.robber).toBe(a.robber);
      expect(b.vertices.length).toBeGreaterThan(a.vertices.length);
      for (let i = 0; i < a.vertices.length; i++) {
        const { sea: _s, adj: _a1, edges: _e1, ...rb } = b.vertices[i]!;
        const { adj: _a2, edges: _e2, ...ra } = a.vertices[i]!;
        expect(rb).toEqual(ra);
      }
      for (let i = 0; i < a.edges.length; i++) {
        const { sea: _s, ...rest } = b.edges[i]!;
        expect(rest).toEqual(a.edges[i]);
      }
      expect(b.sea.length).toBeGreaterThan(a.sea.length);
      b.sea.forEach((t, i) => {
        expect(t.id).toBe(i);
        expect(t.verts!.length).toBe(6);
      });
    }
});

test('seafarers board: sea hexes add vertices/edges with land-only hexes lists', () => {
  const b = board(cfg('islands', 5, true));
  expect(b.vertices.some(v => v.hexes.length === 0 && v.sea!.length > 0)).toBe(true);
  expect(b.edges.some(e => e.hexes.length === 0)).toBe(true);
  for (const v of b.vertices) expect(v.hexes.length + v.sea!.length).toBeGreaterThanOrEqual(1);
  for (const p of b.ports) expect(b.edges[p.edge]!.hexes.length).toBe(1);
  for (const t of b.sea) {
    expect(t.x).toBeGreaterThanOrEqual(b.bounds.minX);
    expect(t.x).toBeLessThanOrEqual(b.bounds.maxX);
  }
});

test('isShipEdge: coast and sea-sea edges yes, land-land and outer frame no', () => {
  const b = board(cfg('classic', 3, true));
  const coast = b.edges.filter(e => e.hexes.length === 1 && e.sea!.length === 1);
  const inner = b.edges.filter(e => e.hexes.length === 2);
  const seaSea = b.edges.filter(e => e.hexes.length === 0 && e.sea!.length === 2);
  const frame = b.edges.filter(e => e.hexes.length + e.sea!.length === 1);
  expect(coast.length).toBe(30);
  expect(coast.every(e => isShipEdge(b, e))).toBe(true);
  expect(seaSea.length).toBeGreaterThan(0);
  expect(seaSea.every(e => isShipEdge(b, e))).toBe(true);
  expect(inner.every(e => !isShipEdge(b, e))).toBe(true);
  expect(frame.length).toBeGreaterThan(0);
  expect(frame.every(e => !isShipEdge(b, e))).toBe(true);
  const base = board(cfg('classic', 3, false));
  expect(base.edges.some(e => isShipEdge(base, e))).toBe(false);
});

test('pure-sea vertices reject settlements, sea-only edges reject roads', () => {
  const s = G.createGame(cfg('islands', 11, true, 3));
  const seaV = s.board.vertices.find(v => v.hexes.length === 0)!;
  const seaE = s.board.edges.find(e => e.hexes.length === 0)!;
  expect(G.legalSetupSettlements(s, 0).includes(seaV.id)).toBe(false);
  expect(G.canSetupSettlement(s, 0, seaV.id)).toBe(false);
  const landV = s.board.vertices.find(v => v.hexes.length >= 1)!;
  expect(G.canSetupSettlement(s, 0, landV.id)).toBe(true);
  s.phase = 'main';
  s.setup.blindActive = false;
  s.buildings[seaE.a] = { owner: 0, type: 'settlement' };
  expect(G.canBuildRoad(s, 0, seaE.id)).toBe(false);
  expect(G.legalSettlements(s, 0).some(v => s.board.vertices[v]!.hexes.length === 0)).toBe(false);
});

test('seafarers createGame forces hidden-information modes off', () => {
  const c = cfg('islands', 2, true);
  c.modes.flipped = c.modes.fog = c.modes.blindfold = c.modes.hiddenNumbers = true;
  const s = G.createGame(c);
  expect([s.config.modes.flipped, s.config.modes.fog, s.config.modes.blindfold, s.config.modes.hiddenNumbers]).toEqual([false, false, false, false]);
  expect(G.vpTargetFor(s, 0)).toBe(s.config.rules.vpTarget);
});

function shipInvariants(s: GameState) {
  const ships = s.ships!;
  for (const p of s.players) {
    const mine = Object.keys(ships).filter(k => ships[k]!.owner === p.id);
    expect(p.shipsLeft! + mine.length).toBe(15);
    // every ship is connected to an own building, directly or through a chain of own ships
    const ok = new Set<string>();
    let grew = true;
    while (grew) {
      grew = false;
      for (const k of mine) {
        if (ok.has(k)) continue;
        const E = s.board.edges[+k]!;
        const linked = [E.a, E.b].some(v => {
          const b = s.buildings[v];
          if (b) return b.owner === p.id;
          return s.board.vertices[v]!.edges.some(x => ok.has(String(x)));
        });
        if (linked) { ok.add(k); grew = true; }
      }
    }
    expect(ok.size).toBe(mine.length);
  }
  for (const k in ships) {
    expect(isShipEdge(s.board, s.board.edges[+k]!)).toBe(true);
    expect(s.roads[k]).toBeUndefined();
  }
}

let builtShips = 0;
test('bot-vs-bot seafarers game on islands runs to completion', () => {
  for (const seed of [1, 2, 3]) {
    const s = G.createGame(cfg('islands', seed, true, 3 + (seed % 2)));
    let guard = 0;
    while (s.phase !== 'gameOver' && s.turn < 1500 && ++guard < 200000) {
      let acted = false;
      for (const pid of G.pendingActors(s)) {
        const a = botAct(s, pid);
        if (!a) continue;
        const r = G.applyAction(s, a);
        if (!r.ok) throw new Error(r.error);
        shipInvariants(s);
        if (a.type === 'build' && a.what === 'ship') builtShips++;
        acted = true;
        break;
      }
      if (!acted) break;
    }
    expect(s.phase).toBe('gameOver');
    for (const k in s.buildings) expect(s.board.vertices[+k]!.hexes.length).toBeGreaterThan(0);
    for (const k in s.roads) expect(s.board.edges[+k]!.hexes.length).toBeGreaterThan(0);
  }
  console.log('ships built by bots', builtShips);
});

// ---- wave 2: ships and longest trade route ----
function mainState(seed = 5, np = 3) {
  const s = G.createGame(cfg('islands', seed, true, np));
  s.phase = 'main';
  s.current = 0;
  s.setup.blindActive = false;
  s.players[0]!.res = { wood: 9, brick: 9, sheep: 9, wheat: 9, ore: 9 };
  return s;
}
/** a coastal vertex and a walk of `n` connected ship edges leaving it (optionally also touching a land-land edge) */
function shipWalk(s: GameState, n: number, needRoad = false) {
  const bd = s.board;
  for (const v of bd.vertices) {
    if (v.hexes.length === 0 || s.buildings[v.id]) continue;
    if (needRoad && !v.edges.some(e => bd.edges[e]!.hexes.length === 2)) continue;
    const path: number[] = [];
    const seen = new Set<number>([v.id]);
    let cur = v.id;
    while (path.length < n) {
      const e = bd.vertices[cur]!.edges.map(x => bd.edges[x]!).find(E => isShipEdge(bd, E) && !seen.has(E.a === cur ? E.b : E.a));
      if (!e) break;
      path.push(e.id);
      cur = e.a === cur ? e.b : e.a;
      seen.add(cur);
    }
    if (path.length === n) return { v: v.id, path };
  }
  throw new Error('no walk');
}
const shared = (s: GameState, a: number, b: number) => {
  const A = s.board.edges[a]!;
  const B = s.board.edges[b]!;
  return A.a === B.a || A.a === B.b ? A.a : A.b;
};

test('base game state has no ships fields', () => {
  const s = G.createGame(cfg('classic', 3, false));
  expect('ships' in s).toBe(false);
  expect(s.players.every(p => !('shipsLeft' in p))).toBe(true);
  expect(G.legalShips(s, 0)).toEqual([]);
});

test('ship needs own building or own ship; coast edge is road XOR ship', () => {
  const s = mainState();
  const { v, path } = shipWalk(s, 3);
  expect(G.canBuildShip(s, 0, path[0]!)).toBe(false);
  s.buildings[v] = { owner: 0, type: 'settlement' };
  expect(G.canBuildShip(s, 0, path[0]!)).toBe(true);
  expect(G.canBuildShip(s, 1, path[0]!)).toBe(false);
  expect(G.canBuildShip(s, 0, path[1]!)).toBe(false);
  expect(G.applyAction(s, { type: 'build', pid: 0, what: 'ship', at: path[0]! }).ok).toBe(true);
  expect(s.players[0]!.shipsLeft).toBe(14);
  expect(s.players[0]!.res).toMatchObject({ wood: 8, sheep: 8, brick: 9 });
  expect(G.canBuildShip(s, 0, path[1]!)).toBe(true);
  expect(G.canBuildRoad(s, 0, path[0]!)).toBe(false);
  expect(G.applyAction(s, { type: 'build', pid: 0, what: 'road', at: path[0]! }).ok).toBe(false);
  // no ship on an edge that holds a road
  s.roads[path[1]!] = 0;
  expect(G.canBuildShip(s, 0, path[1]!)).toBe(false);
});

test('opponent building blocks a ship chain; a road does not link a ship', () => {
  const s = mainState();
  const { path } = shipWalk(s, 3);
  const mid = shared(s, path[0]!, path[1]!);
  s.ships![path[0]!] = { owner: 0, built: 0 };
  expect(G.canBuildShip(s, 0, path[1]!)).toBe(true);
  s.buildings[mid] = { owner: 1, type: 'settlement' };
  expect(G.canBuildShip(s, 0, path[1]!)).toBe(false);
  delete s.buildings[mid];
  const s2 = mainState(7);
  const w = shipWalk(s2, 1, true);
  const v = s2.board.vertices[s2.board.edges[w.path[0]!]!.a === w.v ? s2.board.edges[w.path[0]!]!.a : s2.board.edges[w.path[0]!]!.b]!;
  s2.roads[v.edges.find(x => s2.board.edges[x]!.hexes.length === 2)!] = 0;
  expect(G.canBuildShip(s2, 0, w.path[0]!)).toBe(false);
});

test('settlement can be built next to an own ship', () => {
  const s = mainState();
  const { v, path } = shipWalk(s, 3);
  s.buildings[v] = { owner: 0, type: 'settlement' };
  for (const e of path) expect(G.applyAction(s, { type: 'build', pid: 0, what: 'ship', at: e }).ok).toBe(true);
  const legal = G.legalSettlements(s, 0);
  for (const x of legal) expect(s.board.vertices[x]!.hexes.length).toBeGreaterThan(0);
  const E = s.board.edges[path[2]!]!;
  const end = shared(s, path[1]!, path[2]!) === E.a ? E.b : E.a;
  if (s.board.vertices[end]!.hexes.length > 0 && !s.board.vertices[end]!.adj.some(u => s.buildings[u])) expect(legal.includes(end)).toBe(true);
});

test('longest trade route: ships count, toward the 5 threshold, seafarers wording', () => {
  const s = mainState();
  const { v, path } = shipWalk(s, 6);
  s.buildings[v] = { owner: 0, type: 'settlement' };
  for (const e of path.slice(0, 5)) G.applyAction(s, { type: 'build', pid: 0, what: 'ship', at: e });
  expect(s.players[0]!.roadLen).toBe(5);
  expect(s.longestRoad).toEqual({ owner: 0, len: 5 });
  expect(s.log.some(l => l.msg.includes('Tuyến đường dài nhất'))).toBe(true);
});

test('road to ship switch requires own building on the vertex', () => {
  const s = mainState(7, 4);
  const { v, path } = shipWalk(s, 4, true);
  const roadE = s.board.vertices[v]!.edges.find(e => s.board.edges[e]!.hexes.length === 2)!;
  s.roads[roadE] = 0;
  for (const e of path) s.ships![e] = { owner: 0, built: 0 };
  s.players[0]!.shipsLeft = 11;
  G.applyAction(s, { type: 'retirePlayer', pid: 2 }); // recomputes the route lengths
  expect(s.players[0]!.roadLen).toBe(4);
  s.buildings[v] = { owner: 0, type: 'settlement' };
  G.applyAction(s, { type: 'retirePlayer', pid: 1 });
  expect(s.players[0]!.roadLen).toBe(5);
});

test('setup: a ship may replace the road after a coastal settlement', () => {
  const s = G.createGame(cfg('islands', 5, true, 3));
  const pid = s.setup.queue[0]!.pid;
  const v = s.board.vertices.find(x => G.canSetupSettlement(s, pid, x.id) && x.edges.some(e => isShipEdge(s.board, s.board.edges[e]!)))!;
  expect(G.applyAction(s, { type: 'placeSettlement', pid, vid: v.id }).ok).toBe(true);
  const ships = G.legalSetupShips(s, pid);
  expect(ships.length).toBeGreaterThan(0);
  expect(G.legalSetupRoads(s, pid).length).toBeGreaterThan(0);
  expect(G.applyAction(s, { type: 'placeShip', pid, eid: ships[0]! }).ok).toBe(true);
  expect(s.ships![ships[0]!]!.owner).toBe(pid);
  expect(s.players[pid]!.shipsLeft).toBe(14);
  expect(s.setup.step).toBe('settlement');
  const b = G.createGame(cfg('classic', 5, false, 3));
  expect(G.applyAction(b, { type: 'placeShip', pid: b.setup.queue[0]!.pid, eid: 0 }).ok).toBe(false);
});

test('Road Building in seafarers accepts a mix of roads and ships', () => {
  const s = mainState();
  const { v, path } = shipWalk(s, 3);
  s.buildings[v] = { owner: 0, type: 'settlement' };
  s.players[0]!.dev.push({ type: 'roadBuilding', turn: -1 });
  const wood = s.players[0]!.res.wood;
  expect(G.applyAction(s, { type: 'playDev', pid: 0, card: 'roadBuilding' }).ok).toBe(true);
  expect(s.phase).toBe('roadBuilding');
  expect(s.freeRoads).toBe(2);
  expect(G.applyAction(s, { type: 'build', pid: 0, what: 'ship', at: path[0]! }).ok).toBe(true);
  const road = G.legalRoads(s, 0)[0];
  const second = road !== undefined ? { what: 'road' as const, at: road } : { what: 'ship' as const, at: path[1]! };
  expect(G.applyAction(s, { type: 'build', pid: 0, ...second }).ok).toBe(true);
  expect(s.phase).toBe('main');
  expect(s.players[0]!.res.wood).toBe(wood);
});
