/**
 * The studio yearbook: every New Year's Day the team lines up for a photo — founder in front, then the longest
 * serving — with the year's games and awards in the caption. Faces show how the year felt (morale), so the crunch
 * years are easy to spot. Kept small: at most YEARBOOK_FACES faces per photo.
 */
import { fromDay } from '../calendar';
import type { GameState, YearbookPhoto } from '../types';

export const YEARBOOK_FACES = 18;
const KEEP = 80;

export function takeYearbookPhoto(s: GameState, year: number): void {
  const staff = Object.values(s.staff);
  if (!staff.length) return;
  const ranked = [...staff].sort((a, b) => Number(b.role === 'founder') - Number(a.role === 'founder') || a.hiredDay - b.hiredDay || a.id.localeCompare(b.id));
  const avgMorale = staff.reduce((t, x) => t + x.morale, 0) / staff.length;
  const games = Object.values(s.releases)
    .filter((r) => fromDay(r.day).year === year)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((r) => r.name);
  const awards = (s.awardHistory ?? []).find((a) => a.year === year)?.winners.filter((w) => w.mine).length ?? 0;
  const photo: YearbookPhoto = {
    year,
    people: staff.length,
    morale: Math.round(avgMorale),
    tier: s.office.tier,
    games,
    awards,
    faces: ranked.slice(0, YEARBOOK_FACES).map((st) => ({ look: st.look, name: st.name, role: st.role, mood: Math.round(st.morale), ...(st.personId ? { legend: true } : {}) })),
  };
  const book = (s.yearbook ??= []);
  if (book.some((p) => p.year === year)) return;
  book.push(photo);
  if (book.length > KEEP) book.splice(0, book.length - KEEP);
}
