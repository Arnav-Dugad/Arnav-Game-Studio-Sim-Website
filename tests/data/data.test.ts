import { describe, expect, it } from 'vitest';
import { PLATFORMS, PLATFORM_BY_ID } from '../../src/data/platforms';
import { COMPANIES, COMPANY_BY_ID } from '../../src/data/companies';
import { FRANCHISES } from '../../src/data/franchises';
import { PEOPLE, PERSON_BY_ID } from '../../src/data/people';
import { HISTORICAL_EVENTS } from '../../src/data/events';
import { GENRE_BY_ID, GENRES } from '../../src/data/genres';
import { TOPIC_BY_ID, TOPICS } from '../../src/data/topics';
import { RESEARCH, RESEARCH_BY_ID } from '../../src/data/research';
import { ITEMS } from '../../src/data/facilities';
import { ENGINES } from '../../src/data/engines';
import { CHANNELS } from '../../src/data/marketing';
import { parseYM } from '../../src/sim/calendar';

const unique = (ids: string[]) => new Set(ids).size === ids.length;

describe('static data integrity', () => {
  it('ids are unique', () => {
    for (const list of [PLATFORMS, COMPANIES, FRANCHISES, PEOPLE, HISTORICAL_EVENTS, GENRES, TOPICS, RESEARCH, ITEMS, ENGINES, CHANNELS])
      expect(unique(list.map((x) => x.id))).toBe(true);
  });
  it('platforms reference real makers, sane dates and numbers', () => {
    for (const p of PLATFORMS) {
      if (p.maker !== 'various') expect(COMPANY_BY_ID[p.maker], p.id).toBeDefined();
      if (p.discontinued) expect(parseYM(p.discontinued)).toBeGreaterThan(parseYM(p.launch));
      expect(p.unitsM).toBeGreaterThan(0);
      expect(p.royalty).toBeGreaterThanOrEqual(0);
      expect(p.royalty).toBeLessThan(1);
      if (p.research) expect(RESEARCH_BY_ID[p.research], p.id).toBeDefined();
    }
  });
  it('companies, people and franchises cross-reference correctly', () => {
    for (const c of COMPANIES) {
      if (c.mergedInto) expect(COMPANY_BY_ID[c.mergedInto], c.id).toBeDefined();
      if (c.leader) expect(PERSON_BY_ID[c.leader], c.id).toBeDefined();
      for (const g of c.strategy.genres) expect(GENRE_BY_ID[g], c.id).toBeDefined();
      for (const p of c.strategy.platforms ?? []) expect(PLATFORM_BY_ID[p], `${c.id}:${p}`).toBeDefined();
    }
    for (const f of FRANCHISES) {
      expect(COMPANY_BY_ID[f.company], f.id).toBeDefined();
      expect(GENRE_BY_ID[f.genre], f.id).toBeDefined();
      expect(TOPIC_BY_ID[f.topic], f.id).toBeDefined();
      for (const [cid] of f.transfers ?? []) expect(COMPANY_BY_ID[cid], f.id).toBeDefined();
      for (const r of f.releases) {
        for (const p of r.platforms) expect(PLATFORM_BY_ID[p], `${f.id}:${r.title}:${p}`).toBeDefined();
        expect(r.score).toBeGreaterThan(0);
        expect(r.score).toBeLessThanOrEqual(100);
      }
    }
    for (const p of PEOPLE) if (p.company) expect(COMPANY_BY_ID[p.company], p.id).toBeDefined();
  });
  it('historical events are sorted and reference valid ids', () => {
    let last = -Infinity;
    for (const e of HISTORICAL_EVENTS) {
      const d = parseYM(e.date);
      expect(d).toBeGreaterThanOrEqual(last);
      last = d;
      for (const fx of e.effects) {
        if (fx.kind === 'genreTrend') expect(GENRE_BY_ID[fx.genre]).toBeDefined();
        if (fx.kind === 'topicTrend') expect(TOPIC_BY_ID[fx.topic], e.id).toBeDefined();
        if (fx.kind === 'demand' && fx.target.startsWith('platform:')) expect(PLATFORM_BY_ID[fx.target.slice(9)], e.id).toBeDefined();
      }
    }
  });
  it('research prerequisites exist and are not from the future', () => {
    for (const r of RESEARCH)
      for (const q of r.requires) {
        expect(RESEARCH_BY_ID[q], r.id).toBeDefined();
        expect(RESEARCH_BY_ID[q]!.year).toBeLessThanOrEqual(r.year);
      }
    for (const g of GENRES) if (g.research) expect(RESEARCH_BY_ID[g.research], g.id).toBeDefined();
    for (const it of ITEMS) if (it.research) expect(RESEARCH_BY_ID[it.research], it.id).toBeDefined();
  });
});
