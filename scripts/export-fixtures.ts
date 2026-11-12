// Xuất dữ liệu mẫu (golden) cho bản port Android: với mỗi ván bot-đấu-bot có seed cố định, ghi lại
// cấu hình, bàn cờ sinh ra, toàn bộ chuỗi action và tóm tắt trạng thái cuối. Test Kotlin đọc file này,
// tạo ván từ `config`, kiểm tra bàn cờ, rồi hoặc phát lại `actions`, hoặc để bot Kotlin tự chơi và so
// từng action; `rng[k]` là trạng thái RNG sau action thứ k, giúp chỉ ra đúng chỗ bắt đầu lệch.
// Chạy: pnpm fixtures [số ván] [file ra]   (mặc định 30 ván, fixtures/engine.json)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createGame, applyAction, pendingActors, victoryPoints } from '@engine/game';
import { botAct } from '@engine/bot';
import type { Action, GameState } from '@engine/types';
import { makeConfig } from './sim';

const FORMAT = 1;

function boardOf(s: GameState) {
  const b = s.board;
  return {
    tiles: b.tiles.map(t => ({ q: t.q, r: t.r, res: t.res, num: t.num })),
    ports: b.ports.map(p => ({ edge: p.edge, type: p.type, ratio: p.ratio })),
    // [a, b] của từng cạnh: đủ để kiểm tra cách đánh số đỉnh/cạnh giống hệt bản web
    edges: b.edges.map(e => [e.a, e.b]),
    vertices: b.vertices.length,
    sea: b.sea.length,
    robber: b.robber,
  };
}

function finalOf(s: GameState) {
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
    })),
  };
}

function playGame(i: number) {
  const config = makeConfig(i);
  const s = createGame(config);
  const board = boardOf(s);
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
  return { i, config, first, board, actions, rng, final: finalOf(s) };
}

const games = +(process.argv[2] ?? 0) || 30;
const out = resolve(process.argv[3] ?? 'fixtures/engine.json');
const data = { format: FORMAT, games: Array.from({ length: games }, (_, i) => playGame(i)) };
mkdirSync(dirname(out), { recursive: true });
const json = JSON.stringify(data);
writeFileSync(out, json);
const total = data.games.reduce((a, g) => a + g.actions.length, 0);
const done = data.games.filter(g => g.final.phase === 'gameOver').length;
console.log(`${games} ván (${done} kết thúc), ${total} action, ${(json.length / 1e6).toFixed(1)} MB -> ${out}`);
