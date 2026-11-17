import { COMPANY_BY_ID } from '@/data/companies';
import { StudioHQ } from '../art/StudioHQ';
import { FRANCHISES } from '@/data/franchises';
import { GENRE_BY_ID } from '@/data/genres';
import { PERSON_BY_ID } from '@/data/people';
import { fromDay, formatDate, parseYM } from '@/sim/calendar';
import { fmtUnits } from '@/sim/util';
import { Modal, Pill, Section, cx } from '../components/ui';
import { CompanyBadge } from '../art/CompanyBadge';
import { InitialsBadge } from '../art/Avatar';
import { useGame } from '../store';
import { nemesis } from '@/sim/systems/rivalry';

/** A rival company's profile: leader, focus, real franchises and recent releases. */
export function RivalModal({ rivalId, onClose }: { rivalId: string; onClose: () => void }) {
  const s = useGame((g) => g.s)!;
  const r = s.rivals[rivalId];
  if (!r) return null;
  const def = COMPANY_BY_ID[rivalId];
  const leader = def?.leader ? PERSON_BY_ID[def.leader] : undefined;
  const yr = fromDay(s.day).year;
  const franchises = FRANCHISES.filter((f) => {
    let owner = f.company;
    for (const [cid, y] of f.transfers ?? []) if (yr >= y) owner = cid;
    return owner === rivalId && f.releases.some((x) => parseYM(x.date) <= s.day);
  });
  const games = s.rivalGames.filter((g) => g.company === rivalId).slice(-12).reverse();
  const rec = s.rivalry?.[rivalId];
  const nem = nemesis(s);
  return (
    <Modal open onClose={onClose} title={r.name} wide>
      {r.alive && (
        <div className="mb-3 flex justify-center overflow-hidden rounded-xl">
          <StudioHQ tier={r.staff < 8 ? 1 : r.staff < 25 ? 2 : r.staff < 70 ? 3 : r.staff < 180 ? 4 : r.staff < 450 ? 5 : 6} name={r.name} month={fromDay(s.day).month} accent={r.color} width={360} />
        </div>
      )}
      <div className="flex items-start gap-4">
        <CompanyBadge name={r.name} color={r.color} size={64} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-semibold">{r.name}</h2>
          {r.founder && <div className="text-xs text-gold">Founded by your former colleague {r.founder}</div>}
          <div className="text-sm text-ink2">
            {def ? `Founded ${def.founded} · ${def.country} · ${def.kind.replace('_', ' ')}` : 'Independent studio'} · ~{Math.round(r.staff)} staff · reputation {Math.round(r.reputation)}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {r.genres.map((g) => (
              <Pill key={g}>{GENRE_BY_ID[g]?.name ?? g}</Pill>
            ))}
            {r.ownedByPlayer && <Pill tone="gold">Owned by you</Pill>}
            {nem?.id === rivalId && <Pill tone="bad">Your nemesis</Pill>}
          </div>
          {def?.notes && <p className="mt-2 text-xs text-ink3">{def.notes}</p>}
        </div>
      </div>
      {rec && (
        <div className="mt-4 rounded-xl border border-line p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">Head-to-head</span>
            <span className="num font-display text-lg font-semibold">
              <span className="text-good">{rec.wins}W</span> · <span className="text-bad">{rec.losses}L</span>
              {rec.draws ? <span className="text-ink3"> · {rec.draws}D</span> : null}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-ink3">Latest: {rec.last}. Showdowns happen when your game launches within six weeks of theirs in the same genre.</div>
        </div>
      )}
      {leader && (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-bg2/60 p-3">
          <InitialsBadge name={leader.name} size={40} />
          <div className="text-sm">
            <div className="font-semibold">{leader.name}</div>
            <div className="text-xs text-ink3">{leader.knownFor}</div>
          </div>
        </div>
      )}
      {franchises.length > 0 && (
        <Section title="Famous franchises" className="mt-4">
          <div className="flex flex-wrap gap-1.5">
            {franchises.map((f) => {
              const best = Math.max(...f.releases.filter((x) => parseYM(x.date) <= s.day).map((x) => x.score));
              return (
                <Pill key={f.id} tone="accent">
                  {f.name} · best {best}
                </Pill>
              );
            })}
          </div>
        </Section>
      )}
      <Section title="Recent releases" className="mt-4">
        {games.length === 0 ? (
          <p className="text-xs text-ink3">No releases in recent years.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {games.map((g, i) => (
              <li key={`${g.name}-${i}`} className="flex items-center gap-3 py-1.5">
                <span className={cx('num w-8 font-display font-bold', g.score >= 85 ? 'text-gold' : g.score >= 70 ? 'text-good' : 'text-ink2')}>{g.score}</span>
                <span className="min-w-0 flex-1 truncate">
                  {g.name} {g.franchise && <Pill tone="accent">Classic</Pill>}
                </span>
                <span className="num text-xs text-ink3">
                  {fmtUnits(g.units)} · {formatDate(g.day, false)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </Modal>
  );
}
