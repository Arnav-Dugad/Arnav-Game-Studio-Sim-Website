/**
 * Staff: generation, salary, productivity, morale, energy, burnout, loyalty, growth, quitting.
 */
import { BALANCE } from '../../data/balance';
import { FIRST_NAMES, LAST_NAMES } from '../../data/names';
import { PEOPLE } from '../../data/people';
import { TRAITS, type TraitId } from '../../data/traits';
import { SKILLS, type Skill } from '../../data/types';
import { BD, clamp } from '../breakdown';
import { fromDay, weekday } from '../calendar';
import type { Ctx } from '../ctx';
import type { Rng } from '../rng';
import type { Candidate, GameState, Level, Role, Staff } from '../types';
import { avg, inflation, pushNews, year } from '../util';
import { layout } from './office';
import { talentMultiplier } from './market';

export const ROLE_SKILLS: Record<Role, [Skill, Skill]> = {
  founder: ['design', 'programming'],
  designer: ['design', 'writing'],
  programmer: ['programming', 'design'],
  artist: ['art', 'design'],
  audio: ['audio', 'art'],
  writer: ['writing', 'design'],
  qa: ['qa', 'programming'],
  marketer: ['marketing', 'writing'],
  producer: ['design', 'marketing'],
};

export const ROLE_NAMES: Record<Role, string> = {
  founder: 'Founder',
  designer: 'Designer',
  programmer: 'Programmer',
  artist: 'Artist',
  audio: 'Sound Designer',
  writer: 'Writer',
  qa: 'QA Tester',
  marketer: 'Marketer',
  producer: 'Producer',
};

export const HIREABLE_ROLES: Role[] = ['designer', 'programmer', 'artist', 'audio', 'writer', 'qa', 'marketer', 'producer'];

export function hasTrait(st: { traits: TraitId[] }, t: TraitId): boolean {
  return st.traits.includes(t);
}

export function topSkill(skills: Record<Skill, number>): number {
  return Math.max(...SKILLS.map((k) => skills[k]));
}

export function levelFor(skill: number): Level {
  if (skill >= 82) return 'lead';
  if (skill >= 64) return 'senior';
  if (skill >= 44) return 'mid';
  return 'junior';
}

/** Market-rate yearly salary (nominal) for a skill profile on a day. */
export function marketSalary(s: GameState, skills: Record<Skill, number>, day = s.day): number {
  const top = topSkill(skills);
  const second = [...SKILLS.map((k) => skills[k])].sort((a, b) => b - a)[1] ?? 0;
  const eff = top * 0.85 + second * 0.15;
  const yrs = fromDay(day).year - 1980;
  const v =
    BALANCE.SALARY_BASE *
    Math.pow(Math.max(8, eff) / 50, BALANCE.SALARY_SKILL_EXP) *
    inflation(day) *
    Math.pow(1 + BALANCE.SALARY_ERA_PREMIUM, yrs) *
    s.market.salaryMul *
    BALANCE.DIFFICULTY[s.settings.difficulty].salary;
  return Math.round(v / 100) * 100;
}

function pickTraits(rng: Rng): TraitId[] {
  const n = rng.weighted([1, 2, 3], (k) => (k === 1 ? 5 : k === 2 ? 4 : 1));
  const out: TraitId[] = [];
  let guard = 0;
  while (out.length < n && guard++ < 30) {
    const t = rng.pick(TRAITS);
    if (out.includes(t.id)) continue;
    if (out.some((o) => t.excludes?.includes(o) || TRAITS.find((x) => x.id === o)?.excludes?.includes(t.id))) continue;
    out.push(t.id);
  }
  return out;
}

export function emptySkills(): Record<Skill, number> {
  return { design: 0, programming: 0, art: 0, audio: 0, writing: 0, qa: 0, marketing: 0 };
}

export function generateCandidate(s: GameState, rng: Rng, opts: { role?: Role; quality?: number } = {}): Candidate {
  const role = opts.role ?? rng.pick(HIREABLE_ROLES);
  const [primary, secondary] = ROLE_SKILLS[role];
  const q = opts.quality ?? 0;
  // level distribution shifts with reputation/quality
  const lv = rng.weighted<Level>(['junior', 'mid', 'senior', 'lead'], (l) =>
    l === 'junior' ? 46 - q * 0.4 : l === 'mid' ? 34 : l === 'senior' ? 14 + q * 0.25 : 3 + q * 0.12,
  );
  const range: Record<Level, [number, number]> = { junior: [18, 42], mid: [40, 62], senior: [60, 80], lead: [76, 93] };
  const [lo, hi] = range[lv];
  const base = rng.range(lo, hi);
  const skills = emptySkills();
  for (const k of SKILLS) skills[k] = clamp(Math.round(base * rng.range(0.12, 0.35) + rng.range(0, 10)), 1, 60);
  skills[primary] = clamp(Math.round(base), 5, 99);
  skills[secondary] = clamp(Math.round(base * rng.range(0.5, 0.8)), 3, 90);
  const potential = clamp(Math.round(skills[primary] + rng.range(4, 32)), skills[primary], 100);
  const first = rng.pick(FIRST_NAMES);
  const last = rng.pick(LAST_NAMES);
  const cand: Candidate = {
    id: `c${Math.floor(rng.next() * 1e9).toString(36)}`,
    name: `${first} ${last}`,
    look: Math.floor(rng.next() * 2 ** 31),
    role,
    level: levelFor(skills[primary]),
    skills,
    potential,
    traits: pickTraits(rng),
    salary: 0,
    morale: 70,
    energy: 100,
    burnout: 0,
    loyalty: 50,
    askSalary: 0,
    expiresDay: s.day + 45,
  };
  const ask = marketSalary(s, skills) * rng.range(0.92, 1.15) * (hasTrait(cand, 'mercenary') ? 1.12 : 1);
  cand.askSalary = Math.round(ask / 100) * 100;
  cand.salary = cand.askSalary;
  return cand;
}

/** Legendary real-person candidate (rare). */
function legendaryCandidate(s: GameState, rng: Rng): Candidate | null {
  const yr = year(s);
  const taken = new Set([...Object.values(s.staff).map((x) => x.personId), ...s.candidates.map((c) => c.personId)]);
  const pool = PEOPLE.filter((p) => p.hireable && p.activeFrom <= yr && (p.activeTo ?? 9999) >= yr && !taken.has(p.id));
  if (!pool.length) return null;
  const p = rng.pick(pool);
  const skills = emptySkills();
  for (const k of SKILLS) skills[k] = clamp(Math.round(p.skills[k] ?? rng.range(25, 45)), 5, 100);
  const roleBySkill: Record<Skill, Role> = {
    design: 'designer',
    programming: 'programmer',
    art: 'artist',
    audio: 'audio',
    writing: 'writer',
    qa: 'qa',
    marketing: 'marketer',
  };
  const best = SKILLS.reduce((a, b) => (skills[a] >= skills[b] ? a : b));
  const cand: Candidate = {
    id: `L${p.id}`,
    name: p.name,
    look: 0,
    role: p.role === 'producer' ? 'producer' : roleBySkill[best],
    level: 'lead',
    skills,
    potential: Math.min(100, topSkill(skills) + 4),
    traits: pickTraits(rng).filter((t) => t !== 'bug_magnet' && t !== 'burnout_prone').slice(0, 2),
    salary: 0,
    morale: 75,
    energy: 100,
    burnout: 0,
    loyalty: 45,
    personId: p.id,
    askSalary: 0,
    expiresDay: s.day + 30,
  };
  cand.askSalary = Math.round((marketSalary(s, skills) * 2.2) / 100) * 100;
  cand.salary = cand.askSalary;
  return cand;
}

export function refreshCandidates(c: Ctx): void {
  const { s, rng } = c;
  s.candidates = s.candidates.filter((x) => x.expiresDay > s.day);
  const talent = talentMultiplier(s);
  const head = s.research.done.includes('biz_headhunters') ? 1 : 0;
  const rec = s.company.recruiting;
  const n = Math.round((BALANCE.HIRE_POOL_BASE + s.company.reputation / 14 + head * 2 + rec * 1.5) * Math.sqrt(talent));
  const quality = s.company.reputation * 0.6 + head * 12 + rec * 6 + (talent - 1) * 25;
  while (s.candidates.length < Math.min(14, n)) s.candidates.push(generateCandidate(s, rng, { quality }));
  // Headhunters can lure a rival's senior developer (premium salary, small reputation cost).
  if (s.research.done.includes('biz_headhunters') && !s.candidates.some((c) => c.fromRival) && rng.chance(0.6)) {
    const rivals = Object.values(s.rivals).filter((r) => r.alive && !r.ownedByPlayer && r.staff > 20);
    if (rivals.length) {
      const r = rng.weighted(rivals, (x) => x.reputation);
      const c = generateCandidate(s, rng, { quality: 70 + r.quality * 30 });
      c.fromRival = r.id;
      c.askSalary = Math.round((c.askSalary * 1.4) / 100) * 100;
      c.salary = c.askSalary;
      c.expiresDay = s.day + 30;
      s.candidates.unshift(c);
    }
  }
  if (s.company.reputation >= 35 && rng.chance(0.03 + s.company.reputation / 2500)) {
    const L = legendaryCandidate(s, rng);
    if (L) {
      s.candidates.unshift(L);
      pushNews(s, { category: 'staff', headline: `${L.name} is open to new opportunities`, body: 'A legendary developer is in your hiring pool for a short time.', tone: 'good' });
    }
  }
}

export function candidateToStaff(s: GameState, cand: Candidate, id: string, salary: number): Staff {
  return {
    id,
    name: cand.name,
    look: cand.look,
    role: cand.role,
    level: cand.level,
    skills: { ...cand.skills },
    potential: cand.potential,
    traits: [...cand.traits],
    salary,
    hiredDay: s.day,
    morale: clamp(65 + (salary / Math.max(1, cand.askSalary) - 1) * 60, 35, 95),
    energy: 100,
    burnout: 0,
    loyalty: 50 + (hasTrait(cand, 'loyal') ? 15 : 0),
    personId: cand.personId,
    assignment: { kind: 'idle' },
    activity: 'idle',
    sickDays: 0,
    contributed: 0,
    gamesShipped: 0,
    poachCooldown: 120,
  };
}

// ── Per-day evaluation ───────────────────────────────────────────────────────

export function isCrunching(s: GameState, st: Staff): boolean {
  if (st.assignment.kind !== 'project') return false;
  const p = s.projects[st.assignment.id];
  return !!p && p.kind === 'game' && p.crunch;
}

/** Productivity multiplier with explanation. */
export function productivity(s: GameState, st: Staff): ReturnType<BD['done']> {
  const L = layout(s);
  const bd = new BD('Base', 1);
  const desk = st.deskId ? L.desks[st.deskId] : undefined;
  bd.mul(desk ? 'Desk & hardware' : 'No desk (working from a box)', desk ? (L.deskTierById[st.deskId!] ?? 1) : 0.7);
  bd.mul('Morale', 0.6 + 0.6 * (st.morale / 100));
  bd.mul('Energy', 0.55 + 0.45 * (st.energy / 100));
  if (desk) {
    if (desk.energyDist === Infinity) bd.mul('No break area', 0.92);
    else bd.mul('Walk to break area', 1 - Math.min(0.12, 0.012 + desk.energyDist * 0.006));
    if (desk.noise > 0.5) bd.mul('Noise', 1 - Math.min(0.15, desk.noise * 0.025));
  }
  if (hasTrait(st, 'workaholic')) bd.mul('Workaholic', 1.1);
  if (hasTrait(st, 'perfectionist')) bd.mul('Perfectionist', 0.9);
  if (isCrunching(s, st)) bd.mul('Crunch', BALANCE.CRUNCH_OUTPUT * (hasTrait(st, 'night_owl') ? 1.08 : 1));
  if (s.research.done.includes('ai_genai')) bd.mul('Gen-AI tools', 1.12);
  if (st.burnout > 60) bd.mul('Burnout', 1 - (st.burnout - 60) / 90);
  if (s.company.policies.fourDayWeek) bd.mul('Four-day week', 0.88);
  return bd.done();
}

export function moraleTarget(s: GameState, st: Staff): ReturnType<BD['done']> {
  const L = layout(s);
  const bd = new BD('Baseline', 58);
  const market = marketSalary(s, st.skills);
  if (st.role !== 'founder') bd.add('Pay vs market', clamp((st.salary / market - 1) * 45, -22, 16));
  const desk = st.deskId ? L.desks[st.deskId] : undefined;
  if (!desk) bd.add('No desk', -12);
  else {
    bd.add('Décor nearby', Math.min(14, desk.decor * 1.1));
    const crowdLimit = hasTrait(st, 'social_butterfly') ? 6 : 3;
    const crowdPen = Math.max(0, desk.crowding - crowdLimit) * (hasTrait(st, 'introvert') ? 5 : 2.5);
    bd.add('Crowding', -crowdPen);
    if (hasTrait(st, 'social_butterfly')) bd.add('Busy office (social)', Math.min(4, desk.crowding));
    if (desk.noise > 0.5) bd.add('Noise', -Math.min(8, desk.noise * 1.5));
    bd.add(desk.energyDist === Infinity ? 'No break area' : 'Break area', desk.energyDist === Infinity ? -8 : 3);
  }
  if (L.trophies > 0) bd.add('Trophy shelf', Math.min(8, s.progress.stats.awardsWon * 1.5));
  if (isCrunching(s, st)) bd.add('Crunch', hasTrait(st, 'workaholic') ? -7 : -16);
  // momentum: last two releases
  const last = s.releaseOrder.slice(-2).map((id) => s.releases[id]!.score);
  if (last.length) bd.add('Recent reviews', clamp((avg(last) - 65) / 2.5, -10, 10));
  bd.add('Studio reputation', s.company.reputation / 12);
  if (st.burnout > 30) bd.add('Burnout', -(st.burnout - 30) * 0.3);
  if (st.assignment.kind === 'idle' && st.role !== 'founder') bd.add('Nothing to do', -6);
  if (s.company.policies.salaryPolicy === 'generous') bd.add('Generous benefits', 5);
  if (s.company.policies.salaryPolicy === 'lean') bd.add('Lean benefits', -5);
  if (s.company.policies.remote) bd.add('Remote-friendly', 4);
  if (s.company.policies.fourDayWeek) bd.add('Four-day week', 9);
  if (s.company.lastLayoffDay !== undefined && s.day - s.company.lastLayoffDay < 120) bd.add('Recent layoffs', -12);
  for (const m of s.company.moraleMods) if (m.until > s.day) bd.add(m.label, m.v);
  if (hasTrait(st, 'ambitious') && st.level !== 'junior' && st.salary < market) bd.add('Wants a raise', -6);
  bd.clamp(0, 100);
  return bd.done();
}

/** Off sick or on vacation: not working today. */
export function isAway(st: Staff): boolean {
  return st.sickDays > 0 || (st.vacationDays ?? 0) > 0;
}

export const VACATION_COOLDOWN_DAYS = 120;

/** Why this person can't take a vacation right now (or null if they can). */
export function vacationBlocked(s: GameState, st: Staff): string | null {
  if (st.sickDays > 0) return `${st.name} is off sick`;
  if ((st.vacationDays ?? 0) > 0) return `${st.name} is already on vacation`;
  if (st.assignment.kind === 'training') return `${st.name} is in training`;
  if (st.lastVacationDay !== undefined && s.day - st.lastVacationDay < VACATION_COOLDOWN_DAYS) return `${st.name} had time off recently (again in ${VACATION_COOLDOWN_DAYS - (s.day - st.lastVacationDay)} days)`;
  return null;
}

/** Daily update for every staffer. Returns total salary cost is NOT handled here (monthly). */
export function updateStaffDaily(c: Ctx): void {
  const { s, rng } = c;
  const wd = weekday(s.day);
  const weekend = wd >= 5 || (s.company.policies.fourDayWeek && wd === 4);
  const L = layout(s);
  for (const st of Object.values(s.staff)) {
    if (st.poachCooldown > 0) st.poachCooldown -= 1;
    // Sick leave
    if (st.sickDays > 0) {
      st.sickDays -= 1;
      st.activity = 'sick';
      st.energy = clamp(st.energy + 6, 0, 100);
      st.burnout = clamp(st.burnout - 2.5, 0, 100);
      continue;
    }
    // Vacation: away from the office, recharging fast
    if ((st.vacationDays ?? 0) > 0) {
      st.vacationDays = st.vacationDays! - 1;
      st.activity = 'vacation';
      st.energy = clamp(st.energy + 10, 0, 100);
      st.burnout = clamp(st.burnout - 4, 0, 100);
      st.morale = clamp(st.morale + 0.8, 0, 100);
      continue;
    }
    const crunch = isCrunching(s, st);
    const working = st.assignment.kind !== 'idle' && (!weekend || crunch);
    const desk = st.deskId ? L.desks[st.deskId] : undefined;
    if (working) {
      let drain = crunch ? BALANCE.ENERGY_DRAIN_CRUNCH : BALANCE.ENERGY_DRAIN;
      if (hasTrait(st, 'workaholic')) drain *= 1.2;
      if (hasTrait(st, 'coffee_fiend')) drain *= 1.15;
      st.energy -= drain;
      if (st.energy < BALANCE.BREAK_THRESHOLD) {
        const gain = desk && desk.energyDist !== Infinity ? desk.energyGain : 8;
        st.energy += gain * (hasTrait(st, 'coffee_fiend') ? 1.35 : 1);
        st.activity = 'break';
      } else st.activity = st.assignment.kind === 'research' ? 'research' : st.assignment.kind === 'training' ? 'training' : 'work';
    } else {
      st.energy += weekend ? BALANCE.WEEKEND_RECOVERY / 2 : 6;
      st.activity = 'idle';
    }
    st.energy = clamp(st.energy, 0, 100);
    // burnout
    let bGain = 0;
    if (st.energy < 25) bGain += BALANCE.BURNOUT_GAIN_LOW_ENERGY;
    if (crunch) bGain += BALANCE.BURNOUT_GAIN_CRUNCH;
    if (hasTrait(st, 'burnout_prone')) bGain *= 1.5;
    if (hasTrait(st, 'chill')) bGain *= 0.7;
    if (bGain > 0) st.burnout += bGain;
    else if (st.energy > 55) st.burnout -= BALANCE.BURNOUT_DECAY * (s.company.policies.fourDayWeek ? 1.4 : 1);
    st.burnout = clamp(st.burnout, 0, 100);
    if (st.burnout > 80) st.activity = 'burnout';
    if (st.burnout > 75 && rng.chance(0.01 + (st.burnout - 75) / 900)) {
      st.sickDays = rng.int(5, 14);
      st.activity = 'sick';
      c.out.push({ type: 'staffSick', staffId: st.id });
      pushNews(s, { category: 'staff', headline: `${st.name} is off sick with exhaustion`, body: `Out for ${st.sickDays} days. Burnout was at ${Math.round(st.burnout)}%.`, tone: 'bad' });
    }
    // morale
    if (s.day % 7 === 0 || !st.moraleWhy) st.moraleWhy = moraleTarget(s, st);
    const target = st.moraleWhy.total;
    let rate = BALANCE.MORALE_RATE;
    if (hasTrait(st, 'hothead')) rate *= 2;
    if (hasTrait(st, 'chill')) rate *= 0.5;
    st.morale = clamp(st.morale + (target - st.morale) * rate, 0, 100);
    // chatting animation flavour (cosmetic but deterministic)
    if (st.activity === 'work' && rng.chance(0.04)) st.activity = 'chat';
  }
}

export function updateStaffMonthly(c: Ctx): void {
  const { s, rng } = c;
  for (const st of Object.values(s.staff)) {
    if (st.role === 'founder') {
      st.loyalty = 100;
      if (fromDay(s.day).month === 1) st.salary = Math.max(st.salary, Math.round(BALANCE.FOUNDER_SALARY * inflation(s.day)));
      continue;
    }
    const market = marketSalary(s, st.skills);
    let dl = (st.morale - 50) / 25 + 0.3;
    if (hasTrait(st, 'loyal')) dl += 1;
    if (hasTrait(st, 'mercenary')) dl -= 0.6 - (st.salary >= market * 1.1 ? 1 : 0);
    if (st.salary >= market * 1.05) dl += 0.6;
    st.loyalty = clamp(st.loyalty + dl, 0, 100);
    // promotion by skill
    const [primary] = ROLE_SKILLS[st.role];
    const lv = levelFor(st.skills[primary]);
    if (lv !== st.level) {
      const order: Level[] = ['junior', 'mid', 'senior', 'lead'];
      if (order.indexOf(lv) > order.indexOf(st.level)) {
        st.level = lv;
        pushNews(s, { category: 'staff', headline: `${st.name} grew into a ${lv} ${ROLE_NAMES[st.role].toLowerCase()}`, tone: 'good' });
      }
    }
    // quitting
    let pQuit = 0;
    if (st.morale < BALANCE.QUIT_MORALE) pQuit += 0.12 + (BALANCE.QUIT_MORALE - st.morale) / 60;
    if (st.burnout > 92) pQuit += 0.25;
    if (st.loyalty > 80) pQuit *= 0.5;
    if (pQuit > 0 && rng.chance(pQuit)) {
      removeStaff(s, st.id);
      s.progress.stats.staffLost += 1;
      const reason = st.burnout > 92 ? 'burnout' : 'low morale';
      c.out.push({ type: 'staffQuit', name: st.name, reason });
      pushNews(s, { category: 'staff', headline: `${st.name} has resigned`, body: `Citing ${reason}. Morale was ${Math.round(st.morale)}%.`, tone: 'bad' });
    }
  }
  s.company.moraleMods = s.company.moraleMods.filter((m) => m.until > s.day);
}

export function removeStaff(s: GameState, id: string): void {
  const st = s.staff[id];
  if (!st) return;
  for (const p of Object.values(s.projects)) p.team = p.team.filter((t) => t !== id);
  delete s.staff[id];
}

/** Skill growth from a day of work on a skill (weight 0..1). */
export function growSkill(s: GameState, st: Staff, skill: Skill, weight: number, mentorBoost: number): void {
  const gap = st.potential - st.skills[skill];
  if (gap <= 0 || weight <= 0) return;
  let g = BALANCE.SKILL_GROWTH * weight * (gap / 100) * (1 + mentorBoost);
  if (hasTrait(st, 'fast_learner')) g *= 1.6;
  if (hasTrait(st, 'ambitious')) g *= 1.2;
  st.skills[skill] = Math.min(st.potential, st.skills[skill] + g);
  void s;
}

export function payrollMonthly(s: GameState): number {
  let total = 0;
  for (const st of Object.values(s.staff)) total += st.salary / 12;
  return total;
}
