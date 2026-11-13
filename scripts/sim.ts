// Headless self-play: runs many bot-only games over every map/mode combination and
// checks rule invariants after every single action.  Usage: pnpm sim [games]
import { createGame, applyAction, pendingActors, victoryPoints, canBuildRoad, vpTargetFor } from '@engine/game';
import { botAct } from '@engine/bot';
import { defaultConfig, MODES, PLAYER_COLORS } from '@engine/config';
import { SHAPES, isShipEdge } from '@engine/board';
import { RES } from '@engine/constants';
import type { Action, BotLevel, Config, DevDeckId, GameState, PlayerConfig, ShapeId } from '@engine/types';

const shapes = Object.keys(SHAPES).filter(k => k !== 'custom' && !SHAPES[k as ShapeId].sea) as ShapeId[];

export function makeConfig(i: number): Config {
  const c = defaultConfig();
  c.seed = 1000 + i * 7919;
  const np = 2 + (i % 7);
  c.players = Array.from({ length: np }, (_, k): PlayerConfig => ({ name: 'B' + k, kind: 'bot', level: (['easy', 'normal', 'hard'] as BotLevel[])[(i + k) % 3], color: PLAYER_COLORS[k]! }));
  c.map.shape = shapes[i % shapes.length]!;
  if (np > 4 && ['classic', 'mini'].includes(c.map.shape)) c.map.shape = 'extended';
  if (np > 6) {
    c.map.shape = (['big', 'huge', 'kingdoms', 'pangea'] as ShapeId[])[i % 4]!;
    c.map.size = 40;
  }
  c.map.size = 18 + (i % 20);
  c.map.gold = i % 4 === 0 ? 2 : 0;
  c.map.resources = i % 3 === 0 ? 'chaos' : 'balanced';
  c.map.numbers = i % 5 === 0 ? 'random' : 'balanced';
  c.map.ports = (['normal', 'many', 'few', 'none'] as const)[i % 4]!;
  // toggle modes pseudo-randomly
  MODES.forEach((m, k) => m.set(c, ((i * 2654435761) >>> (k + 3)) % 3 === 0));
  if (i % 7 === 0) c.rules.vpTarget = 6 + (i % 9);
  if (i % 6 === 0) c.rules.startBonus = 1;
  if (i % 8 === 0) c.rules.setupRounds = 3;
  if (i % 9 === 0) c.rules.devDeck = (['war', 'progress', 'none'] as DevDeckId[])[i % 3]!;
  c.rules.robberGrace = i % 10 === 0 ? 2 : 0;
  return c;
}

// Seafarers invariants: ship counts, ship edges, no road+ship overlap, connectivity, pirate, gold phase
function checkSea(s: GameState, errs: string[]) {
  const bd = s.board;
  const ships = s.ships!;
  for (const p of s.players) {
    const n = Object.values(ships).filter(x => x.owner === p.id).length;
    if (n + (p.shipsLeft ?? 0) !== (s.config.rules.maxShips ?? 15)) errs.push(`barcos ${p.id}: ${n}+${p.shipsLeft}`);
  }
  for (const k in ships) {
    const E = bd.edges[+k]!;
    if (!isShipEdge(bd, E)) errs.push(`barco fuera de arista de mar ${k}`);
    if (s.roads[k] !== undefined) errs.push(`camino y barco en ${k}`);
    const o = ships[k]!.owner;
    const ok = [E.a, E.b].some(v => (s.buildings[v] && s.buildings[v]!.owner === o) || (!s.buildings[v] && bd.vertices[v]!.edges.some(e => e !== +k && ships[e]?.owner === o)));
    // a rival may legally settle between two ships later, so only check ends that lead to a building or a free vertex
    if (!ok && !bd.vertices[E.a]!.edges.concat(bd.vertices[E.b]!.edges).some(e => e !== +k && ships[e]?.owner === o)) errs.push(`barco suelto ${k}`);
  }
  const pr = bd.pirate;
  if (pr === undefined || (pr !== -1 && !bd.sea.some(t => t.id === pr))) errs.push(`pirata en casilla inválida ${pr}`);
  if (Object.values(s.goldPending ?? {}).some(n => n > 0) && s.phase !== 'gold' && s.phase !== 'gameOver') errs.push(`oro pendiente fuera de fase gold (${s.phase})`);
}

function check(s: GameState, where: string) {
  const errs: string[] = [];
  const bankEach = s.bankTotal;
  for (const r of RES) {
    const tot = s.bank[r] + s.players.reduce((a, p) => a + p.res[r], 0);
    if (tot !== bankEach * RES.length / RES.length && tot !== bankEach) errs.push(`conservación ${r}: ${tot} != ${bankEach}`);
    if (s.bank[r] < 0) errs.push(`banco negativo ${r}`);
    for (const p of s.players) if (p.res[r] < 0) errs.push(`mano negativa ${p.id} ${r}`);
  }
  const R = s.config.rules;
  for (const p of s.players) {
    const setts = Object.values(s.buildings).filter(b => b.owner === p.id && b.type === 'settlement').length;
    const cities = Object.values(s.buildings).filter(b => b.owner === p.id && b.type === 'city').length;
    const roads = Object.values(s.roads).filter(o => o === p.id).length;
    const blindS = s.blind.filter(b => b.pid === p.id && b.type === 'settlement').length;
    const blindC = s.blind.filter(b => b.pid === p.id && b.type === 'city').length;
    const blindR = s.blind.filter(b => b.pid === p.id && b.eid != null).length;
    if (setts + blindS + p.settlementsLeft !== R.maxSettlements) errs.push(`poblados ${p.id}: ${setts}+${blindS}+${p.settlementsLeft}`);
    if (cities + blindC + p.citiesLeft !== R.maxCities) errs.push(`ciudades ${p.id}`);
    if (roads + blindR + p.roadsLeft !== R.maxRoads) errs.push(`caminos ${p.id}: ${roads}+${blindR}+${p.roadsLeft}`);
  }
  // distance rule
  for (const k in s.buildings) for (const u of s.board.vertices[+k]!.adj) if (s.buildings[u]) errs.push(`distancia violada ${k}-${u}`);
  // road connectivity: every road must touch own building or own road
  if (s.phase !== 'setup' || !s.setup.blindActive)
    for (const k in s.roads) {
      const pid = s.roads[k];
      const E = s.board.edges[+k]!;
      const ok = [E.a, E.b].some(v => (s.buildings[v] && s.buildings[v]!.owner === pid) || s.board.vertices[v]!.edges.some(e => e !== +k && s.roads[e] === pid));
      if (!ok) errs.push(`camino suelto ${k}`);
    }
  // dev cards conservation
  const devHeld = s.players.reduce((a, p) => a + p.dev.length, 0);
  if (devHeld + s.devDeck.length > s.devTotal) errs.push('cartas de desarrollo duplicadas');
  if (s.phase !== 'gameOver' && s.phase !== 'setup' && victoryPoints(s, s.current) >= vpTargetFor(s, s.current)) errs.push('ganador no detectado');
  if (s.phase === 'discard' && !Object.keys(s.pendingDiscards).length) errs.push('fase descarte vacía');
  if (s.ships) checkSea(s, errs);
  if (errs.length) throw new Error(`[${where}] ` + errs.join('; '));
}

interface Summary {
  games: number;
  finished: number;
  turns: number;
  byShape: Record<string, { n: number; done: number; turns: number }>;
  winnerVP: number[];
  errors: number;
}

// the sim stamps the state to inject each admin action only once
type SimState = GameState & { __admin?: Record<number, number> };

export function runSim(GAMES: number): Summary {
const summary: Summary = { games: 0, finished: 0, turns: 0, byShape: {}, winnerVP: [], errors: 0 };
for (let i = 0; i < GAMES; i++) {
  const cfg = makeConfig(i);
  let s!: SimState;
  try {
    s = createGame(cfg);
    let guard = 0;
    while (s.phase !== 'gameOver' && s.turn < 1500) {
      if (++guard > 200000) throw new Error('bucle infinito');
      const actors = pendingActors(s);
      let acted = false;
      // simulate disconnections: occasionally retire a player or hand a seat to a bot
      if (i % 3 === 0 && s.actions > 0 && s.actions % 97 === 0 && !s.__admin?.[s.actions]) {
        (s.__admin ||= {})[s.actions] = 1;
        const alive = s.players.filter(p => !p.retired);
        const target = alive[(s.actions / 97) % alive.length | 0]!;
        const act: Action = alive.length > 2 && (s.actions / 97) % 2 < 1 ? { type: 'retirePlayer', pid: target.id } : { type: 'setController', pid: target.id, kind: target.kind === 'bot' ? 'human' : 'bot' };
        if (act.type === 'setController' && act.kind === 'human') act.kind = 'bot';
        const r = applyAction(s, act);
        if (!r.ok) throw new Error(`admin ${JSON.stringify(act)}: ${r.error}`);
        check(s, act.type);
        continue;
      }
      for (const pid of actors) {
        const a = botAct(s, pid);
        if (!a) continue;
        const robberBefore = s.board.robber, roadsBefore = { ...s.roads }, setupBefore = s.phase === 'setup';
        const r = applyAction(s, a);
        if (!r.ok) throw new Error(`acción ilegal del bot ${JSON.stringify(a)} en fase ${s.phase}: ${r.error}`);
        check(s, a.type);
        if (a.type === 'moveRobber' && s.board.robber === robberBefore) throw new Error(`[moveRobber] el ladrón se quedó en la casilla ${robberBefore}`);
        // a new road must connect at an end that isn't a rival's building (checked when it's built:
        // a rival may legally cut it later by settling in between)
        if (!setupBefore)
          for (const k in s.roads) if (roadsBefore[k] === undefined && !canBuildRoad({ ...s, roads: roadsBefore }, s.roads[k]!, +k))
            throw new Error(`[${a.type}] camino ${k} no conecta (o pasa por un edificio rival)`);
        acted = true;
        break;
      }
      if (!acted) throw new Error(`bloqueo: fase=${s.phase} actores=${actors} trade=${JSON.stringify(s.trade)}`);
    }
    summary.games++;
    summary.turns += s.turn;
    const sh = (summary.byShape[cfg.map.shape] ||= { n: 0, done: 0, turns: 0 });
    sh.n++;
    sh.turns += s.turn;
    if (s.phase === 'gameOver') {
      summary.finished++;
      sh.done++;
      summary.winnerVP.push(victoryPoints(s, s.winner!));
    } else {
      console.log(`⚠️  partida ${i} (${cfg.map.shape}, ${cfg.players.length}p) no terminó en 1500 turnos. VP: ${s.players.map(p => victoryPoints(s, p.id)).join(',')}`);
    }
  } catch (e) {
    summary.errors++;
    console.log(`❌ partida ${i} seed=${cfg.seed} shape=${cfg.map.shape} players=${cfg.players.length} modes=${JSON.stringify(cfg.modes)} rules=${JSON.stringify(cfg.rules)}`);
    console.log('   ', (e as Error).stack!.split('\n').slice(0, 4).join('\n    '));
    if (summary.errors > 5) break;
  }
}
return summary;
}

export function printSummary(summary: Summary) {
console.log(`\nPartidas: ${summary.games}, terminadas: ${summary.finished}, errores: ${summary.errors}, turnos medios: ${(summary.turns / Math.max(1, summary.games)).toFixed(1)}`);
for (const [k, v] of Object.entries(summary.byShape)) console.log(`  ${k.padEnd(9)} ${v.done}/${v.n} terminadas, ${(v.turns / v.n).toFixed(0)} turnos`);
}

// ---------- Seafarers sim: separate config generator so makeConfig output (used by determinism) is untouched ----------
const seaShapes: ShapeId[] = ['seaIslands', 'mainland', 'islands'];
const seaModes = MODES.filter(m => !['flipped', 'fog', 'blindfold', 'hiddenNumbers'].includes(m.id));

export function makeSeaConfig(i: number): Config {
  const c = defaultConfig();
  c.seed = 5000 + i * 7919;
  const np = 2 + (i % 5);
  c.players = Array.from({ length: np }, (_, k): PlayerConfig => ({ name: 'B' + k, kind: 'bot', level: (['easy', 'normal', 'hard'] as BotLevel[])[(i + k * 2) % 3], color: PLAYER_COLORS[k]! }));
  c.rules.expansion = 'seafarers';
  c.rules.islandBonus = i % 4 !== 3;
  c.map.shape = seaShapes[i % seaShapes.length]!;
  c.map.size = 0;
  c.map.gold = i % 3 === 0 ? 2 : 0;
  c.map.ports = (['normal', 'many', 'few', 'none'] as const)[i % 4]!;
  seaModes.forEach((m, k) => m.set(c, ((i * 2654435761) >>> (k + 3)) % 4 === 0));
  if (i % 6 === 0) c.rules.startBonus = 1;
  return c;
}

export interface SeaSummary extends Summary {
  settledOther: number;
  ships: number;
  pirate: number;
  moves: number;
}

function islandsOf(s: GameState): Map<number, Set<number>> {
  const own = new Map<number, Set<number>>();
  for (const k in s.buildings) {
    const b = s.buildings[k]!;
    const set = own.get(b.owner) ?? own.set(b.owner, new Set()).get(b.owner)!;
    for (const h of s.board.vertices[+k]!.hexes) set.add(s.board.tiles[h]!.island ?? -1);
  }
  return own;
}

export function runSeaSim(GAMES: number): SeaSummary {
  const sum: SeaSummary = { games: 0, finished: 0, turns: 0, byShape: {}, winnerVP: [], errors: 0, settledOther: 0, ships: 0, pirate: 0, moves: 0 };
  for (let i = 0; i < GAMES; i++) {
    const cfg = makeSeaConfig(i);
    try {
      const s = createGame(cfg);
      let guard = 0;
      let startIslands: Map<number, Set<number>> | null = null;
      while (s.phase !== 'gameOver' && s.turn < 1500) {
        if (++guard > 200000) throw new Error('bucle infinito');
        if (!startIslands && s.phase !== 'setup') startIslands = islandsOf(s);
        const actors = pendingActors(s);
        let acted = false;
        for (const pid of actors) {
          const a = botAct(s, pid);
          if (!a) continue;
          const r = applyAction(s, a);
          if (!r.ok) throw new Error(`acción ilegal del bot ${JSON.stringify(a)} en fase ${s.phase}: ${r.error}`);
          check(s, a.type);
          if (a.type === 'build' && a.what === 'ship') sum.ships++;
          if (a.type === 'moveShip') sum.moves++;
          if (a.type === 'moveRobber' && a.target === 'pirate') sum.pirate++;
          acted = true;
          break;
        }
        if (!acted) throw new Error(`bloqueo: fase=${s.phase} actores=${actors}`);
      }
      sum.games++;
      sum.turns += s.turn;
      const sh = (sum.byShape[cfg.map.shape] ||= { n: 0, done: 0, turns: 0 });
      sh.n++;
      sh.turns += s.turn;
      if (s.phase === 'gameOver') {
        sum.finished++;
        sh.done++;
        sum.winnerVP.push(victoryPoints(s, s.winner!));
      }
      if ([...islandsOf(s)].some(([pid, set]) => [...set].some(i => !(startIslands!.get(pid) ?? new Set()).has(i)))) sum.settledOther++;
    } catch (e) {
      sum.errors++;
      console.log(`❌ partida marítima ${i} seed=${cfg.seed} shape=${cfg.map.shape} players=${cfg.players.length} rules=${JSON.stringify(cfg.rules)}`);
      console.log('   ', (e as Error).stack!.split('\n').slice(0, 4).join('\n    '));
      if (sum.errors > 5) break;
    }
  }
  return sum;
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2).filter(a => a !== '--');
  const sea = args.includes('--sea');
  const n = +(args.find(a => /^\d+$/.test(a)) ?? 0) || 200;
  const summary = sea ? runSeaSim(n) : runSim(n);
  printSummary(summary);
  if (sea) {
    const w = summary as SeaSummary;
    console.log(`Marítimas: otra isla ${w.settledOther}/${w.games}, barcos ${w.ships}, pirata ${w.pirate}, barcos movidos ${w.moves}`);
  }
  process.exit(summary.errors ? 1 : 0);
}
