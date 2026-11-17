/**
 * Development pipeline: daily progress for game / contract / engine projects, bug creation and QA,
 * phase gates, and the quality model (with full breakdown).
 */
import { teamChemistry } from './relations';
import { CULTURE_FX } from '../../data/culture';
import { hasValue } from './culture';
import { LOC_WORK } from '../../data/regions';
import { FEATURE_BY_ID } from '../../data/gameFeatures';
import { BALANCE } from '../../data/balance';
import { GENRE_BY_ID } from '../../data/genres';
import { TOPIC_BY_ID } from '../../data/topics';
import { RESEARCH_BY_ID } from '../../data/research';
import { PHASE_AREAS, type Area, type Skill } from '../../data/types';
import { BD, clamp, type Breakdown } from '../breakdown';
import { fromDay, weekday } from '../calendar';
import type { Ctx } from '../ctx';
import type { ContractProject, EngineProject, GameProject, GameState, Size, Staff } from '../types';
import { addRep, earn, inflation, newId, pushNews, spend } from '../util';
import { layout } from './office';
import { growSkill, hasTrait, isCrunching, productivity } from './staff';
import { expectedTech, platformAudienceFit, platformGenreFit, platformInfo, genrePopularity, topicPopularity } from './market';
import { releaseGame } from './release';

export const AREA_SKILL: Record<Area, Skill[]> = {
  engine: ['programming'],
  gameplay: ['design'],
  story: ['writing'],
  level: ['design'],
  dialogue: ['writing'],
  ai: ['programming'],
  world: ['art', 'design'],
  graphics: ['art'],
  sound: ['audio'],
};

/** Areas that produce design points (the rest are tech). */
export const DESIGN_AREAS: ReadonlySet<Area> = new Set<Area>(['gameplay', 'story', 'level', 'dialogue', 'world']);

const SPEC_AREA_BONUS: Partial<Record<NonNullable<Staff['spec']>, Partial<Record<Area, number>>>> = {
  engine_programmer: { engine: 0.25, ai: 0.2 },
  lead_designer: { gameplay: 0.15, level: 0.15 },
  art_director: { graphics: 0.2, world: 0.2 },
  composer: { sound: 0.3 },
  narrative_director: { story: 0.25, dialogue: 0.25 },
};

export function areaSkill(st: Staff, a: Area): number {
  const ks = AREA_SKILL[a];
  let v = 0;
  for (const k of ks) v += st.skills[k];
  return v / ks.length;
}

/** Points per 100%-productive person-day that define "par" for a size in a year. */
export function benchmarkPoints(size: Size, day: number): number {
  const sz = BALANCE.SIZE[size];
  const raw = fromDay(day).year - 1980;
  // In endless mode (after 2026) the bar keeps rising, but half as fast.
  const yrs = Math.min(raw, 46) + Math.max(0, raw - 46) * 0.5;
  return sz.typicalTeam * sz.days * BALANCE.POINTS_PER_DAY * BALANCE.BENCHMARK_SKILL * BALANCE.BENCHMARK_PROD * Math.pow(1 + BALANCE.BENCHMARK_GROWTH, yrs);
}

export function sizeDailyCost(size: Size, day: number): number {
  const base = { small: 0, medium: 90, large: 420, aaa: 1_900 }[size];
  const yrs = fromDay(day).year - 1980;
  return base * inflation(day) * Math.pow(1.065, yrs);
}

/** Team coordination overhead and synergy multiplier. */
export function teamSynergy(s: GameState, team: Staff[]): Breakdown {
  const L = layout(s);
  const bd = new BD('Team', 1);
  const n = team.length;
  const producers = team.filter((t) => t.role === 'producer' || t.spec === 'producer').length;
  if (n > 4) bd.mul('Coordination overhead', 1 - Math.min(0.25, 0.012 * (n - 4)) * Math.pow(0.5, Math.min(3, producers)));
  if (L.meeting > 0 && n > 1) bd.mul('Meeting space', 1 + L.meeting);
  const tp = team.filter((t) => hasTrait(t, 'team_player')).length;
  if (tp && n > 1) bd.mul('Team players', 1 + Math.min(0.1, tp * 0.025));
  const hot = team.filter((t) => hasTrait(t, 'hothead')).length;
  if (hot && n > 1) bd.mul('Hotheads', 1 - Math.min(0.08, hot * 0.03));
  if (n > 1) {
    const chem = teamChemistry(s, team.filter((x) => x.role !== 'founder'));
    if (Math.abs(chem.avg) >= 1) bd.mul(chem.avg >= 0 ? 'Team chemistry' : 'Bad blood', 1 + clamp(chem.avg / 100, -0.6, 1) * 0.06);
    for (const [a, b] of chem.feuds.slice(0, 2)) bd.mul(`Feud: ${a.name.split(' ')[0]} vs ${b.name.split(' ')[0]}`, 0.96);
  }
  // seated near each other
  if (n > 1) {
    const desks = team.map((t) => (t.deskId ? L.desks[t.deskId] : undefined)).filter(Boolean);
    let near = 0;
    for (let i = 0; i < desks.length; i++)
      for (let j = i + 1; j < desks.length; j++) {
        const a = desks[i]!;
        const b = desks[j]!;
        if (a.floor === b.floor && Math.abs(a.x - b.x) + Math.abs(a.y - b.y) <= 4) near++;
      }
    const pairs = (desks.length * (desks.length - 1)) / 2;
    if (pairs > 0) bd.mul('Seated together', 1 + 0.06 * (near / pairs));
  }
  return bd.done();
}

function mentorBoost(s: GameState, st: Staff, team: Staff[]): number {
  const L = layout(s);
  const d = st.deskId ? L.desks[st.deskId] : undefined;
  let b = d?.trainingBoost ?? 0;
  // an assigned mentor teaches wherever they sit
  const mentor = st.mentorId ? s.staff[st.mentorId] : undefined;
  if (mentor && mentor.sickDays <= 0 && !(mentor.vacationDays ?? 0)) b += 0.4;
  for (const m of team) {
    if (m === st || !hasTrait(m, 'mentor')) continue;
    const md = m.deskId ? L.desks[m.deskId] : undefined;
    if (d && md && d.floor === md.floor && Math.abs(d.x - md.x) + Math.abs(d.y - md.y) <= 4) b += 0.3;
  }
  return b;
}

function teamOf(s: GameState, ids: string[]): Staff[] {
  return ids.map((id) => s.staff[id]).filter((x): x is Staff => !!x && x.sickDays <= 0 && !(x.vacationDays ?? 0));
}

function isWorkday(s: GameState, crunch: boolean): boolean {
  const wd = weekday(s.day);
  if (crunch) return true;
  if (wd >= 5) return false;
  return true;
}

// ── Games ────────────────────────────────────────────────────────────────────

export function phaseLength(size: Size, phase: number): number {
  return Math.max(4, Math.round(BALANCE.SIZE[size].days * BALANCE.PHASE_SHARE[phase as 0 | 1 | 2]));
}

function progressGame(c: Ctx, p: GameProject): void {
  const { s } = c;
  if (p.awaitingGate) return;
  const team = teamOf(s, p.team);
  const L = layout(s);
  const engine = s.engines[p.concept.engineId];
  const crunch = p.crunch;
  const workday = isWorkday(s, crunch);
  // Calendar time always advances (deadlines are real), output only on workdays.
  // Production costs (assets, outsourcing, QA vendors) accrue daily.
  const dc = sizeDailyCost(p.concept.size, s.day);
  if (dc > 0) {
    spend(s, 'other_expense', dc);
    p.spent += dc;
  }
  if (crunch) s.progress.stats.crunchDays += 1;
  if (crunch) s.progress.stats.crunchRecent = (s.progress.stats.crunchRecent ?? 0) + 1;
  if (crunch) s.progress.stats.noCrunchSince = s.day;
  const phase = Math.min(2, p.phase) as 0 | 1 | 2;
  const areas = PHASE_AREAS[phase]!;
  const focus = p.focus[phase]!;
  const fsum = focus[0] + focus[1] + focus[2] || 1;
  if (workday && team.length) {
    const syn = teamSynergy(s, team).total;
    const portPenalty = 1 - Math.min(0.2, 0.06 * (p.concept.platforms.length - 1));
    let avgProg = 0;
    for (const st of team) avgProg += st.skills.programming;
    avgProg /= team.length;
    for (const st of team) {
      const prod = productivity(s, st);
      st.productivityWhy = prod;
      const mb = mentorBoost(s, st, team);
      for (let i = 0; i < 3; i++) {
        const a = areas[i]!;
        const w = focus[i]! / fsum;
        if (w <= 0) continue;
        let pts = w * (areaSkill(st, a) / 100) * prod.total * BALANCE.POINTS_PER_DAY * syn * portPenalty * (s.cheats?.workMul ?? 1);
        const sb = st.spec ? SPEC_AREA_BONUS[st.spec]?.[a] : undefined;
        if (sb) pts *= 1 + sb;
        if (a === 'sound' && L.audio > 0) pts *= 1 + L.audio;
        if (a === 'graphics' && L.mocap > 0 && engine?.features.includes('gfx_3d_1')) pts *= 1 + L.mocap;
        if (hasTrait(st, 'perfectionist')) pts *= 1.12; // quality per point (net ~+1% after speed)
        p.points[a] += pts;
        if (DESIGN_AREAS.has(a)) p.design += pts;
        else {
          p.tech += pts;
          // bugs
          let br = BALANCE.BUG_RATE * (1.35 - avgProg / 140);
          if (crunch) br *= BALANCE.CRUNCH_BUGS;
          if (hasValue(s, 'speed')) br *= CULTURE_FX.speedBugs;
          if (engine) br *= 1 - engine.maturity * 0.35;
          if (hasTrait(st, 'bug_magnet')) br *= 1.35;
          if (hasTrait(st, 'meticulous')) br *= 0.7;
          if (p.concept.platforms.length > 2) br *= 1.1;
          p.bugs += pts * br;
        }
        for (const k of AREA_SKILL[a]) growSkill(s, st, k, w, mb);
        st.contributed += pts;
      }
      if (hasTrait(st, 'visionary')) p.novelty += 0.0015;
    }
    // QA fixing: always a little, much more in polish
    const polish = p.phase >= 2;
    let fix = 0;
    for (const st of team) {
      const prod = st.productivityWhy?.total ?? 1;
      let f = (st.skills.qa / 100) * prod * (polish ? 0.9 : 0.15);
      if (st.role === 'qa') f *= 1.5;
      if (st.spec === 'qa_lead') f *= 1.4;
      if (hasTrait(st, 'meticulous')) f *= 1.3;
      fix += f;
      if (polish) growSkill(s, st, 'qa', 0.3, 0);
    }
    fix *= 1 + L.qa;
    if (s.research.done.includes('ai_ml_tools')) fix *= 1.1;
    const fixed = Math.min(p.bugs, fix * BALANCE.QA_FIX_RATE * 10);
    p.bugs -= fixed;
    p.bugsFixed += fixed;
  }
  // advance phase clock
  p.phaseDay += 1;
  if (p.phase < 3) {
    const len = p.phaseDays[p.phase as 0 | 1 | 2];
    if (p.phaseDay >= len) {
      if (p.phase < 2) {
        p.phase = (p.phase + 1) as 0 | 1 | 2;
        p.phaseDay = 0;
        if (s.settings.autopause.gates) {
          p.awaitingGate = true;
          p.qualityPreview = gameQuality(s, p, true);
          c.out.push({ type: 'gate', projectId: p.id, phase: p.phase });
        }
      } else {
        p.phase = 3;
        p.phaseDay = 0;
      }
    }
  }
  if (p.phase === 3) {
    if (p.extraDays > 0) {
      p.extraDays -= 1;
    } else {
      p.qualityPreview = gameQuality(s, p);
      releaseGame(c, p);
      return;
    }
  }
  if (s.day % 7 === 0 || p.awaitingGate) p.qualityPreview = gameQuality(s, p, true);

}

/** Cosine similarity between two 3-vectors. */
function cos3(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < 3; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function focusAlignment(p: GameProject): number {
  const g = GENRE_BY_ID[p.concept.genre];
  let total = 0;
  for (let ph = 0; ph < 3; ph++) {
    const areas = PHASE_AREAS[ph]!;
    const ideal = areas.map((a) => g.ideal[a]);
    total += cos3(p.focus[ph]!, ideal);
  }
  return total / 3;
}

/** Combination fit for genre × topic × audience. */
export function comboFit(genre: GameProject['concept']['genre'], topic: string, audience: GameProject['concept']['audience']) {
  const g = GENRE_BY_ID[genre];
  const t = TOPIC_BY_ID[topic];
  const gt = (t?.genreFit[genre] ?? 1) as 0 | 1 | 2 | 3;
  const gtMul = [0.72, 0.93, 1.0, 1.1][gt]!;
  const aud = Math.sqrt((g.audience[audience] ?? 1) * (t?.audience[audience] ?? 1));
  return { gt, gtMul, aud };
}

/** Fraction of the scheduled development time that has elapsed (for previews). */
export function devProgress(p: GameProject): number {
  const total = p.phaseDays[0] + p.phaseDays[1] + p.phaseDays[2];
  const done = p.phase >= 3 ? total : p.phaseDays.slice(0, p.phase).reduce((a, b) => a + b, 0) + p.phaseDay;
  return Math.max(0.05, Math.min(1, done / Math.max(1, total)));
}

/** Share of a full game's work: remasters and expansions are smaller jobs. */
export function workShare(c: { remasterOf?: string; expansionOf?: string; features?: string[]; localized?: readonly string[] }): number {
  const base = c.remasterOf ? BALANCE.REMASTER_WORK : c.expansionOf ? BALANCE.EXPANSION_WORK : 1;
  return base * featureWork(c.features) * (1 + LOC_WORK * (c.localized?.length ?? 0));
}

/** Extra scope from signature features (clamped so a game can't balloon or shrink too far). */
export function featureWork(features: string[] | undefined): number {
  let w = 1;
  for (const id of features ?? []) w += FEATURE_BY_ID[id]?.work ?? 0;
  return clamp(w, 0.85, 1.6);
}

/**
 * Quality model. With `project`, effort/bugs are extrapolated to the end of development at the current
 * pace — used for in-progress estimates so the preview isn't misleadingly low early on.
 */
export function gameQuality(s: GameState, p: GameProject, project = false): Breakdown {
  const c = p.concept;
  const g = GENRE_BY_ID[c.genre];
  const scale = project ? 1 / devProgress(p) : 1;
  const total = (p.design + p.tech) * scale;
  const orig = c.remasterOf ? s.releases[c.remasterOf] : undefined;
  const bench = benchmarkPoints(c.size, s.day) * workShare(c);
  const r = total / bench;
  const bd = new BD('Development effort', r / (r + 0.35));
  // design/tech ratio
  const ratio = total > 0 ? (p.design * scale) / total : g.designRatio;
  bd.mul(`Design/tech balance (${Math.round(ratio * 100)}% design, ideal ${Math.round(g.designRatio * 100)}%)`, 1 - Math.min(0.35, Math.abs(ratio - g.designRatio) * 1.2));
  // focus alignment
  const al = focusAlignment(p);
  bd.mul('Focus matches genre', 0.62 + 0.43 * clamp((al - 0.55) / 0.45, 0, 1));
  const cf = comboFit(c.genre, c.topic, c.audience);
  bd.mul(`${g.name} × ${TOPIC_BY_ID[c.topic]?.name ?? c.topic} fit`, cf.gtMul);
  bd.mul('Audience fit', clamp(0.85 + (cf.aud - 1) * 0.6, 0.7, 1.08));
  // platform fit (average across chosen platforms)
  let pf = 0;
  let tf = 0;
  const engine = s.engines[c.engineId];
  for (const pid of c.platforms) {
    const pl = platformInfo(s, pid);
    if (!pl) continue;
    pf += Math.sqrt(platformGenreFit(pl, c.genre) * platformAudienceFit(pl, c.audience));
    const exp = expectedTech(s, pl);
    tf += clamp(0.62 + 0.4 * ((engine?.tech ?? 1) / exp), 0.62, 1.06);
  }
  const np = Math.max(1, c.platforms.length);
  bd.mul('Platform fit', clamp(0.88 + (pf / np - 1) * 0.5, 0.75, 1.1));
  bd.mul(`Engine tech (${engine ? engine.tech.toFixed(1) : '1'})`, tf / np);
  // research genre bonuses from engine features
  let rb = 0;
  for (const f of engine?.features ?? []) rb += RESEARCH_BY_ID[f]?.genreBonus?.[c.genre] ?? 0;
  bd.mul('Engine features', 1 + Math.min(0.15, rb));
  // trends
  const pop = genrePopularity(s, c.genre) / Math.max(0.3, interpAvg(s));
  bd.mul('Genre trend', clamp(0.94 + (pop - 1) * 0.12, 0.88, 1.08));
  bd.mul('Topic trend', clamp(0.97 + (topicPopularity(s, c.topic) - 1) * 0.08, 0.93, 1.06));
  // novelty / repetition
  if (orig) bd.mul(`Remaster of ${orig.name} (${Math.round(orig.score)})`, clamp(0.9 + (orig.score - 70) / 150, 0.9, 1.1));
  for (const id of c.features ?? []) {
    const f = FEATURE_BY_ID[id];
    if (!f) continue;
    const fit = f.fits[c.genre];
    if (fit) bd.mul(`${f.name} (great for ${g.name})`, fit);
    else if (f.misfit !== 1) bd.mul(`${f.name} (an odd fit for ${g.name})`, f.misfit);
  }
  const base = c.expansionOf ? s.releases[c.expansionOf] : undefined;
  if (base) bd.mul(`Builds on ${base.name} (${Math.round(base.score)})`, clamp(1 + (base.score - 70) / 150, 0.95, 1.08));
  if (!c.franchiseId && !orig) {
    const recent = s.releaseOrder.slice(-6).map((id) => s.releases[id]!);
    const same = recent.filter((rr) => rr.concept.genre === c.genre && rr.concept.topic === c.topic).length;
    const ever = Object.values(s.releases).some((rr) => rr.concept.genre === c.genre && rr.concept.topic === c.topic);
    if (same > 0) bd.mul('Repetitive combo', 1 - Math.min(0.25, 0.07 * same));
    else if (!ever && s.releaseOrder.length > 0) bd.mul('Fresh idea', 1.03);
  }
  if (p.novelty > 0) bd.mul('Visionary ideas', 1 + Math.min(0.08, p.novelty));
  if (hasValue(s, 'craft')) bd.mul('Culture: Quality First', CULTURE_FX.craftQuality);
  if (hasValue(s, 'innovation')) {
    if (c.franchiseId || orig || base) bd.mul('Culture: Innovation (a sequel, not something new)', CULTURE_FX.innovationSequel);
    else bd.mul('Culture: Innovation (new IP)', CULTURE_FX.innovationNewIp);
  }
  if (p.cut) bd.mul('Cut features', BALANCE.CUT_FEATURES_PENALTY);
  // bugs
  const density = total > 0 ? (p.bugs * scale) / total : 0;
  bd.mul(project ? `Bugs (~${Math.round(p.bugs * scale)} expected)` : `Bugs (${Math.round(p.bugs)} remaining)`, 1 - Math.min(0.45, density * 1.6));
  bd.clamp(0, 1.2);
  return bd.done();
}

function interpAvg(s: GameState): number {
  let t = 0;
  let n = 0;
  for (const id of Object.keys(GENRE_BY_ID)) {
    t += genrePopularity(s, id as GameProject['concept']['genre']);
    n++;
  }
  return t / Math.max(1, n);
}

export function qualityToScore(q: number): number {
  return clamp(100 * q * BALANCE.SCORE_GAIN, 5, 99);
}

// ── Contracts ───────────────────────────────────────────────────────────────

function progressContract(c: Ctx, p: ContractProject): void {
  const { s } = c;
  const team = teamOf(s, p.team);
  if (isWorkday(s, false) && team.length) {
    for (const st of team) {
      const prod = productivity(s, st).total;
      const dShare = p.needDesign / Math.max(1, p.needDesign + p.needTech);
      const best = Math.max(st.skills.design, st.skills.programming, st.skills.art, st.skills.writing, st.skills.qa) / 100;
      p.design += dShare * Math.max(st.skills.design / 100, best * 0.75) * prod;
      p.tech += (1 - dShare) * Math.max(st.skills.programming / 100, best * 0.75) * prod;
      growSkill(s, st, 'programming', 1 - dShare, 0);
      growSkill(s, st, 'design', dShare, 0);
    }
  }
  const done = p.design >= p.needDesign && p.tech >= p.needTech;
  if (done || s.day >= p.deadlineDay) {
    const completion = Math.min(1, (p.design + p.tech) / Math.max(1, p.needDesign + p.needTech));
    if (done) {
      earn(s, 'contracts', p.pay);
      c.out.push({ type: 'income', amount: p.pay, source: 'contract' });
      addRep(s, 0.6, 'Delivered a contract');
      s.progress.stats.contractsDone += 1;
      pushNews(s, { category: 'studio', headline: `Contract delivered: ${p.title}`, body: `Paid in full.`, tone: 'good' });
    } else {
      const partial = Math.round(p.pay * completion * 0.5);
      earn(s, 'contracts', partial);
      spend(s, 'other_expense', p.penalty);
      addRep(s, -(1.5), 'Missed a contract deadline');
      pushNews(s, { category: 'studio', headline: `Contract missed deadline: ${p.title}`, body: `Penalty applied; partial payment for ${Math.round(completion * 100)}% done.`, tone: 'bad' });
    }
    finishProject(s, p.id);
    c.out.push({ type: 'projectDone', projectId: p.id, kind: 'contract' });
  }
}

// ── Engines ─────────────────────────────────────────────────────────────────

export function engineTechFor(features: string[]): number {
  let t = 1;
  for (const f of features) t += RESEARCH_BY_ID[f]?.engineTech ?? 0;
  return Math.round(t * 10) / 10;
}

export function engineBuildPoints(features: string[], day: number): number {
  const tech = engineTechFor(features);
  return Math.round(10 + tech * tech * 6 * (1 + (fromDay(day).year - 1980) * 0.01));
}

function progressEngine(c: Ctx, p: EngineProject): void {
  const { s } = c;
  const team = teamOf(s, p.team);
  if (isWorkday(s, false)) {
    for (const st of team) {
      let pts = (st.skills.programming / 100) * productivity(s, st).total;
      if (st.spec === 'engine_programmer') pts *= 1.4;
      p.points += pts;
      growSkill(s, st, 'programming', 1, 0);
    }
  }
  if (p.points >= p.needPoints) {
    const id = newId(s, 'e');
    s.engines[id] = {
      id,
      name: p.name,
      features: [...p.features],
      tech: engineTechFor(p.features),
      maturity: 0,
      gamesShipped: 0,
      builtDay: s.day,
      royalty: 0,
      licensees: 0,
    };
    pushNews(s, { category: 'studio', headline: `${p.name} engine complete`, body: `Tech level ${s.engines[id]!.tech}.`, tone: 'good' });
    finishProject(s, p.id);
    c.out.push({ type: 'projectDone', projectId: p.id, kind: 'engine' });
  }
}

export function finishProject(s: GameState, id: string): void {
  const p = s.projects[id];
  if (!p) return;
  for (const sid of p.team) {
    const st = s.staff[sid];
    if (st && st.assignment.kind === 'project' && st.assignment.id === id) st.assignment = { kind: 'idle' };
  }
  delete s.projects[id];
}

export function updateProjectsDaily(c: Ctx): void {
  for (const p of Object.values(c.s.projects)) {
    if (p.kind === 'game') progressGame(c, p);
    else if (p.kind === 'contract') progressContract(c, p);
    else progressEngine(c, p);
  }
}

export { isCrunching };
