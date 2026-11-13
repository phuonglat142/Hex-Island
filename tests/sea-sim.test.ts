// Bot-vs-bot Seafarers games over every sea shape, 2-6 players, all bot levels, island bonus on/off and
// random (allowed) modes; invariants are checked after every action by scripts/sim.ts.
import { test, expect } from 'vitest';
import { runSeaSim } from '../scripts/sim.ts';

test('sim 60 ván Biển cả không lỗi và đều kết thúc', () => {
  const sum = runSeaSim(60);
  console.log(
    `Biển cả: ${sum.games} ván, ${(sum.turns / sum.games).toFixed(1)} lượt TB, sang đảo khác ${sum.settledOther}/${sum.games} ván (${((100 * sum.settledOther) / sum.games).toFixed(0)}%), tàu ${sum.ships}, hải tặc ${sum.pirate}, dời tàu ${sum.moves}`,
  );
  expect(sum.errors).toBe(0);
  expect(sum.games).toBe(60);
  expect(sum.finished).toBe(60);
  expect(sum.ships).toBeGreaterThan(0);
  expect(sum.pirate).toBeGreaterThan(0);
  expect(sum.moves).toBeGreaterThan(0);
}, 300000);
