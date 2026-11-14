// Xuất dữ liệu mẫu (golden) cho bản port Android: với mỗi ván bot-đấu-bot có seed cố định, ghi lại
// cấu hình, bàn cờ sinh ra, toàn bộ chuỗi action và tóm tắt trạng thái cuối. Test Kotlin đọc file này,
// tạo ván từ `config`, kiểm tra bàn cờ, rồi hoặc phát lại `actions`, hoặc để bot Kotlin tự chơi và so
// từng action; `rng[k]` là trạng thái RNG sau action thứ k, giúp chỉ ra đúng chỗ bắt đầu lệch.
// Chạy: pnpm fixtures [số ván] [file ra] [số ván Biển cả]   (mặc định 30 ván + 24 ván Biển cả, fixtures/engine.json)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createGame, applyAction, pendingActors, victoryPoints } from '@engine/game';
import { botAct } from '@engine/bot';
import type { Action, GameState } from '@engine/types';
import type { Config } from '@engine/types';
import { makeConfig, makeSeaConfig } from './sim';

// FORMAT 2: + ván Biển cả (`sea: true`, cấu hình từ makeSeaConfig), thêm trường board/final riêng cho Biển cả
const FORMAT = 2;
// số ván Biển cả mặc định (i = 0..SEA_GAMES-1); 24 ván phủ đủ 4 tổ hợp {seaIslands, mainland} x {có, không islandBonus}
const SEA_GAMES = 24;

function boardOf(s: GameState, sea = false) {
  const b = s.board;
  return {
    tiles: b.tiles.map(t => (sea ? { q: t.q, r: t.r, res: t.res, num: t.num, island: t.island } : { q: t.q, r: t.r, res: t.res, num: t.num })),
    ports: b.ports.map(p => ({ edge: p.edge, type: p.type, ratio: p.ratio })),
    // [a, b] của từng cạnh: đủ để kiểm tra cách đánh số đỉnh/cạnh giống hệt bản web
    edges: b.edges.map(e => [e.a, e.b]),
    vertices: b.vertices.length,
    sea: b.sea.length,
    robber: b.robber,
    ...(sea ? {
      seaTiles: b.sea.length,
      seaVertices: b.vertices.filter(v => v.sea && v.sea.length > 0).length,
      seaEdges: b.edges.filter(e => e.sea && e.sea.length > 0).length,
      homeIslands: b.homeIslands ?? null,
    } : {}),
  };
}

function finalOf(s: GameState, sea = false) {
  return {
    phase: s.phase,
    winner: s.winner,
    turn: s.turn,
    round: s.round,
    actions: s.actions,
    rng: s.rng.s,
    robber: s.board.robber,
    tiles: s.board.tiles.map(t => ({ res: t.res, num: t.num })), // khác ban đầu khi có đất chuyển mình / động đất
    bank: s.bank,
    devDeck: s.devDeck.length,
    longestRoad: s.longestRoad,
    largestArmy: s.largestArmy,
    buildings: s.buildings,
    roads: s.roads,
    rolls: s.stats.rolls,
    ...(sea ? {
      ships: s.ships ?? {},
      pirate: s.board.pirate ?? null,
      goldPending: s.goldPending ?? {},
      islandBonus: s.islandBonus ?? {},
    } : {}),
    players: s.players.map(p => ({
      vp: victoryPoints(s, p.id),
      res: p.res,
      dev: p.dev.map(c => c.type),
      knights: p.knights,
      roadLen: p.roadLen,
      roadsLeft: p.roadsLeft,
      settlementsLeft: p.settlementsLeft,
      citiesLeft: p.citiesLeft,
      retired: p.retired,
      ...(sea ? { shipsLeft: p.shipsLeft ?? null } : {}),
    })),
  };
}

function playGame(i: number, sea = false) {
  const config: Config = sea ? makeSeaConfig(i) : makeConfig(i);
  const s = createGame(config);
  const board = boardOf(s, sea);
  const first = s.first;
  const actions: Action[] = [];
  const rng: number[] = [];
  let guard = 0;
  // cùng vòng lặp với scripts/determinism.ts: người phải hành động đầu tiên có nước đi sẽ đi
  while (s.phase !== 'gameOver' && s.turn < 1500 && ++guard < 200000) {
    let acted = false;
    for (const pid of pendingActors(s)) {
      const a = botAct(s, pid);
      if (!a) continue;
      const r = applyAction(s, a);
      if (!r.ok) throw new Error(`ván ${i}: bot đi sai luật ${JSON.stringify(a)}: ${r.error}`);
      actions.push(a);
      rng.push(s.rng.s);
      acted = true;
      break;
    }
    if (!acted) break;
  }
  return { i, ...(sea ? { sea: true } : {}), config, first, board, actions, rng, final: finalOf(s, sea) };
}

const games = +(process.argv[2] ?? 0) || 30;
const out = resolve(process.argv[3] ?? 'fixtures/engine.json');
const seaGames = process.argv[4] !== undefined ? +process.argv[4] : SEA_GAMES; // arg 3: số ván Biển cả
const data = { format: FORMAT, games: [...Array.from({ length: games }, (_, i) => playGame(i)), ...Array.from({ length: seaGames }, (_, i) => playGame(i, true))] };
mkdirSync(dirname(out), { recursive: true });
const json = JSON.stringify(data);
writeFileSync(out, json);
const total = data.games.reduce((a, g) => a + g.actions.length, 0);
const done = data.games.filter(g => g.final.phase === 'gameOver').length;
console.log(`${games}+${seaGames} ván (${done} kết thúc), ${total} action, ${(json.length / 1e6).toFixed(1)} MB -> ${out}`);
