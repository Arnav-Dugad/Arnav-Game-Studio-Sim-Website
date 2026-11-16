import { TRAIT_BY_ID } from '@/data/traits';
import { SKILLS } from '@/data/types';
import type { Staff } from '@/sim/types';
import { Meter, Pill, Tip, cx } from '../components/ui';
import { Avatar, InitialsBadge } from '../art/Avatar';

export function Face({ p, size = 40 }: { p: { name: string; look: number; morale: number; personId?: string }; size?: number }) {
  return p.personId ? <InitialsBadge name={p.name} size={size} legendary /> : <Avatar seed={p.look} size={size} mood={p.morale} />;
}

export function SkillBars({ skills, compact }: { skills: Staff['skills']; compact?: boolean }) {
  const top = [...SKILLS].sort((a, b) => skills[b] - skills[a]).slice(0, compact ? 3 : 7);
  return (
    <div className={cx('grid gap-x-3 gap-y-1', compact ? 'grid-cols-3' : 'grid-cols-2')}>
      {top.map((k) => (
        <div key={k} className="text-[11px]">
          <div className="flex justify-between">
            <span className="capitalize text-ink3">{k === 'qa' ? 'QA' : k}</span>
            <span className="num font-semibold">{Math.round(skills[k])}</span>
          </div>
          <Meter value={skills[k]} tone="tech" label={k} />
        </div>
      ))}
    </div>
  );
}

export function Traits({ traits }: { traits: Staff['traits'] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {traits.map((t) => {
        const d = TRAIT_BY_ID[t];
        return (
          <Tip key={t} content={d.desc}>
            <Pill tone={d.good === true ? 'good' : d.good === false ? 'bad' : 'neutral'}>{d.name}</Pill>
          </Tip>
        );
      })}
    </div>
  );
}
