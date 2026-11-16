/**
 * Random choice events. Each event's weight depends on game state, so events react to the systems
 * (crunch → incidents, fame → journalists, low cash → predatory loans…).
 */
import { COMPANY_BY_ID } from '../../data/companies';
import { clamp } from '../breakdown';
import { fromDay, toDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { EventInstance, EventOption, GameProject, GameState, Staff } from '../types';
import { addRep, earn, fmtMoney, hasFlag, inflation, money, newId, pushNews, spend } from '../util';
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
const mod = (s: GameState, v: number, days: number, label: string) => s.company.moraleMods.push({ v, until: s.day + days, label });

function staffById(s: GameState, id: string | number | undefined): Staff | undefined {
  return id === undefined ? undefined : s.staff[String(id)];
}

export const EVENT_DEFS: EventDef[] = [
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
        body: `${cand.name}, a ${cand.role} student, begs for an internship. Raw, but full of potential (${cand.potential}).`,
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
];

const DEF_BY_ID = Object.fromEntries(EVENT_DEFS.map((d) => [d.id, d]));

/** Weekly roll for a random event. */
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
