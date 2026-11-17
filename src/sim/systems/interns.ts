/**
 * Summer internships (1985+, a policy): every June a few students join for the summer — green, cheap and full of
 * potential, learning half again as fast as anyone else (mentors help even more). On September 1 they head back to
 * school, and you can offer your best intern a junior role. Former interns tend to be loyal for life.
 */
import { clamp } from '../breakdown';
import { fromDay, toDay } from '../calendar';
import type { Ctx } from '../ctx';
import type { GameState, Staff } from '../types';
import { newId, pushNews } from '../util';
import { assignDesks, freeDesks, tierDef } from './office';
import { candidateToStaff, generateCandidate, marketSalary, removeStaff } from './staff';
import { SKILLS } from '../../data/types';

export const INTERN_YEAR = 1985;
/** Stipend as a share of what they'd ask as a junior. */
const STIPEND = 0.35;

export function internCount(s: GameState): number {
  return clamp(1 + Math.floor(Object.keys(s.staff).length / 25), 1, 4);
}

/** June 1: this summer's interns arrive. */
export function internsArrive(c: Ctx): void {
  const { s, rng } = c;
  if (!s.company.policies.interns || fromDay(s.day).year < INTERN_YEAR) return;
  // leave one desk free for a real hire
  const room = Math.min(freeDesks(s), tierDef(s.office.tier).staffCap - Object.keys(s.staff).length) - 1;
  const n = Math.min(internCount(s), room);
  if (n <= 0) {
    pushNews(s, { category: 'staff', headline: 'No room for summer interns this year', body: 'Every desk is taken. Place more desks to host interns next June.', tone: 'neutral' });
    return;
  }
  const names: string[] = [];
  const until = toDay(fromDay(s.day).year, 9, 1);
  for (let i = 0; i < n; i++) {
    const cand = generateCandidate(s, rng, { quality: 0 });
    const id = newId(s, 's');
    const st = candidateToStaff(s, cand, id, Math.round(cand.askSalary * STIPEND));
    st.level = 'junior';
    for (const k of SKILLS) st.skills[k] = Math.round(st.skills[k] * 0.6);
    st.potential = clamp(st.potential + 15 + rng.int(0, 10), 40, 96);
    st.intern = { until };
    st.loyalty = 60;
    s.staff[id] = st;
    names.push(st.name.split(' ')[0]!);
  }
  assignDesks(s);
  s.progress.stats.interns = (s.progress.stats.interns ?? 0) + n;
  pushNews(s, { category: 'staff', headline: `${n} summer intern${n > 1 ? 's' : ''} join${n > 1 ? '' : 's'} the studio`, body: `Say hello to ${names.join(', ')}. They’re here until September — learning fast. Pair them with mentors!`, tone: 'good' });
}

/** The best intern this summer (potential first, then what they've learned). */
export function starIntern(s: GameState): Staff | undefined {
  return Object.values(s.staff)
    .filter((x) => x.intern)
    .sort((a, b) => b.potential + Math.max(...Object.values(b.skills)) * 0.5 - (a.potential + Math.max(...Object.values(a.skills)) * 0.5))[0];
}

/** September 1: back to school (the star may get an offer — see the 'intern_offer' event). */
export function internsLeave(c: Ctx, offer: (st: Staff) => boolean): void {
  const { s } = c;
  const interns = Object.values(s.staff).filter((x) => x.intern && s.day >= x.intern.until);
  if (!interns.length) return;
  const star = starIntern(s);
  const offered = star && offer(star) ? star : undefined;
  for (const st of interns) {
    if (st === offered) continue;
    removeStaff(s, st.id);
  }
  pushNews(s, { category: 'staff', headline: 'The summer interns head back to school', body: offered ? `${offered.name} stands out — do you want to offer them a job?` : 'Thanks for a great summer!', tone: 'neutral' });
}

/** Turn an intern into a regular junior hire. */
export function hireIntern(s: GameState, st: Staff): void {
  st.intern = undefined;
  st.wasIntern = true;
  st.salary = Math.round(marketSalary(s, st.skills) * 0.9);
  st.loyalty = clamp(st.loyalty + 25, 0, 100);
  st.hiredDay = s.day;
  s.progress.stats.staffHired += 1;
}
