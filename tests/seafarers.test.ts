// Seafarers wave 1: expansion framework and the real sea board. Usage: pnpm test
import { test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import * as G from '@engine/game';
import { defaultConfig, expansionOf, PLAYER_COLORS } from '@engine/config';
import { generateBoard, isShipEdge, SHAPES } from '@engine/board';
import { botAct } from '@engine/bot';
import type { Config, ShapeId } from '@engine/types';

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
        acted = true;
        break;
      }
      if (!acted) break;
    }
    expect(s.phase).toBe('gameOver');
    for (const k in s.buildings) expect(s.board.vertices[+k]!.hexes.length).toBeGreaterThan(0);
    for (const k in s.roads) expect(s.board.edges[+k]!.hexes.length).toBeGreaterThan(0);
  }
});
