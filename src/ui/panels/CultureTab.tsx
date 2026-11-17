import { useState } from 'react';
import { CULTURES, CULTURE_BY_ID, CULTURE_CHANGE_MORALE, CULTURE_CONFLICTS, CULTURE_COOLDOWN_DAYS, MAX_VALUES, type CultureId } from '@/data/culture';
import { valuesBlocked } from '@/sim/systems/culture';
import { Button, Section, cx } from '../components/ui';
import { Icon, type IconName } from '../icons';
import { useGame } from '../store';

/** Choose the studio's values: two at most, each a trade-off. */
export function CultureTab() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const act = useGame((g) => g.act);
  const toast = useGame((g) => g.toast);
  const current = s.company.values ?? [];
  const [pick, setPick] = useState<CultureId[]>(current);
  const conflictWith = (id: CultureId) => CULTURE_CONFLICTS.find(([a, b]) => (a === id && pick.includes(b)) || (b === id && pick.includes(a)));
  const why = valuesBlocked(s, pick);
  const changed = !(pick.length === current.length && pick.every((x) => current.includes(x)));
  const cooldown = s.company.valuesDay !== undefined ? Math.max(0, CULTURE_COOLDOWN_DAYS - (s.day - s.company.valuesDay)) : 0;
  return (
    <div>
      <Section title="Studio culture" right={<span className="text-xs text-ink3">Up to {MAX_VALUES} values</span>}>
        <p className="mb-3 text-xs text-ink2">
          What does your studio stand for? Each value shapes how everyone works — for better and for worse. Your first choice is free; changing course later costs morale ({CULTURE_CHANGE_MORALE.v} for {CULTURE_CHANGE_MORALE.days} days) and can only happen once a year.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {CULTURES.map((c) => {
            const on = pick.includes(c.id);
            const clash = !on ? conflictWith(c.id) : undefined;
            const full = !on && pick.length >= MAX_VALUES;
            const held = current.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                disabled={!!clash || full}
                onClick={() => setPick((x) => (on ? x.filter((y) => y !== c.id) : [...x, c.id]))}
                className={cx('rounded-2xl border p-3 text-left transition disabled:opacity-45', on ? 'border-accent bg-accent/10' : 'border-line hover:bg-bg2')}
                title={clash ? `Clashes with ${CULTURE_BY_ID[clash[0] === c.id ? clash[1] : clash[0]].name}` : undefined}
              >
                <div className="flex items-center gap-2">
                  <Icon name={c.icon as IconName} size={16} className={on ? 'text-accent' : 'text-ink3'} />
                  <span className="font-semibold">{c.name}</span>
                  {held && <span className="ml-auto rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-bold text-gold">Current</span>}
                </div>
                <div className="mt-0.5 text-xs italic text-ink3">“{c.motto}”</div>
                <div className="mt-1.5 text-xs text-good">+ {c.pros}</div>
                <div className="text-xs text-bad">− {c.cons}</div>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            disabled={!changed || !!why}
            onClick={() => {
              const r = act({ type: 'setValues', values: pick });
              toast(r.ok ? { text: pick.length ? `Your studio now stands for ${pick.map((id) => CULTURE_BY_ID[id].name).join(' and ')}` : 'Values cleared', tone: 'good' } : { text: r.error, tone: 'bad' });
            }}
          >
            {s.company.valuesDay !== undefined ? 'Change culture' : 'Adopt these values'}
          </Button>
          {changed && <Button variant="ghost" onClick={() => setPick(current)}>Reset</Button>}
          <span className="text-xs text-ink3">{changed && why ? why : cooldown > 0 ? `Next change possible in ${cooldown} days` : ''}</span>
        </div>
      </Section>
    </div>
  );
}
