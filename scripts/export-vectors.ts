// Xuất vector kiểm tra cho bản port Kotlin: RNG, defaultConfig và createGame đầy đủ của vài config.
// Chạy: pnpm exec tsx scripts/export-vectors.ts <thư mục ra>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createGame } from '@engine/game';
import { rand } from '@engine/rng';
import { defaultConfig, MODES, PRESETS, PLAYER_COLORS, BOT_NAMES } from '@engine/config';
import type { Config, PlayerConfig } from '@engine/types';

const out = resolve(process.argv[2] ?? 'vectors');
mkdirSync(join(out, 'boards'), { recursive: true });
mkdirSync(join(out, 'games'), { recursive: true });
const write = (f: string, v: unknown) => writeFileSync(join(out, f), JSON.stringify(v));

// ---- rng.json: khởi tạo y hệt createGame; `values[k]` là rand() lần k, `states[k]` là s sau lần đó
const rng = [0, 1, 42, 12345, 2147483647, -5, 4294967295].map(seed => {
  const r = { s: (seed >>> 0) || 12345 };
  const initial = r.s;
  const values: number[] = [], states: number[] = [];
  for (let k = 0; k < 1000; k++) { values.push(rand(r)); states.push(r.s); }
  return { seed, initial, values, states };
});
write('rng.json', { note: 'initial = (seed>>>0)||12345 (không dấu, có thể > 2^31-1); states = r.s sau mỗi rand() (int32 có dấu)', seeds: rng });

// ---- config.json
write('config.json', {
  defaultConfig: { ...defaultConfig(), seed: 0 }, // seed ngẫu nhiên trong defaultConfig, đặt cố định 0
  modes: MODES.map(m => m.id),
  presets: PRESETS.map(p => p.id),
  playerColors: PLAYER_COLORS,
  botNames: BOT_NAMES,
});

// ---- boards/games
function cfg(f: (c: Config) => void, np = 4, seed = 1): Config {
  const c = defaultConfig();
  c.seed = seed;
  c.players = Array.from({ length: np }, (_, k): PlayerConfig => ({ name: 'P' + k, kind: k === 0 ? 'human' : 'bot', level: 'normal', color: PLAYER_COLORS[k]! }));
  f(c);
  return c;
}
const cases: Record<string, Config> = {
  classic_7: cfg(c => { c.map.shape = 'classic'; }, 4, 7),
  ring_3: cfg(c => { c.map.shape = 'ring'; }, 4, 3),
  star_11: cfg(c => { c.map.shape = 'star'; }, 4, 11),
  kingdoms_5: cfg(c => { c.map.shape = 'kingdoms'; }, 4, 5),
  islands_21_np5: cfg(c => { c.map.shape = 'islands'; c.map.size = 27; }, 5, 21),
  pangea_9: cfg(c => { c.map.shape = 'pangea'; c.map.size = 30; }, 4, 9),
  extended_6p: cfg(c => { c.map.shape = 'extended'; }, 6, 4),
  huge_2: cfg(c => { c.map.shape = 'huge'; }, 4, 2),
  custom_8: cfg(c => {
    c.map.shape = 'custom';
    c.map.custom = { name: 'mini custom', tiles: [
      { q: 0, r: 0, res: 'wood', num: 6 }, { q: 1, r: 0, res: 'brick', num: 8 }, { q: 0, r: 1, res: 'random', num: null },
      { q: -1, r: 1, res: 'desert' }, { q: -1, r: 0, res: 'random', num: 5 }, { q: 0, r: -1, res: 'ore', num: null },
      { q: 1, r: -1, res: 'wheat', num: 9 },
    ] };
  }, 3, 8),
  seaIslands_5_np3: cfg(c => { c.rules.expansion = 'seafarers'; c.map.shape = 'seaIslands'; c.map.size = 0; }, 3, 5),
  mainland_11_np4_bonus: cfg(c => { c.rules.expansion = 'seafarers'; c.rules.islandBonus = true; c.map.shape = 'mainland'; c.map.size = 0; }, 4, 11),
  base_hidden_modes: cfg(c => { c.modes.fog = true; c.modes.flipped = true; c.modes.blindfold = true; c.modes.hiddenNumbers = true; c.map.shape = 'big'; }, 4, 13),
  seafarers_fog_requested: cfg(c => { c.rules.expansion = 'seafarers'; c.map.shape = 'seaIslands'; c.map.size = 0; c.modes.fog = true; c.modes.flipped = true; c.modes.blindfold = true; c.modes.hiddenNumbers = true; }, 3, 17),
};
let n = 0;
for (const [name, config] of Object.entries(cases)) {
  const state = createGame(config);
  write(`games/${name}.json`, { config, state });
  write(`boards/${name}.json`, { config, board: state.board, rng: state.rng.s });
  n++;
}
console.log(`rng(${rng.length} seed), config, ${n} config -> ${out}`);
