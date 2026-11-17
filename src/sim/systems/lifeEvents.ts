/**
 * Life outside work: people fall in love (sometimes with each other), get married and go on honeymoon, have
 * babies and take parental leave (how much is your policy), and occasionally have to move away. Monthly rolls,
 * O(staff). In a big studio the individual stories fold into one monthly note.
 */
import { clamp } from '../breakdown';
import type { Ctx } from '../ctx';
import type { GameState, Staff } from '../types';
import { pushNews } from '../util';
import { removeStaff } from './staff';

export type ParentalLeave = 'minimal' | 'standard' | 'generous';

export const PARENTAL: Record<ParentalLeave, { days: number; loyalty: number; mood: number; quit: number; label: string }> = {
  minimal: { days: 14, loyalty: -8, mood: -6, quit: 0.15, label: 'Two weeks' },
  standard: { days: 42, loyalty: 4, mood: 2, quit: 0, label: 'Six weeks' },
  generous: { days: 112, loyalty: 15, mood: 6, quit: 0, label: 'Sixteen weeks' },
};

export const HONEYMOON_DAYS = 10;
/** Relationship two colleagues need before sparks fly. */
export const ROMANCE = 85;
/** In a studio bigger than this, life news is collected into one monthly note. */
const NEWS_LIMIT = 40;

// yearly odds, rolled monthly
const P_WED = 0.035;
const P_BABY_COUPLE = 0.08;
const P_BABY_SINGLE = 0.01;
const P_MOVE = 0.01;

export function parentalPolicy(s: GameState): ParentalLeave {
  return s.company.policies.parentalLeave ?? 'standard';
}

const first = (n: string) => n.split(' ')[0];

function note(s: GameState, digest: string[], small: boolean, headline: string, body: string | undefined, tone: 'good' | 'bad' | 'neutral', short: string): void {
  if (small) pushNews(s, { category: 'staff', headline, ...(body ? { body } : {}), tone });
  else digest.push(short);
}

function setMood(st: Staff, v: number, days: number, label: string, day: number): void {
  st.mood = { v, until: day + days, label };
}

function leave(st: Staff, days: number, kind: 'honeymoon' | 'parental'): void {
  st.vacationDays = Math.max(st.vacationDays ?? 0, days);
  st.leave = kind;
}

/** Monthly: love, weddings, babies and moves. */
export function lifeEventsMonthly(c: Ctx): void {
  const { s, rng } = c;
  const all = Object.values(s.staff).filter((x) => x.role !== 'founder');
  if (!all.length) return;
  const small = all.length <= NEWS_LIMIT;
  const digest: string[] = [];
  const stats = s.progress.stats;

  // office romance: very close colleagues may become a couple
  for (const [k, v] of Object.entries(s.relations ?? {})) {
    if (v < ROMANCE || !rng.chance(0.04)) continue;
    const [x, y] = k.split('|') as [string, string];
    const a = s.staff[x];
    const b = s.staff[y];
    if (!a || !b || a.role === 'founder' || b.role === 'founder' || a.life?.partnerId || b.life?.partnerId || a.life?.married || b.life?.married) continue;
    a.life = { ...a.life, partnerId: b.id, event: { kind: 'romance', day: s.day } };
    b.life = { ...b.life, partnerId: a.id, event: { kind: 'romance', day: s.day } };
    note(s, digest, small, `Office romance: ${a.name} and ${b.name} are an item`, 'Everyone saw it coming. They’re very happy.', 'good', `${first(a.name)} & ${first(b.name)} are dating`);
  }

  for (const st of all) {
    if (!s.staff[st.id]) continue;
    const life = (st.life ??= {});
    const partner = life.partnerId ? s.staff[life.partnerId] : undefined;
    if (life.partnerId && !partner && !life.married) delete life.partnerId; // they left the studio: life goes on elsewhere
    const away = (st.vacationDays ?? 0) > 0 || st.sickDays > 0;
    // weddings
    if (!life.married && !away) {
      const couple = partner && partner.life?.partnerId === st.id && st.id < partner.id && !(partner.vacationDays ?? 0) && partner.sickDays <= 0; // each couple once, both here
      if (couple && s.day - (life.event?.day ?? 0) > 300 && rng.chance(0.08)) {
        for (const x of [st, partner]) {
          x.life = { ...x.life, married: s.day, event: { kind: 'wedding', day: s.day } };
          leave(x, HONEYMOON_DAYS, 'honeymoon');
          setMood(x, 8, 90, 'Just married', s.day);
          x.loyalty = clamp(x.loyalty + 6, 0, 100);
        }
        s.company.moraleMods.push({ v: 3, until: s.day + 14, label: `${first(st.name)} & ${first(partner.name)}’s wedding` });
        stats.weddings = (stats.weddings ?? 0) + 1;
        stats.officeWeddings = (stats.officeWeddings ?? 0) + 1;
        // always news: the whole studio was invited
        pushNews(s, { category: 'staff', headline: `${st.name} and ${partner.name} get married!`, body: `The whole studio was invited. The happy couple are off on honeymoon for ${HONEYMOON_DAYS} days.`, tone: 'good' });
        continue;
      }
      if (!partner && rng.chance(P_WED / 12)) {
        life.married = s.day;
        life.event = { kind: 'wedding', day: s.day };
        leave(st, HONEYMOON_DAYS, 'honeymoon');
        setMood(st, 6, 60, 'Just married', s.day);
        stats.weddings = (stats.weddings ?? 0) + 1;
        note(s, digest, small, `${st.name} got married`, `Off on honeymoon for ${HONEYMOON_DAYS} days. Congratulations!`, 'good', `${first(st.name)} got married`);
        continue;
      }
    }
    // babies (a colleague couple rolls once, for both of them)
    const spouse = partner && partner.life?.partnerId === st.id && life.married ? partner : undefined;
    if (spouse && (st.id > spouse.id || (spouse.vacationDays ?? 0) > 0 || spouse.sickDays > 0)) continue;
    if (!away && (life.kids ?? 0) < 3 && rng.chance((life.married ? P_BABY_COUPLE : P_BABY_SINGLE) / 12) && s.day - (life.event?.day ?? -1e9) > 200) {
      const pol = PARENTAL[parentalPolicy(s)];
      life.kids = (life.kids ?? 0) + 1;
      life.event = { kind: 'baby', day: s.day };
      stats.babies = (stats.babies ?? 0) + 1;
      st.loyalty = clamp(st.loyalty + pol.loyalty, 0, 100);
      if (pol.quit && rng.chance(pol.quit)) {
        pushNews(s, { category: 'staff', headline: `${st.name} resigns to be with their newborn`, body: `Two weeks of parental leave wasn’t enough. ${first(st.name)} has left ${s.company.name}.`, tone: 'bad' });
        c.out.push({ type: 'staffQuit', name: st.name, reason: 'family' });
        removeStaff(s, st.id);
        stats.staffLost += 1;
        continue;
      }
      leave(st, pol.days, 'parental');
      setMood(st, pol.mood, pol.days + 60, pol.mood >= 0 ? 'New parent (supported)' : 'New parent (barely any leave)', s.day);
      if (spouse) {
        spouse.life = { ...spouse.life, kids: (spouse.life?.kids ?? 0) + 1, event: { kind: 'baby', day: s.day } };
        spouse.loyalty = clamp(spouse.loyalty + pol.loyalty, 0, 100);
        leave(spouse, pol.days, 'parental');
        setMood(spouse, pol.mood, pol.days + 60, pol.mood >= 0 ? 'New parent (supported)' : 'New parent (barely any leave)', s.day);
      }
      note(s, digest, small, `${st.name} welcomes a baby`, `${pol.label} of parental leave${pol.mood < 0 ? ' — and they’re not happy about how short it is' : ''}.`, pol.mood < 0 ? 'neutral' : 'good', `${first(st.name)} had a baby`);
      continue;
    }
    // moving away (a partner's new job elsewhere)
    if (!away && rng.chance(P_MOVE / 12) && !(partner && partner.life?.partnerId === st.id)) {
      if (s.company.policies.remote) {
        life.remote = true;
        life.event = { kind: 'moved', day: s.day };
        st.loyalty = clamp(st.loyalty + 8, 0, 100);
        note(s, digest, small, `${st.name} moves away but stays on remotely`, 'Their partner got a job across the country. Thanks to your remote policy, they don’t have to choose.', 'good', `${first(st.name)} now works remotely`);
      } else if (rng.chance(0.5)) {
        pushNews(s, { category: 'staff', headline: `${st.name} is moving away`, body: 'Their partner got a job across the country, and without a remote option they’ve resigned.', tone: 'bad' });
        c.out.push({ type: 'staffQuit', name: st.name, reason: 'moving away' });
        removeStaff(s, st.id);
        stats.staffLost += 1;
      } else {
        life.event = { kind: 'moved', day: s.day };
        setMood(st, -5, 180, 'A long commute after moving', s.day);
        note(s, digest, small, `${st.name} moved house: a much longer commute now`, 'They’re staying — but a remote option would help.', 'neutral', `${first(st.name)} has a long commute now`);
      }
    }
  }
  if (digest.length) pushNews(s, { category: 'staff', headline: `Life at ${s.company.name}: ${digest.slice(0, 3).join(', ')}${digest.length > 3 ? ` and ${digest.length - 3} more` : ''}`, tone: 'good' });
}

export function lifeLine(s: GameState, st: Staff): string | null {
  const l = st.life;
  if (!l) return null;
  const parts: string[] = [];
  const partner = l.partnerId ? s.staff[l.partnerId] : undefined;
  if (partner && l.married) parts.push(`Married to ${partner.name} (a colleague)`);
  else if (partner) parts.push(`Dating ${partner.name}`);
  else if (l.married) parts.push('Married');
  if (l.kids) parts.push(`${l.kids} kid${l.kids > 1 ? 's' : ''}`);
  if (l.remote && s.company.policies.remote) parts.push('works remotely');
  return parts.length ? parts.join(' · ') : null;
}

