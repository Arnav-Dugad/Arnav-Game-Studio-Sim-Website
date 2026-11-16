import { createGame } from '../../src/sim/create';
import { advance } from '../../src/sim/advance';
import { fromDay } from '../../src/sim/calendar';
import { Rng } from '../../src/sim/rng';
import { valuation } from '../../src/sim/systems/finance';
import type { GameState } from '../../src/sim/types';
import { checkInvariants } from './invariants';
import { makeBot, type BotName } from './bots';

export interface YearRow {
  year: number;
  cash: number;
  rep: number;
  staff: number;
  releases: number;
  avgScore: number;
  valuation: number;
  tier: number;
}

export interface BotRun {
  bot: BotName;
  seed: number;
  state: GameState;
  years: YearRow[];
  errors: string[];
  endYear: number;
  ms: number;
}

export function runBot(bot: BotName, seed: number, years = 46, startYear = 1980): BotRun {
  const t0 = Date.now();
  const s = createGame({ seed, companyName: `${bot} Games`, founderName: 'Bot', startYear, endless: true, autopause: false });
  const b = makeBot(bot);
  const rng = new Rng([seed ^ 0x55, seed ^ 0xaa, 7, 11]);
  const rows: YearRow[] = [];
  const errors: string[] = [];
  const endDay = s.day + Math.round(years * 365.25);
  let lastYear = fromDay(s.day).year;
  while (s.day < endDay && s.status === 'running') {
    b.act(s, rng);
    advance(s, 7);
    const y = fromDay(s.day).year;
    if (y !== lastYear) {
      const recent = s.releaseOrder.slice(-5).map((id) => s.releases[id]!.score);
      rows.push({
        year: lastYear,
        cash: Math.round(s.company.cash),
        rep: Math.round(s.company.reputation),
        staff: Object.keys(s.staff).length,
        releases: s.releaseOrder.length,
        avgScore: recent.length ? Math.round(recent.reduce((a, b2) => a + b2, 0) / recent.length) : 0,
        valuation: Math.round(valuation(s)),
        tier: s.office.tier,
      });
      lastYear = y;
      const e = checkInvariants(s);
      if (e.length) errors.push(`${y}: ${e.join('; ')}`);
    }
  }
  return { bot, seed, state: s, years: rows, errors, endYear: fromDay(s.day).year, ms: Date.now() - t0 };
}
