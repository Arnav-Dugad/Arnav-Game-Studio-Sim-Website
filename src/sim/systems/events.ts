/**
 * Random choice events. Each event's weight depends on game state, so events react to the systems
 * (crunch → incidents, fame → journalists, low cash → predatory loans…).
 */
import { COMPANY_BY_ID } from '../../data/companies';
import { clamp } from '../breakdown';
import { fromDay, toDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { EventInstance, EventOption, GameProject, GameState, Staff } from '../types';
import { addRep, aOrAn, earn, fmtMoney, hasFlag, inflation, money, newId, pushNews, spend } from '../util';
import { valuation } from './finance';
import { generateCandidate, candidateToStaff, marketSalary, removeStaff } from './staff';
import { assignDesks, freeDesks } from './office';

interface EventDef {
  id: string;
  art: string;
  cooldown: number; // days
  weight: (s: GameState) => number;
  make: (c: Ctx) => { title: string; body: string; options: EventOption[]; ctx: Record<string, string | number> } | null;
  resolve: (c: Ctx, e: EventInstance, option: string) => void;
}

const staffList = (s: GameState) => Object.values(s.staff).filter((x) => x.role !== 'founder');
const activeGames = (s: GameState) => Object.values(s.projects).filter((p): p is GameProject => p.kind === 'game');
const anyCrunch = (s: GameState) => activeGames(s).some((p) => p.crunch);
const yr = (s: GameState) => fromDay(s.day).year;
const liveHw = (s: GameState) => (s.hardware ?? []).filter((h) => h.status === 'live');
const bigFranchise = (s: GameState) =>
  Object.values(s.franchises)
    .filter((f) => f.fans >= 1_000_000 && f.bestScore >= 80)
    .sort((a, b) => b.fans - a.fans)[0];
const retroClassics = (s: GameState) =>
  s.releaseOrder
    .map((id) => s.releases[id]!)
    .filter((r) => r && s.day - r.day > 20 * 365 && r.score >= 75 && !r.concept.remasterOf)
    .sort((a, b) => b.score - a.score);
/** Your best release from the last `days` days scoring at least `min` (not expansions or remasters). */
const recentHit = (s: GameState, days: number, min: number) =>
  Object.values(s.releases)
    .filter((r) => s.day - r.day <= days && r.score >= min && !r.concept.expansionOf && !r.concept.remasterOf)
    .sort((a, b) => b.score - a.score)[0];
/** A beloved game at least three years old. */
const oldClassic = (s: GameState) =>
  Object.values(s.releases)
    .filter((r) => s.day - r.day >= 3 * 365 && r.score >= 75)
    .sort((a, b) => b.units - a.units)[0];
const mod = (s: GameState, v: number, days: number, label: string) => s.company.moraleMods.push({ v, until: s.day + days, label });

function staffById(s: GameState, id: string | number | undefined): Staff | undefined {
  return id === undefined ? undefined : s.staff[String(id)];
}

export const EVENT_DEFS: EventDef[] = [
  {
    // Annual shareholder meeting (scheduled each May for public studios; never rolled at random).
    id: 'agm',
    art: 'bell',
    cooldown: 300,
    weight: () => 0,
    make: ({ s }) => {
      const st = s.finance.stock;
      if (!st) return null;
      const yearAgo = st.history.length > 52 ? st.history[st.history.length - 53]! : st.ipoPrice;
      const change = yearAgo > 0 ? st.price / yearAgo - 1 : 0;
      const profit = s.finance.ledger.slice(-12).reduce((t, m) => t + Object.values(m.income).reduce((a, v) => a + (v ?? 0), 0) - Object.values(m.expense).reduce((a, v) => a + (v ?? 0), 0), 0);
      const dividend = Math.max(0, Math.round(profit * 0.25));
      const pct = Math.round(change * 100);
      const control = st.founderShares / st.shares;
      const revolt = st.boardMood < 30 && control < 0.5;
      const recap = `The share price is ${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct)}% on the year, with ${fmtMoney(profit)} profit over the last twelve months. Board mood ${Math.round(st.boardMood)}%. You hold ${Math.round(control * 100)}% of the shares.`;
      if (revolt)
        return {
          title: 'Shareholder revolt',
          body: `${recap} Unhappy investors have tabled a vote of no confidence and want a cost-cutting mandate.`,
          options: [
            { id: 'fight', label: 'Fight the vote', preview: `Win chance about ${Math.round(Math.min(90, 25 + control * 80 + s.company.reputation / 4))}%. Win: board mood +15. Lose: share price −12%, reputation −4.` },
            { id: 'concede', label: 'Accept the cost-cutting mandate', preview: 'Board mood +20; staff morale −8 for six months' },
          ],
          ctx: { profit, dividend, control, change, revolt: 1 },
        };
      return {
        title: `Annual shareholder meeting`,
        body: `${recap} How do you address the shareholders?`,
        options: [
          { id: 'dividend', label: `Declare a dividend (${fmtMoney(dividend)})`, preview: 'A quarter of last year’s profit. Board mood +10, share price +3%', disabled: dividend <= 0 || s.company.cash < dividend * 1.5 },
          { id: 'bold', label: 'Promise bold growth', preview: 'Share price +6%, board mood +6 — but profit expectations rise 30%' },
          { id: 'steady', label: 'Steady as she goes', preview: change >= 0 ? 'Board mood +2' : 'Board mood −6 (they wanted a plan)' },
        ],
        ctx: { profit, dividend, control, change, revolt: 0 },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      const st = s.finance.stock;
      if (!st) return;
      if (opt === 'dividend') {
        const d = Number(e.ctx.dividend);
        if (d > 0 && s.company.cash >= d) {
          s.company.cash -= d;
          st.dividendsPaid += d;
          st.boardMood = clamp(st.boardMood + 10, 0, 100);
          st.price *= 1.03;
          pushNews(s, { category: 'studio', headline: `${s.company.name} pays a ${fmtMoney(d)} dividend`, tone: 'good' });
        }
      } else if (opt === 'bold') {
        st.expectation *= 1.3;
        st.price *= 1.06;
        st.boardMood = clamp(st.boardMood + 6, 0, 100);
        pushNews(s, { category: 'studio', headline: `${s.company.name} promises shareholders bold growth`, tone: 'neutral' });
      } else if (opt === 'steady') {
        st.boardMood = clamp(st.boardMood + (Number(e.ctx.change) >= 0 ? 2 : -6), 0, 100);
      } else if (opt === 'fight') {
        const win = rng.chance(Math.min(0.9, 0.25 + Number(e.ctx.control) * 0.8 + s.company.reputation / 400));
        if (win) {
          st.boardMood = clamp(st.boardMood + 15, 0, 100);
          pushNews(s, { category: 'studio', headline: `${s.company.founderName} survives a no-confidence vote`, tone: 'good' });
        } else {
          st.price *= 0.88;
          addRep(s, -4, 'Lost a shareholder vote');
          pushNews(s, { category: 'studio', headline: `Shareholders rebuke ${s.company.name}’s leadership`, tone: 'bad' });
        }
      } else if (opt === 'concede') {
        st.boardMood = clamp(st.boardMood + 20, 0, 100);
        s.company.moraleMods.push({ v: -8, until: s.day + 180, label: 'Cost-cutting mandate' });
      }
    },
  },
  {
    id: 'poach_offer',
    art: 'handshake',
    cooldown: 120,
    weight: (s) => (staffList(s).some((x) => x.loyalty < 60 && x.poachCooldown <= 0 && Math.max(...Object.values(x.skills)) > 55) ? 0.9 : 0),
    make: ({ s, rng }) => {
      const cands = staffList(s).filter((x) => x.loyalty < 60 && x.poachCooldown <= 0);
      if (!cands.length) return null;
      const st = cands.reduce((a, b) => (Math.max(...Object.values(b.skills)) > Math.max(...Object.values(a.skills)) ? b : a));
      const rivals = Object.values(s.rivals).filter((r) => r.alive && !r.ownedByPlayer && r.staff > 10);
      const rival = rivals.length ? rng.pick(rivals) : undefined;
      if (!rival) return null;
      const raise = Math.round(st.salary * 0.3);
      return {
        title: `${rival.name} wants ${st.name}`,
        body: `${rival.name} has offered ${st.name} a big raise to join them. ${st.name} is tempted (loyalty ${Math.round(st.loyalty)}%).`,
        options: [
          { id: 'counter', label: `Counter-offer (+${fmtMoney(raise)}/yr)`, preview: 'Salary up, loyalty +25, morale +8' },
          { id: 'promise', label: 'Promise a lead role', preview: 'Loyalty +12; if not promoted within a year they may leave' },
          { id: 'let_go', label: 'Wish them well', preview: `${st.name} leaves for ${rival.name}` },
        ],
        ctx: { staff: st.id, rival: rival.id, raise },
      };
    },
    resolve: ({ s }, e, opt) => {
      const st = staffById(s, e.ctx.staff);
      if (!st) return;
      st.poachCooldown = 240;
      if (opt === 'counter') {
        st.salary += Number(e.ctx.raise);
        st.loyalty = clamp(st.loyalty + 25, 0, 100);
        st.morale = clamp(st.morale + 8, 0, 100);
      } else if (opt === 'promise') {
        st.loyalty = clamp(st.loyalty + 12, 0, 100);
      } else {
        removeStaff(s, st.id);
        s.progress.stats.staffLost += 1;
        const rv = s.rivals[String(e.ctx.rival)];
        if (rv) rv.quality = clamp(rv.quality + 0.01, 0, 1);
        pushNews(s, { category: 'staff', headline: `${st.name} joins ${rv?.name ?? 'a rival'}`, tone: 'bad' });
      }
    },
  },
  {
    id: 'journalist_preview',
    art: 'press',
    cooldown: 150,
    weight: (s) => (activeGames(s).some((p) => p.announcedDay !== undefined) ? 0.5 + s.company.reputation / 100 : 0),
    make: ({ s }) => {
      const p = activeGames(s).find((x) => x.announcedDay !== undefined);
      if (!p) return null;
      return {
        title: 'A journalist wants an early look',
        body: `A big magazine wants a hands-on preview of ${p.concept.name}. Great buzz if it impresses — but it's still rough.`,
        options: [
          { id: 'grant', label: 'Grant the preview', preview: 'Hype +0.3 (or −0.15 if the build disappoints)' },
          { id: 'refuse', label: 'Politely decline', preview: 'No change' },
        ],
        ctx: { project: p.id },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      if (!p || p.kind !== 'game' || opt !== 'grant') return;
      const q = p.qualityPreview?.total ?? 0.5;
      if (rng.chance(clamp(q, 0.2, 0.9))) {
        p.hype = Math.min(3, p.hype + 0.3);
        pushNews(s, { category: 'studio', headline: `Hands-on: ${p.concept.name} "looks fantastic"`, tone: 'good' });
      } else {
        p.hype = Math.max(0, p.hype - 0.15);
        pushNews(s, { category: 'studio', headline: `Preview: ${p.concept.name} "needs work"`, tone: 'bad' });
      }
    },
  },
  {
    id: 'staff_conflict',
    art: 'conflict',
    cooldown: 120,
    weight: (s) => (staffList(s).length >= 3 ? 0.4 + (staffList(s).some((x) => x.traits.includes('hothead')) ? 0.8 : 0) + (anyCrunch(s) ? 0.5 : 0) : 0),
    make: ({ s, rng }) => {
      const l = staffList(s);
      if (l.length < 2) return null;
      const a = l.find((x) => x.traits.includes('hothead')) ?? rng.pick(l);
      const b = rng.pick(l.filter((x) => x !== a));
      return {
        title: 'Office argument',
        body: `${a.name} and ${b.name} had a loud disagreement about the direction of the project. The team is unsettled.`,
        options: [
          { id: 'mediate', label: `Bring in a mediator (${fmtMoney(money(1500, s.day))})`, preview: 'Both morale +5' },
          { id: 'talk', label: 'Talk to them yourself', preview: '70%: resolved. 30%: both morale −6' },
          { id: 'ignore', label: 'Let them sort it out', preview: 'Both morale −10; small chance one quits' },
        ],
        ctx: { a: a.id, b: b.id },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      const a = staffById(s, e.ctx.a);
      const b = staffById(s, e.ctx.b);
      const both = (d: number) => [a, b].forEach((x) => x && (x.morale = clamp(x.morale + d, 0, 100)));
      if (opt === 'mediate') {
        spend(s, 'other_expense', money(1500, s.day));
        both(5);
      } else if (opt === 'talk') {
        if (!rng.chance(0.7)) both(-6);
      } else {
        both(-10);
        if (a && rng.chance(0.15)) {
          removeStaff(s, a.id);
          s.progress.stats.staffLost += 1;
          pushNews(s, { category: 'staff', headline: `${a.name} quits after the argument`, tone: 'bad' });
        }
      }
    },
  },
  {
    id: 'team_retreat',
    art: 'mountain',
    cooldown: 300,
    weight: (s) => (staffList(s).length >= 4 ? 0.5 : 0),
    make: ({ s }) => {
      const cost = money(400, s.day) * staffList(s).length;
      return {
        title: 'Team retreat request',
        body: 'The team asks for a weekend retreat to recharge and bond.',
        options: [
          { id: 'go', label: `Book it (${fmtMoney(cost)})`, preview: 'Studio morale +10 for 3 months, energy refilled' },
          { id: 'no', label: 'Not this year', preview: 'Morale −3 for a month' },
        ],
        ctx: { cost },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt === 'go') {
        spend(s, 'other_expense', Number(e.ctx.cost));
        mod(s, 10, 90, 'Team retreat');
        for (const st of Object.values(s.staff)) st.energy = 100;
      } else mod(s, -3, 30, 'Retreat declined');
    },
  },
  {
    id: 'crunch_pizza',
    art: 'pizza',
    cooldown: 60,
    weight: (s) => (anyCrunch(s) ? 1.2 : 0),
    make: ({ s }) => ({
      title: 'Late night at the office',
      body: 'The crunch team is still here at midnight. Someone suggests pizza.',
      options: [
        { id: 'pizza', label: `Order pizza for everyone (${fmtMoney(money(150, s.day))})`, preview: 'Morale +4 for 2 weeks' },
        { id: 'home', label: 'Send everyone home', preview: 'Energy +20, lose a day of crunch output' },
        { id: 'nothing', label: 'Keep going', preview: 'Nothing changes' },
      ],
      ctx: {},
    }),
    resolve: ({ s }, _e, opt) => {
      if (opt === 'pizza') {
        spend(s, 'other_expense', money(150, s.day));
        mod(s, 4, 14, 'Crunch pizza');
      } else if (opt === 'home') for (const st of Object.values(s.staff)) st.energy = clamp(st.energy + 20, 0, 100);
    },
  },
  {
    id: 'crunch_exposed',
    art: 'megaphone',
    cooldown: 400,
    weight: (s) => (anyCrunch(s) && yr(s) >= 2004 && s.company.reputation > 25 ? 0.6 : 0),
    make: ({ s }) => ({
      title: 'Crunch story goes viral',
      body: `An anonymous post about crunch at ${s.company.name} is trending.`,
      options: [
        { id: 'end', label: 'Apologise and end crunch', preview: 'All crunch stops; reputation +1; morale +6' },
        { id: 'deny', label: 'Deny everything', preview: 'Reputation −4; morale −6' },
      ],
      ctx: {},
    }),
    resolve: ({ s }, _e, opt) => {
      if (opt === 'end') {
        for (const p of activeGames(s)) p.crunch = false;
        addRep(s, 1, 'Ended crunch publicly');
        mod(s, 6, 60, 'Crunch ended');
      } else {
        addRep(s, -(4), 'Denied crunch reports');
        mod(s, -6, 60, 'Crunch denial');
      }
    },
  },
  {
    id: 'exclusivity',
    art: 'contract',
    cooldown: 360,
    weight: (s) => (activeGames(s).some((p) => p.concept.platforms.length > 1) && s.company.reputation > 20 ? 0.6 : 0),
    make: ({ s, rng }) => {
      const p = activeGames(s).find((x) => x.concept.platforms.length > 1);
      if (!p) return null;
      const pid = rng.pick(p.concept.platforms);
      const plat = pid;
      const holder = Object.values(s.rivals).find((r) => r.alive && COMPANY_BY_ID[r.id]?.kind === 'platform_holder');
      const amount = money(20_000, s.day) * ({ small: 1, medium: 3, large: 8, aaa: 20 }[p.concept.size]) * (1 + s.company.reputation / 50);
      return {
        title: 'Exclusivity offer',
        body: `A platform holder offers ${fmtMoney(amount)} to make ${p.concept.name} exclusive to one platform.`,
        options: [
          { id: 'accept', label: `Accept ${fmtMoney(amount)}`, preview: 'Game ships on that platform only' },
          { id: 'decline', label: 'Stay multi-platform', preview: 'No change' },
        ],
        ctx: { project: p.id, platform: plat, amount: Math.round(amount), holder: holder?.id ?? '' },
      };
    },
    resolve: ({ s }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      if (!p || p.kind !== 'game' || opt !== 'accept') return;
      p.concept.platforms = [String(e.ctx.platform)];
      earn(s, 'other_income', Number(e.ctx.amount));
    },
  },
  {
    id: 'crowdfunding',
    art: 'crowd',
    cooldown: 500,
    weight: (s) => (hasFlag(s, 'crowdfunding') && activeGames(s).length > 0 && s.company.cash < money(200_000, s.day) ? 0.6 : 0),
    make: ({ s }) => {
      const p = activeGames(s)[0];
      if (!p) return null;
      return {
        title: 'Crowdfund it?',
        body: `Your fans could fund ${p.concept.name} directly. Success depends on reputation and fans.`,
        options: [
          { id: 'run', label: 'Launch a campaign', preview: 'Raise money + hype, or fail publicly' },
          { id: 'no', label: 'No thanks', preview: 'No change' },
        ],
        ctx: { project: p.id },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      if (opt !== 'run') return;
      const p = s.projects[String(e.ctx.project)];
      const chance = clamp(0.25 + s.company.reputation / 120 + Math.log10(1 + s.company.fans) / 20, 0.2, 0.9);
      if (rng.chance(chance)) {
        const raised = Math.round((s.company.fans * 0.6 + 2000) * rng.range(8, 25) * inflation(s.day) * 0.3);
        earn(s, 'other_income', raised);
        if (p && p.kind === 'game') p.hype = Math.min(3, p.hype + 0.4);
        pushNews(s, { category: 'studio', headline: `Crowdfunding success: ${fmtMoney(raised)} raised`, tone: 'good' });
      } else {
        addRep(s, -(2), 'Crowdfunding fell short');
        pushNews(s, { category: 'studio', headline: 'Crowdfunding campaign falls short', tone: 'bad' });
      }
    },
  },
  {
    id: 'hardware_failure',
    art: 'smoke',
    cooldown: 360,
    weight: (s) => (s.office.items.length > 8 ? 0.3 : 0),
    make: ({ s }) => {
      const cost = money(2500 + s.office.items.length * 80, s.day);
      return {
        title: 'Hardware meltdown',
        body: 'A power surge fried several machines. Work grinds to a halt.',
        options: [
          { id: 'repair', label: `Replace everything now (${fmtMoney(cost)})`, preview: 'Back to normal' },
          { id: 'patch', label: 'Make do', preview: 'Morale −6 for 2 months' },
        ],
        ctx: { cost },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt === 'repair') spend(s, 'office', Number(e.ctx.cost));
      else mod(s, -6, 60, 'Broken hardware');
    },
  },
  {
    id: 'tax_audit',
    art: 'audit',
    cooldown: 900,
    weight: (s) => (s.progress.stats.totalRevenue > money(500_000, s.day) ? 0.25 : 0),
    make: ({ s }) => {
      const fine = Math.round(Math.max(money(5_000, s.day), s.company.cash * 0.03));
      return {
        title: 'Tax audit',
        body: 'The tax office has questions about your R&D credits.',
        options: [
          { id: 'settle', label: `Settle (${fmtMoney(fine)})`, preview: 'Pay and move on' },
          { id: 'contest', label: 'Contest it', preview: '55%: pay nothing. 45%: pay double' },
        ],
        ctx: { fine },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      const fine = Number(e.ctx.fine);
      if (opt === 'settle') spend(s, 'taxes', fine);
      else if (!rng.chance(0.55)) spend(s, 'taxes', fine * 2);
    },
  },
  {
    id: 'intern',
    art: 'student',
    cooldown: 240,
    weight: (s) => (freeDesks(s) > 0 && yr(s) >= 1984 ? 0.5 : 0),
    make: ({ s, rng }) => {
      const cand = generateCandidate(s, rng, { quality: -20 });
      cand.potential = clamp(cand.potential + 25, 0, 100);
      const salary = Math.round(marketSalary(s, cand.skills) * 0.45);
      return {
        title: 'Eager intern',
        body: `${cand.name}, ${aOrAn(cand.role)} student, begs for an internship. Raw, but full of potential (${cand.potential}).`,
        options: [
          { id: 'hire', label: `Hire as intern (${fmtMoney(salary)}/yr)`, preview: 'A junior with high potential joins' },
          { id: 'no', label: 'Not right now', preview: 'No change' },
        ],
        ctx: { cand: JSON.stringify(cand), salary },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt !== 'hire') return;
      const cand = JSON.parse(String(e.ctx.cand));
      const id = newId(s, 's');
      s.staff[id] = candidateToStaff(s, cand, id, Number(e.ctx.salary));
      s.staff[id]!.loyalty = 75;
      s.progress.stats.staffHired += 1;
      assignDesks(s);
    },
  },
  {
    id: 'fan_mail',
    art: 'letters',
    cooldown: 200,
    weight: (s) => (s.releaseOrder.some((id) => s.releases[id]!.score >= 80) ? 0.5 : 0),
    make: ({ s }) => ({
      title: 'A sack of fan mail',
      body: `Players have written in about ${s.releases[s.releaseOrder[s.releaseOrder.length - 1]!]!.name}. Some letters are in crayon.`,
      options: [{ id: 'read', label: 'Read them to the team', preview: 'Studio morale +5 for a month' }],
      ctx: {},
    }),
    resolve: ({ s }) => mod(s, 5, 30, 'Fan mail'),
  },
  {
    id: 'buyout_offer',
    art: 'briefcase',
    cooldown: 720,
    weight: (s) => (s.company.reputation >= 45 && !s.finance.stock ? 0.25 : 0),
    make: ({ s, rng }) => {
      const big = Object.values(s.rivals).filter((r) => r.alive && !r.procedural && r.staff > 200);
      if (!big.length) return null;
      const r = rng.pick(big);
      const price = Math.round(valuation(s) * rng.range(1.2, 1.6));
      if (price <= 0) return null;
      return {
        title: `${r.name} wants to buy you`,
        body: `${r.name} offers ${fmtMoney(price)} for ${s.company.name}. Accepting ends your run with a "Sold" ending.`,
        options: [
          { id: 'sell', label: `Sell for ${fmtMoney(price)}`, preview: 'Game ends — scored in the Hall of Fame' },
          { id: 'decline', label: 'We are not for sale', preview: 'Morale +4 (the team loves independence)' },
        ],
        ctx: { rival: r.id, price },
      };
    },
    resolve: ({ s, out }, e, opt) => {
      if (opt === 'sell') {
        earn(s, 'asset_sales', Number(e.ctx.price));
        s.status = 'acquired';
        s.endReason = `Sold to ${s.rivals[String(e.ctx.rival)]?.name} for ${fmtMoney(Number(e.ctx.price))}.`;
        out.push({ type: 'gameOver', reason: s.endReason });
      } else mod(s, 4, 60, 'Stayed independent');
    },
  },
  {
    id: 'hostile_takeover',
    art: 'shark',
    cooldown: 720,
    weight: (s) => (s.finance.stock && s.finance.stock.founderShares / s.finance.stock.shares < 0.5 && s.finance.stock.price < s.finance.stock.ipoPrice * 0.8 ? 0.8 : 0),
    make: ({ s, rng }) => {
      const st = s.finance.stock!;
      const big = Object.values(s.rivals).filter((r) => r.alive && !r.procedural && r.staff > 150);
      if (!big.length) return null;
      const r = rng.pick(big);
      const toBuy = Math.round(st.shares * 0.52 - st.founderShares);
      const defend = Math.round(Math.max(0, toBuy) * st.price * 1.25);
      return {
        title: 'Hostile takeover bid!',
        body: `${r.name} is buying up your shares. Buy back enough stock to keep control, or lose the company.`,
        options: [
          { id: 'defend', label: `Buy back shares (${fmtMoney(defend)})`, preview: 'Requires the cash; keeps control', disabled: s.company.cash < defend },
          { id: 'lose', label: 'Let it happen', preview: 'Game over — acquired' },
        ],
        ctx: { rival: r.id, defend, toBuy },
      };
    },
    resolve: ({ s, out }, e, opt) => {
      const st = s.finance.stock;
      if (!st) return;
      if (opt === 'defend' && s.company.cash >= Number(e.ctx.defend)) {
        s.company.cash -= Number(e.ctx.defend);
        st.founderShares += Math.max(0, Number(e.ctx.toBuy));
        st.boardMood = clamp(st.boardMood - 10, 0, 100);
      } else {
        s.status = 'acquired';
        s.endReason = `Taken over by ${s.rivals[String(e.ctx.rival)]?.name}.`;
        out.push({ type: 'gameOver', reason: s.endReason });
      }
    },
  },
  {
    id: 'loan_shark',
    art: 'shark',
    cooldown: 180,
    weight: (s) => (s.company.insolventSince !== undefined ? 1.5 : 0),
    make: ({ s }) => {
      const amount = Math.round(Math.max(money(15_000, s.day), -s.company.cash * 1.3));
      return {
        title: 'A "friendly" lender calls',
        body: `A private lender offers ${fmtMoney(amount)} today. The terms are… aggressive.`,
        options: [
          { id: 'take', label: `Take ${fmtMoney(amount)} (repay 160% within a year)`, preview: 'Cash now; heavy monthly payments' },
          { id: 'no', label: 'Hang up', preview: 'No change' },
        ],
        ctx: { amount },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt !== 'take') return;
      const amount = Number(e.ctx.amount);
      // ~100% APR over 12 months ≈ 1.6× repaid; interest shows up in the ledger as loan interest
      const rate = 1.0;
      const i = rate / 12;
      s.company.cash += amount;
      s.finance.loans.push({ id: newId(s, 'l'), principal: amount, remaining: amount, rate, monthly: (amount * i) / (1 - Math.pow(1 + i, -12)), monthsLeft: 12, takenDay: s.day });
      s.company.creditScore = clamp(s.company.creditScore - 30, 300, 850);
    },
  },
  {
    id: 'ratings_controversy',
    art: 'megaphone',
    cooldown: 400,
    weight: (s) => (!hasFlag(s, 'ratings') && s.releaseOrder.slice(-1).some((id) => s.releases[id]!.concept.audience === 'mature' && s.day - s.releases[id]!.day < 60) ? 2 : 0),
    make: ({ s }) => {
      const r = s.releases[s.releaseOrder[s.releaseOrder.length - 1]!]!;
      return {
        title: 'Moral panic!',
        body: `Parents' groups and TV pundits are outraged by ${r.name}.`,
        options: [
          { id: 'apologise', label: 'Apologise publicly', preview: 'Reputation −1, sales unaffected' },
          { id: 'lean', label: 'Lean into the controversy', preview: 'Sales potential +20%, reputation −5' },
        ],
        ctx: { rel: r.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const r = s.releases[String(e.ctx.rel)];
      if (opt === 'apologise') addRep(s, -(1), 'Apologised for a controversy');
      else {
        addRep(s, -(5), 'Leaned into a controversy');
        if (r) for (const p of r.platforms) p.potential *= 1.2;
      }
    },
  },
  {
    id: 'game_jam',
    art: 'lightbulb',
    cooldown: 240,
    weight: (s) => (staffList(s).length >= 2 ? 0.45 : 0),
    make: () => ({
      title: 'Weekend game jam?',
      body: 'The team wants to host a 48-hour game jam for fresh ideas.',
      options: [
        { id: 'jam', label: 'Let’s jam', preview: 'Morale +6 for 2 months; next game gets a novelty bonus' },
        { id: 'no', label: 'Rest instead', preview: 'Energy refilled' },
      ],
      ctx: {},
    }),
    resolve: ({ s }, _e, opt) => {
      if (opt === 'jam') {
        mod(s, 6, 60, 'Game jam');
        for (const p of activeGames(s)) p.novelty += 0.03;
      } else for (const st of Object.values(s.staff)) st.energy = 100;
    },
  },
  {
    id: 'charity_bundle',
    art: 'heart',
    cooldown: 500,
    weight: (s) => (yr(s) >= 2010 && s.releaseOrder.length > 2 ? 0.35 : 0),
    make: () => ({
      title: 'Charity bundle invitation',
      body: 'A charity bundle wants one of your older games.',
      options: [
        { id: 'join', label: 'Donate a game', preview: 'Reputation +2, fans +5%' },
        { id: 'no', label: 'Decline', preview: 'No change' },
      ],
      ctx: {},
    }),
    resolve: ({ s }, _e, opt) => {
      if (opt === 'join') {
        addRep(s, 2, 'Charity bundle');
        s.company.fans *= 1.05;
      }
    },
  },
  {
    id: 'four_day_week',
    art: 'calendar',
    cooldown: 900,
    weight: (s) => (yr(s) >= 2019 && staffList(s).length >= 8 && !s.company.policies.fourDayWeek ? 0.35 : 0),
    make: () => ({
      title: 'Four-day week petition',
      body: 'Staff petition for a four-day work week. Studies say output barely drops.',
      options: [
        { id: 'adopt', label: 'Adopt it', preview: 'Morale +9 permanently, output −12%, burnout heals faster' },
        { id: 'trial', label: 'Promise to review next year', preview: 'Morale −2 for 2 months' },
      ],
      ctx: {},
    }),
    resolve: ({ s }, _e, opt) => {
      if (opt === 'adopt') s.company.policies.fourDayWeek = true;
      else mod(s, -2, 60, 'Petition deferred');
    },
  },
  {
    id: 'remote_work',
    art: 'house',
    cooldown: 900,
    weight: (s) => (yr(s) >= 2020 && !s.company.policies.remote ? 0.6 : 0),
    make: () => ({
      title: 'Remote work?',
      body: 'Many staff want to keep working from home part of the week.',
      options: [
        { id: 'yes', label: 'Go hybrid', preview: 'Morale +4 permanently; office crowding matters less' },
        { id: 'no', label: 'Back to the office', preview: 'Morale −5 for 3 months' },
      ],
      ctx: {},
    }),
    resolve: ({ s }, _e, opt) => {
      if (opt === 'yes') s.company.policies.remote = true;
      else mod(s, -5, 90, 'Return-to-office mandate');
    },
  },
  {
    id: 'genai_controversy',
    art: 'robot',
    cooldown: 720,
    weight: (s) => (s.research.done.includes('ai_genai') ? 0.5 : 0),
    make: () => ({
      title: 'AI tools backlash',
      body: 'Players and some staff object to your use of generative AI tools.',
      options: [
        { id: 'disclose', label: 'Publish a clear AI-use policy', preview: 'Reputation +1, morale +3' },
        { id: 'ignore', label: 'Say nothing', preview: 'Reputation −3' },
      ],
      ctx: {},
    }),
    resolve: ({ s }, _e, opt) => {
      if (opt === 'disclose') {
        addRep(s, 1, 'Clear AI-use policy');
        mod(s, 3, 90, 'Clear AI policy');
      } else addRep(s, -(3), 'AI tools backlash');
    },
  },
  {
    id: 'esports_sponsor',
    art: 'trophy',
    cooldown: 400,
    weight: (s) => (s.research.done.includes('biz_esports') ? 0.4 : 0),
    make: ({ s }) => {
      const cost = money(60_000, s.day);
      return {
        title: 'Sponsor a tournament?',
        body: 'An esports league offers naming rights for its finals.',
        options: [
          { id: 'sponsor', label: `Sponsor (${fmtMoney(cost)})`, preview: 'Fans +8%, reputation +2' },
          { id: 'no', label: 'Pass', preview: 'No change' },
        ],
        ctx: { cost },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt !== 'sponsor') return;
      spend(s, 'marketing', Number(e.ctx.cost));
      s.company.fans *= 1.08;
      addRep(s, 2, 'Esports sponsorship');
    },
  },
  {
    id: 'build_leak',
    art: 'leak',
    cooldown: 500,
    weight: (s) => (activeGames(s).some((p) => p.hype > 0.8) ? 0.4 : 0),
    make: ({ s }) => {
      const p = activeGames(s).find((x) => x.hype > 0.8);
      if (!p) return null;
      return {
        title: 'Build leaked!',
        body: `An early build of ${p.concept.name} is circulating online.`,
        options: [
          { id: 'embrace', label: 'Embrace the buzz', preview: 'Hype +0.2, team morale −4' },
          { id: 'legal', label: `Send lawyers (${fmtMoney(money(8_000, s.day))})`, preview: 'Hype unchanged' },
        ],
        ctx: { project: p.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      if (!p || p.kind !== 'game') return;
      if (opt === 'embrace') {
        p.hype = Math.min(3, p.hype + 0.2);
        mod(s, -4, 45, 'Leaked build');
      } else spend(s, 'other_expense', money(8_000, s.day));
    },
  },
  {
    id: 'office_party',
    art: 'heart',
    cooldown: 330,
    weight: (s) => (fromDay(s.day).month === 12 && staffList(s).length >= 3 ? 2 : 0),
    make: ({ s }) => {
      const cost = money(150, s.day) * Object.keys(s.staff).length;
      return {
        title: 'Holiday party?',
        body: 'It’s December. The team is hoping for an end-of-year celebration.',
        options: [
          { id: 'party', label: `Throw a party (${fmtMoney(cost)})`, preview: 'Morale +8 for 2 months, loyalty +5' },
          { id: 'bonus', label: `Small cash bonus instead (${fmtMoney(cost * 2)})`, preview: 'Morale +5, loyalty +10' },
          { id: 'no', label: 'Skip it this year', preview: 'Morale −4 for a month' },
        ],
        ctx: { cost },
      };
    },
    resolve: ({ s }, e, opt) => {
      const cost = Number(e.ctx.cost);
      if (opt === 'party') {
        spend(s, 'other_expense', cost);
        mod(s, 8, 60, 'Holiday party');
        for (const st of Object.values(s.staff)) st.loyalty = clamp(st.loyalty + 5, 0, 100);
      } else if (opt === 'bonus') {
        spend(s, 'salaries', cost * 2);
        mod(s, 5, 45, 'Year-end bonus');
        for (const st of Object.values(s.staff)) st.loyalty = clamp(st.loyalty + 10, 0, 100);
      } else mod(s, -4, 30, 'No holiday party');
    },
  },
  {
    id: 'review_bomb',
    art: 'megaphone',
    cooldown: 500,
    weight: (s) => {
      if (yr(s) < 2010) return 0;
      const last = s.releaseOrder.length ? s.releases[s.releaseOrder[s.releaseOrder.length - 1]!]! : undefined;
      if (!last || s.day - last.day > 90) return 0;
      return last.concept.monetization !== 'premium' ? 0.8 : 0.2;
    },
    make: ({ s }) => {
      const r = s.releases[s.releaseOrder[s.releaseOrder.length - 1]!]!;
      return {
        title: 'Review bomb!',
        body: `Angry players are flooding stores with 1-star reviews of ${r.name}.`,
        options: [
          { id: 'listen', label: 'Listen and promise changes', preview: 'User score +4, fans +3%' },
          { id: 'ignore', label: 'Ride it out', preview: 'User score −6' },
        ],
        ctx: { rel: r.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const r = s.releases[String(e.ctx.rel)];
      if (!r) return;
      if (opt === 'listen') {
        r.userScore = clamp(r.userScore + 4, 1, 100);
        s.company.fans *= 1.03;
      } else r.userScore = clamp(r.userScore - 6, 1, 100);
    },
  },
  {
    id: 'piracy_drm',
    art: 'leak',
    cooldown: 900,
    weight: (s) => (yr(s) >= 1995 && yr(s) <= 2015 && activeGames(s).some((p) => p.concept.platforms.includes('pc')) ? 0.5 : 0),
    make: ({ s }) => {
      const p = activeGames(s).find((x) => x.concept.platforms.includes('pc'));
      if (!p) return null;
      return {
        title: 'Piracy worries',
        body: `Sales and marketing want strict DRM on the PC version of ${p.concept.name}.`,
        options: [
          { id: 'drm', label: `License strict DRM (${fmtMoney(money(12_000, s.day))})`, preview: 'Hype −0.1 (players hate it)' },
          { id: 'none', label: 'Ship DRM-free', preview: 'Reputation +2 with players' },
        ],
        ctx: { project: p.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      if (opt === 'drm') {
        spend(s, 'other_expense', money(12_000, s.day));
        if (p && p.kind === 'game') p.hype = Math.max(0, p.hype - 0.1);
      } else addRep(s, 2, 'Shipped DRM-free');
    },
  },
  {
    id: 'sequel_demand',
    art: 'letters',
    cooldown: 720,
    weight: (s) => (Object.values(s.franchises).some((f) => f.bestScore >= 80 && s.day - f.lastDay > 500 && f.fans > 20_000) ? 0.6 : 0),
    make: ({ s }) => {
      const f = Object.values(s.franchises)
        .filter((x) => x.bestScore >= 80 && s.day - x.lastDay > 500)
        .sort((a, b) => b.fans - a.fans)[0];
      if (!f) return null;
      return {
        title: `Fans want more ${f.name}`,
        body: `A petition with ${(Math.round(f.fans / 100) * 100).toLocaleString()} signatures asks for a new ${f.name} game.`,
        options: [
          { id: 'tease', label: 'Tease a sequel', preview: 'Franchise fans +15%; fatigue reset' },
          { id: 'thank', label: 'Thank them, promise nothing', preview: 'Reputation +1' },
        ],
        ctx: { fr: f.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const f = s.franchises[String(e.ctx.fr)];
      if (!f) return;
      if (opt === 'tease') {
        f.fans *= 1.15;
        f.fatigue = 0;
      } else addRep(s, 1, 'Grateful to the fans');
    },
  },
  {
    id: 'free_devkit',
    art: 'contract',
    cooldown: 720,
    weight: (s) => (s.company.reputation >= 30 ? 0.4 : 0),
    make: ({ s }) => {
      const fresh = Object.keys(s.market.share).filter((id) => !s.devkits.includes(id) && (s.market.share[id] ?? 0) > 0.05);
      if (!fresh.length) return null;
      const pid = fresh[0]!;
      return {
        title: 'A platform holder comes calling',
        body: 'A platform team offers you a free development kit if you support their system.',
        options: [
          { id: 'take', label: 'Accept the dev kit', preview: 'Free dev kit for a popular platform' },
          { id: 'no', label: 'Not interested', preview: 'No change' },
        ],
        ctx: { platform: pid },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt === 'take' && !s.devkits.includes(String(e.ctx.platform))) {
        s.devkits.push(String(e.ctx.platform));
        pushNews(s, { category: 'studio', headline: `${s.company.name} receives a free dev kit`, tone: 'good' });
      }
    },
  },
  {
    id: 'speedrunners',
    art: 'trophy',
    cooldown: 720,
    weight: (s) => (yr(s) >= 2004 && s.releaseOrder.some((id) => ['platformer', 'action', 'racing', 'shooter'].includes(s.releases[id]!.concept.genre) && s.releases[id]!.score >= 75) ? 0.35 : 0),
    make: ({ s }) => {
      const r = s.releaseOrder
        .map((id) => s.releases[id]!)
        .filter((x) => x.score >= 75)
        .pop();
      if (!r) return null;
      return {
        title: 'Speedrunners adore your game',
        body: `${r.name} is a hit at a charity speedrun marathon.`,
        options: [
          { id: 'support', label: `Sponsor the marathon (${fmtMoney(money(5_000, s.day))})`, preview: 'Fans +5%, reputation +1, sales bump' },
          { id: 'enjoy', label: 'Just enjoy the moment', preview: 'Small sales bump' },
        ],
        ctx: { rel: r.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const r = s.releases[String(e.ctx.rel)];
      if (r) {
        for (const p of r.platforms) p.potential *= opt === 'support' ? 1.08 : 1.03;
        r.active = true;
      }
      if (opt === 'support') {
        spend(s, 'marketing', money(5_000, s.day));
        s.company.fans *= 1.05;
        addRep(s, 1, 'Sponsored a charity marathon');
      }
    },
  },
  {
    id: 'mentorship',
    art: 'student',
    cooldown: 400,
    weight: (s) => (staffList(s).some((x) => x.level === 'lead') && staffList(s).some((x) => x.level === 'junior') ? 0.5 : 0),
    make: ({ s }) => {
      const lead = staffList(s).find((x) => x.level === 'lead');
      if (!lead) return null;
      return {
        title: 'Mentorship programme',
        body: `${lead.name} offers to run weekly mentoring sessions for the juniors.`,
        options: [
          { id: 'yes', label: 'Great idea', preview: 'Juniors gain skill and loyalty; the mentor gets tired' },
          { id: 'no', label: 'Keep focused on shipping', preview: 'No change' },
        ],
        ctx: { lead: lead.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt !== 'yes') return;
      const lead = staffById(s, e.ctx.lead);
      for (const st of staffList(s)) {
        if (st.level !== 'junior') continue;
        const best = (Object.keys(st.skills) as (keyof typeof st.skills)[]).reduce((a, b) => (st.skills[a] >= st.skills[b] ? a : b));
        st.skills[best] = Math.min(st.potential, st.skills[best] + 4);
        st.loyalty = clamp(st.loyalty + 5, 0, 100);
      }
      if (lead) lead.energy = clamp(lead.energy - 20, 0, 100);
    },
  },
  {
    id: 'patent_troll',
    art: 'audit',
    cooldown: 1200,
    weight: (s) => (s.progress.stats.totalRevenue > money(2_000_000, s.day) ? 0.2 : 0),
    make: ({ s }) => {
      const fee = Math.round(Math.max(money(20_000, s.day), s.company.cash * 0.02));
      return {
        title: 'Patent claim',
        body: 'A company you’ve never heard of claims your engine infringes a vague patent.',
        options: [
          { id: 'settle', label: `Settle quietly (${fmtMoney(fee)})`, preview: 'Pay and move on' },
          { id: 'fight', label: `Fight it in court (${fmtMoney(fee / 2)} legal fees)`, preview: '65%: win and gain reputation. 35%: pay double' },
        ],
        ctx: { fee },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      const fee = Number(e.ctx.fee);
      if (opt === 'settle') spend(s, 'other_expense', fee);
      else {
        spend(s, 'other_expense', fee / 2);
        if (rng.chance(0.65)) {
          addRep(s, 2, 'Beat a patent troll');
          pushNews(s, { category: 'studio', headline: `${s.company.name} defeats patent claim`, tone: 'good' });
        } else spend(s, 'other_expense', fee * 2);
      }
    },
  },
  {
    id: 'magazine_cover',
    art: 'press',
    cooldown: 500,
    weight: (s) => (yr(s) < 2012 && activeGames(s).some((p) => p.announcedDay !== undefined) && s.company.reputation > 20 ? 0.5 : 0),
    make: ({ s }) => {
      const p = activeGames(s).find((x) => x.announcedDay !== undefined);
      if (!p) return null;
      return {
        title: 'Cover story offer',
        body: `A leading magazine wants ${p.concept.name} on its cover — if you pay for an exclusive photo shoot.`,
        options: [
          { id: 'yes', label: `Do the shoot (${fmtMoney(money(6_000, s.day))})`, preview: 'Hype +0.35' },
          { id: 'no', label: 'Pass', preview: 'No change' },
        ],
        ctx: { project: p.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      if (opt !== 'yes' || !p || p.kind !== 'game') return;
      spend(s, 'marketing', money(6_000, s.day));
      p.hype = Math.min(3, p.hype + 0.35);
    },
  },
  // ── Grassroots (help small studios get noticed) ───────────────────────────
  {
    id: 'club_demo_night',
    art: 'crowd',
    cooldown: 400,
    weight: (s) => (yr(s) < 1995 && s.company.reputation < 25 && s.releaseOrder.length > 0 ? 0.6 : 0),
    make: ({ s }) => {
      const last = s.releases[s.releaseOrder[s.releaseOrder.length - 1]!];
      if (!last) return null;
      return {
        title: 'Computer club demo night',
        body: `The local computer club invites you to show ${last.name} at their monthly meeting. Mostly hobbyists — but one of them writes for a magazine.`,
        options: [
          { id: 'go', label: 'Bring the floppies (a day off work)', preview: 'Reputation +3; games in development get a little hype' },
          { id: 'skip', label: 'Too busy', preview: 'No change' },
        ],
        ctx: {},
      };
    },
    resolve: ({ s }, _e, opt) => {
      if (opt !== 'go') return;
      addRep(s, 3, 'Demo night at the computer club');
      for (const p of activeGames(s)) p.hype = Math.min(3, p.hype + 0.15);
    },
  },
  {
    id: 'online_game_jam',
    art: 'lightbulb',
    cooldown: 500,
    weight: (s) => (yr(s) >= 2005 && s.company.reputation < 35 && staffList(s).length + 1 <= 12 ? 0.5 : 0),
    make: ({ s }) => ({
      title: 'A weekend game jam',
      body: 'A popular online game jam starts this weekend. Your team could enter — 48 hours, one theme, no sleep.',
      options: [
        { id: 'enter', label: 'Enter as a team', preview: 'Reputation +3, morale +5 for a month, everyone a bit tired' },
        { id: 'host', label: `Sponsor the jam (${fmtMoney(money(4_000, s.day))})`, preview: 'Reputation +4, a talented candidate joins the hiring pool', disabled: s.company.cash < money(4_000, s.day) },
        { id: 'skip', label: 'Rest instead', preview: 'No change' },
      ],
      ctx: {},
    }),
    resolve: (c, _e, opt) => {
      const { s } = c;
      if (opt === 'enter') {
        addRep(s, 3, 'Game jam entry went viral');
        mod(s, 5, 30, 'Game jam buzz');
        for (const st of Object.values(s.staff)) st.energy = Math.max(10, st.energy - 25);
      } else if (opt === 'host' && s.company.cash >= money(4_000, s.day)) {
        spend(s, 'marketing', money(4_000, s.day));
        addRep(s, 4, 'Sponsored a game jam');
        const cand = generateCandidate(s, c.rng, { quality: 25 });
        cand.potential = Math.min(100, cand.potential + 15);
        s.candidates.push(cand);
      }
    },
  },
  // ── Your legacy ───────────────────────────────────────────────────────────
  {
    id: 'movie_deal',
    art: 'press',
    cooldown: 1500,
    weight: (s) => (yr(s) >= 1990 && bigFranchise(s) ? 0.3 : 0),
    make: ({ s }) => {
      const fr = bigFranchise(s);
      if (!fr) return null;
      const fee = Math.round(money(500_000, s.day) * Math.min(4, fr.fans / 1_000_000));
      const coCost = money(800_000, s.day);
      return {
        title: `Hollywood wants ${fr.name}`,
        body: `A film studio wants to turn ${fr.name} into a movie. Game adaptations have a… mixed record.`,
        options: [
          { id: 'license', label: `Sell the film rights (+${fmtMoney(fee)})`, preview: '50%: a hit, fans +15%. 50%: a stinker, fans −8%, reputation −2' },
          { id: 'coproduce', label: `Co-produce and keep control (${fmtMoney(coCost)})`, preview: '75%: a hit, fans +25%, reputation +3. 25%: a flop, fans −5%', disabled: s.company.cash < coCost },
          { id: 'decline', label: 'Decline', preview: 'No change' },
        ],
        ctx: { fr: fr.id, fee, coCost },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      const fr = s.franchises[String(e.ctx.fr)];
      if (!fr || opt === 'decline') return;
      if (opt === 'license') {
        earn(s, 'licensing', Number(e.ctx.fee));
        if (rng.chance(0.5)) {
          fr.fans = Math.round(fr.fans * 1.15);
          pushNews(s, { category: 'industry', headline: `The ${fr.name} movie is a surprise box-office hit`, tone: 'good' });
        } else {
          fr.fans = Math.round(fr.fans * 0.92);
          addRep(s, -2, `The ${fr.name} movie flopped`);
          pushNews(s, { category: 'industry', headline: `Critics savage the ${fr.name} movie`, tone: 'bad' });
        }
      } else if (s.company.cash >= Number(e.ctx.coCost)) {
        spend(s, 'marketing', Number(e.ctx.coCost));
        if (rng.chance(0.75)) {
          fr.fans = Math.round(fr.fans * 1.25);
          addRep(s, 3, `The ${fr.name} movie was a hit`);
          pushNews(s, { category: 'industry', headline: `${fr.name} conquers cinemas — and sends fans back to the games`, tone: 'good' });
        } else {
          fr.fans = Math.round(fr.fans * 0.95);
          pushNews(s, { category: 'industry', headline: `The ${fr.name} movie underwhelms at the box office`, tone: 'bad' });
        }
      }
    },
  },
  {
    id: 'retro_mini',
    art: 'console',
    cooldown: 2500,
    weight: (s) => (yr(s) >= 2016 && retroClassics(s).length >= 3 ? 0.3 : 0),
    make: ({ s }) => {
      const games = retroClassics(s).slice(0, 8);
      if (games.length < 3) return null;
      const fee = money(60_000, s.day) * games.length;
      return {
        title: 'A mini console of your classics',
        body: `A hardware maker wants to put ${games.length} of your old games — ${games
          .slice(0, 3)
          .map((g) => g.name)
          .join(', ')}${games.length > 3 ? '…' : ''} — on a nostalgic plug-and-play mini console.`,
        options: [
          { id: 'yes', label: `License them (+${fmtMoney(fee)})`, preview: 'Cash, reputation +1, fans of those franchises +5%' },
          { id: 'no', label: 'Keep the classics in the vault', preview: 'No change' },
        ],
        ctx: { fee, ids: games.map((g) => g.id).join(',') },
      };
    },
    resolve: ({ s }, e, opt) => {
      if (opt !== 'yes') return;
      earn(s, 'licensing', Number(e.ctx.fee));
      addRep(s, 1, 'Classics re-released on a mini console');
      const fids = new Set(String(e.ctx.ids).split(',').map((id) => s.releases[id]?.concept.franchiseId).filter((x): x is string => !!x));
      for (const fid of fids) {
        const fr = s.franchises[fid];
        if (fr) fr.fans = Math.round(fr.fans * 1.05);
      }
      pushNews(s, { category: 'studio', headline: `${s.company.name} classics return on a retro mini console`, tone: 'good' });
    },
  },
  // ── Your own hardware ─────────────────────────────────────────────────────
  {
    id: 'hw_defect',
    art: 'console',
    cooldown: 900,
    weight: (s) => (liveHw(s).some((h) => s.day - h.launchDay > 60 && s.day - h.launchDay < 3 * 365 && h.installedM > 0.2) ? 0.5 : 0),
    make: ({ s }) => {
      const hw = liveHw(s).find((h) => s.day - h.launchDay > 60 && s.day - h.launchDay < 3 * 365 && h.installedM > 0.2);
      if (!hw) return null;
      const recall = Math.round(hw.installedM * 1e6 * 0.25 * money(8, s.day));
      return {
        title: `${hw.name} units are failing`,
        body: `Forums are full of owners reporting a fault that bricks their ${hw.name}. Retailers are asking what you'll do about it.`,
        options: [
          { id: 'recall', label: `Free repairs for everyone (${fmtMoney(recall)})`, preview: 'Expensive, but reputation +2 and buyers trust the brand' },
          { id: 'warranty', label: `Quietly extend the warranty (${fmtMoney(recall * 0.4)})`, preview: 'Cheaper; reputation −3' },
          { id: 'deny', label: 'Deny there is a problem', preview: 'Free; reputation −8 and hardware sales slump' },
        ],
        ctx: { hw: hw.id, recall },
      };
    },
    resolve: ({ s }, e, opt) => {
      const hw = s.hardware.find((h) => h.id === e.ctx.hw);
      if (!hw) return;
      const recall = Number(e.ctx.recall);
      if (opt === 'recall') {
        spend(s, 'manufacturing', recall);
        addRep(s, 2, `Fixed every faulty ${hw.name}`);
        hw.boost += 0.05;
      } else if (opt === 'warranty') {
        spend(s, 'manufacturing', recall * 0.4);
        addRep(s, -3, `${hw.name} fault handled quietly`);
      } else {
        addRep(s, -8, `Denied the ${hw.name} hardware fault`);
        hw.boost = Math.max(-0.4, hw.boost - 0.35);
        pushNews(s, { category: 'studio', headline: `${s.company.name} denies ${hw.name} fault as complaints pile up`, tone: 'bad' });
      }
    },
  },
  {
    id: 'hw_piracy',
    art: 'console',
    cooldown: 1200,
    weight: (s) => (liveHw(s).some((h) => s.day - h.launchDay > 365) ? 0.35 : 0),
    make: ({ s }) => {
      const hw = liveHw(s).find((h) => s.day - h.launchDay > 365);
      if (!hw) return null;
      const patch = money(400_000, s.day);
      return {
        title: `The ${hw.name} has been cracked`,
        body: `Hackers have published a way to run copied games on the ${hw.name}. Publishers on your platform are nervous.`,
        options: [
          { id: 'patch', label: `Rush out a security update (${fmtMoney(patch)})`, preview: 'Closes the hole' },
          { id: 'sue', label: `Take the hackers to court (${fmtMoney(patch / 3)})`, preview: '60%: shut it down. 40%: bad press, reputation −3, piracy spreads' },
          { id: 'ignore', label: 'Ignore it', preview: 'More consoles sell, but software and licence fees drop for 18 months' },
        ],
        ctx: { hw: hw.id, patch },
      };
    },
    resolve: ({ s, rng }, e, opt) => {
      const hw = s.hardware.find((h) => h.id === e.ctx.hw);
      if (!hw) return;
      const piracy = () => {
        hw.boost += 0.15;
        s.market.modifiers.push({ target: `platform:${hw.id}`, mul: 0.8, startDay: s.day, untilDay: s.day + 548 });
      };
      if (opt === 'patch') spend(s, 'hardware_rd', Number(e.ctx.patch));
      else if (opt === 'sue') {
        spend(s, 'other_expense', Number(e.ctx.patch) / 3);
        if (!rng.chance(0.6)) {
          addRep(s, -3, 'Sued console hackers and lost');
          piracy();
        }
      } else piracy();
    },
  },
  {
    id: 'hw_retailer',
    art: 'console',
    cooldown: 700,
    weight: (s) => (liveHw(s).some((h) => s.day - h.launchDay > 180) ? 0.45 : 0),
    make: ({ s, rng }) => {
      const hws = liveHw(s).filter((h) => s.day - h.launchDay > 180);
      if (!hws.length) return null;
      const hw = rng.pick(hws);
      const bonus = money(rng.int(3, 8) * 100_000, s.day);
      return {
        title: 'A holiday bundle deal',
        body: `A national retail chain wants an exclusive ${hw.name} holiday bundle. They'll pay a marketing fee, but they want 10% off the shelf price.`,
        options: [
          { id: 'accept', label: `Accept (+${fmtMoney(bonus)})`, preview: 'Price −10%; a burst of hardware sales' },
          { id: 'decline', label: 'Decline', preview: 'No change' },
        ],
        ctx: { hw: hw.id, bonus },
      };
    },
    resolve: ({ s }, e, opt) => {
      const hw = s.hardware.find((h) => h.id === e.ctx.hw);
      if (!hw || opt !== 'accept') return;
      earn(s, 'other_income', Number(e.ctx.bonus));
      hw.price = Math.max(1, Math.round(hw.price * 0.9));
      hw.boost += 0.2;
    },
  },
  // ── The modern scene ──────────────────────────────────────────────────────
  {
    id: 'streamer_spotlight',
    art: 'crowd',
    cooldown: 300,
    weight: (s) => (yr(s) >= 2011 && recentHit(s, 730, 70) ? 0.45 : 0),
    make: ({ s }) => {
      const r = recentHit(s, 730, 70);
      if (!r) return null;
      const cost = money(15_000, s.day);
      return {
        title: `${r.name} is all over the streams`,
        body: `One of the biggest streamers just played ${r.name} for six hours straight, and chat loved it.`,
        options: [
          { id: 'sponsor', label: `Sponsor a follow-up stream (${fmtMoney(cost)})`, preview: 'Sales potential +12%, studio fans +4%', disabled: s.company.cash < cost },
          { id: 'thanks', label: 'Send a thank-you note', preview: 'Sales potential +5%' },
        ],
        ctx: { rel: r.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const r = s.releases[String(e.ctx.rel)];
      if (!r) return;
      const cost = money(15_000, s.day);
      const sponsor = opt === 'sponsor' && s.company.cash >= cost;
      if (sponsor) {
        spend(s, 'marketing', cost);
        s.company.fans *= 1.04;
      }
      for (const ps of r.platforms) ps.potential *= sponsor ? 1.12 : 1.05;
      r.active = true;
    },
  },
  {
    id: 'leaked_build',
    art: 'leak',
    cooldown: 900,
    weight: (s) => (yr(s) >= 1996 && activeGames(s).some((p) => p.phase >= 1 && p.phase < 3) ? 0.2 : 0),
    make: ({ s }) => {
      const p = activeGames(s).find((x) => x.phase >= 1 && x.phase < 3);
      if (!p) return null;
      const cost = money(20_000, s.day);
      return {
        title: `An early build of ${p.concept.name} has leaked`,
        body: 'Screenshots and a playable alpha are spreading online. Fans are… curious.',
        options: [
          { id: 'legal', label: `Send the lawyers (${fmtMoney(cost)})`, preview: 'Contained: no other effect', disabled: s.company.cash < cost },
          { id: 'embrace', label: 'Lean in: “yes, it’s real”', preview: 'Hype +0.3, reputation −1' },
          { id: 'ignore', label: 'Say nothing', preview: 'Hype +0.15, team morale −4 for a month' },
        ],
        ctx: { project: p.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      const cost = money(20_000, s.day);
      if (opt === 'legal') {
        if (s.company.cash >= cost) spend(s, 'other_expense', cost);
        return;
      }
      if (!p || p.kind !== 'game') return;
      if (opt === 'embrace') {
        p.hype = Math.min(3, p.hype + 0.3);
        addRep(s, -1, 'Leaked build');
      } else {
        p.hype = Math.min(3, p.hype + 0.15);
        mod(s, -4, 30, 'The leak');
      }
    },
  },
  {
    id: 'speedrun_record',
    art: 'trophy',
    cooldown: 800,
    weight: (s) => (yr(s) >= 2008 && oldClassic(s) ? 0.3 : 0),
    make: ({ s }) => {
      const r = oldClassic(s);
      if (!r) return null;
      const cost = money(10_000, s.day);
      return {
        title: `A ${r.name} speedrun goes viral`,
        body: `A runner just shaved 11 seconds off the ${r.name} world record with a glitch your team never knew about.`,
        options: [
          { id: 'event', label: `Host a speedrun showcase (${fmtMoney(cost)})`, preview: 'Reputation +2, franchise fans +10%, the game sells again', disabled: s.company.cash < cost },
          { id: 'cheer', label: 'Cheer from the sidelines', preview: 'Franchise fans +3%' },
        ],
        ctx: { rel: r.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const r = s.releases[String(e.ctx.rel)];
      if (!r) return;
      const fr = r.concept.franchiseId ? s.franchises[r.concept.franchiseId] : undefined;
      const cost = money(10_000, s.day);
      if (opt === 'event' && s.company.cash >= cost) {
        spend(s, 'marketing', cost);
        addRep(s, 2, 'Speedrun showcase');
        if (fr) fr.fans *= 1.1;
        for (const ps of r.platforms) ps.potential *= 1.04;
        r.active = true;
      } else if (fr) fr.fans *= 1.03;
    },
  },
  {
    id: 'office_cat',
    art: 'heart',
    cooldown: 3000,
    weight: (s) => (staffList(s).length >= 3 && !s.eventCooldowns.office_cat_adopted ? 0.15 : 0),
    make: () => ({
      title: 'A stray cat wanders into the office',
      body: 'It has claimed the warmest keyboard and refuses to leave. The team is smitten.',
      options: [
        { id: 'adopt', label: 'Adopt the studio cat', preview: 'Morale +4 for two years' },
        { id: 'shelter', label: 'Take it to a shelter', preview: 'No change' },
      ],
      ctx: {},
    }),
    resolve: ({ s }, _e, opt) => {
      if (opt !== 'adopt') return;
      mod(s, 4, 730, 'The studio cat');
      s.eventCooldowns.office_cat_adopted = s.day + 1e7;
      pushNews(s, { category: 'studio', headline: `${s.company.name} adopts a studio cat`, body: 'Productivity is unchanged. Morale is way up.', tone: 'good' });
    },
  },
  {
    id: 'localization_offer',
    art: 'handshake',
    cooldown: 600,
    weight: (s) => (yr(s) >= 1994 && recentHit(s, 365, 72) ? 0.3 : 0),
    make: ({ s }) => {
      const r = recentHit(s, 365, 72);
      if (!r) return null;
      const cost = Math.round(money(12_000, s.day) * (r.concept.size === 'aaa' ? 4 : r.concept.size === 'large' ? 2 : 1));
      return {
        title: `Localize ${r.name}?`,
        body: `A translation studio offers to bring ${r.name} to Japanese, German, French and Brazilian players.`,
        options: [
          { id: 'yes', label: `Localize it (${fmtMoney(cost)})`, preview: 'Sales potential +10% on every platform', disabled: s.company.cash < cost },
          { id: 'no', label: 'English is enough', preview: 'No change' },
        ],
        ctx: { rel: r.id, cost },
      };
    },
    resolve: ({ s }, e, opt) => {
      const r = s.releases[String(e.ctx.rel)];
      const cost = Number(e.ctx.cost);
      if (opt !== 'yes' || !r || s.company.cash < cost) return;
      spend(s, 'other_expense', cost);
      for (const ps of r.platforms) ps.potential *= 1.1;
      r.active = true;
    },
  },
  {
    id: 'voice_strike',
    art: 'conflict',
    cooldown: 1200,
    weight: (s) => (yr(s) >= 2016 && activeGames(s).some((p) => p.phase >= 1 && p.phase < 3 && p.concept.size !== 'small') ? 0.2 : 0),
    make: ({ s }) => {
      const p = activeGames(s).find((x) => x.phase >= 1 && x.phase < 3 && x.concept.size !== 'small');
      if (!p) return null;
      const cost = money(40_000, s.day);
      return {
        title: 'Voice actors are on strike',
        body: `The performers' union is striking over pay and AI clauses. ${p.concept.name}'s recording sessions are on hold.`,
        options: [
          { id: 'agree', label: `Sign the union's terms (${fmtMoney(cost)})`, preview: 'Reputation +2, recording resumes', disabled: s.company.cash < cost },
          { id: 'wait', label: 'Wait it out', preview: 'Release slips by about a month' },
          { id: 'cut', label: 'Ship with text only', preview: 'Hype −0.2' },
        ],
        ctx: { project: p.id },
      };
    },
    resolve: ({ s }, e, opt) => {
      const p = s.projects[String(e.ctx.project)];
      const cost = money(40_000, s.day);
      if (opt === 'agree' && s.company.cash >= cost) {
        spend(s, 'salaries', cost);
        addRep(s, 2, 'Fair deal for performers');
        return;
      }
      if (!p || p.kind !== 'game') return;
      if (opt === 'wait') p.extraDays += 30;
      else if (opt === 'cut') p.hype = Math.max(0, p.hype - 0.2);
    },
  },
];

const DEF_BY_ID = Object.fromEntries(EVENT_DEFS.map((d) => [d.id, d]));

/** Weekly roll for a random event. */
/** Raise a specific event now (scheduled events such as the shareholder meeting). */
export function fireEvent(c: Ctx, defId: string): boolean {
  const { s } = c;
  const def = DEF_BY_ID[defId];
  if (!def || s.pendingEvents.some((e) => e.defId === defId)) return false;
  const made = def.make(c);
  if (!made) return false;
  s.nextEventUid += 1;
  const inst: EventInstance = { uid: s.nextEventUid, defId: def.id, day: s.day, title: made.title, body: made.body, options: made.options, ctx: made.ctx, expiresDay: s.day + 21, art: def.art };
  s.pendingEvents.push(inst);
  s.eventCooldowns[def.id] = s.day + def.cooldown;
  c.out.push({ type: 'event', uid: inst.uid });
  return true;
}

export function rollRandomEvent(c: Ctx): void {
  const { s, rng } = c;
  if (s.pendingEvents.length >= 2) return;
  // New studios get a quiet first few months.
  if (s.day - toDay(s.settings.startYear, 1, 1) < 150) return;
  if (!rng.chance(0.16)) return;
  const eligible = EVENT_DEFS.filter((d) => (s.eventCooldowns[d.id] ?? -1) <= s.day && d.weight(s) > 0);
  if (!eligible.length) return;
  const def = rng.weighted(eligible, (d) => d.weight(s));
  const made = def.make(c);
  if (!made) return;
  s.nextEventUid += 1;
  const inst: EventInstance = {
    uid: s.nextEventUid,
    defId: def.id,
    day: s.day,
    title: made.title,
    body: made.body,
    options: made.options,
    ctx: made.ctx,
    expiresDay: s.day + 21,
    art: def.art,
  };
  s.pendingEvents.push(inst);
  s.eventCooldowns[def.id] = s.day + def.cooldown;
  c.out.push({ type: 'event', uid: inst.uid });
}

export function resolveEvent(c: Ctx, uid: number, optionId: string): boolean {
  const { s } = c;
  const idx = s.pendingEvents.findIndex((e) => e.uid === uid);
  if (idx < 0) return false;
  const inst = s.pendingEvents[idx]!;
  const opt = inst.options.find((o) => o.id === optionId);
  if (!opt || opt.disabled) return false;
  s.pendingEvents.splice(idx, 1);
  DEF_BY_ID[inst.defId]?.resolve(c, inst, optionId);
  return true;
}

/** Events the player ignores resolve to their last (safest/default) option. */
export function expireEvents(c: Ctx): void {
  const { s } = c;
  for (const e of [...s.pendingEvents]) {
    if (e.expiresDay <= s.day) {
      const last = [...e.options].reverse().find((o) => !o.disabled) ?? e.options[e.options.length - 1];
      if (last) resolveEvent(c, e.uid, last.id);
      else s.pendingEvents = s.pendingEvents.filter((x) => x.uid !== e.uid);
    }
  }
}
