import { ACHIEVEMENTS, MILESTONES, nextMilestone, runScore } from '@/sim/systems/achievements';
import { formatDate } from '@/sim/calendar';
import { fmtMoney, fmtUnits } from '@/sim/util';
import { useState } from 'react';
import { Button, Pill, Section, Stat, cx } from '../components/ui';
import { Icon, type IconName } from '../icons';
import { useGame } from '../store';

export default function GoalsPanel() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const act = useGame((g) => g.act);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const next = nextMilestone(s);
  const st = s.progress.stats;
  const unlocked = Object.keys(s.progress.achievements).length;
  return (
    <div>
      {next && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-accent/50 bg-accent/10 p-3">
          <Icon name="target" size={22} className="text-accent" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-accent">Next milestone</div>
            <div className="font-semibold">{next.text}</div>
          </div>
        </div>
      )}
      <Section title="Milestones">
        <ol className="grid gap-1 sm:grid-cols-2">
          {MILESTONES.map((m) => {
            const done = s.progress.milestones.includes(m.id);
            return (
              <li key={m.id} className={cx('flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs', done ? 'text-ink' : 'text-ink3')}>
                <Icon name={done ? 'check' : 'target'} size={14} className={done ? 'text-good' : ''} />
                {m.text}
              </li>
            );
          })}
        </ol>
      </Section>
      <Section title="Career stats">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Run score" value={runScore(s).toLocaleString()} />
          <Stat label="Games released" value={st.gamesReleased} />
          <Stat label="Best review" value={st.bestScore || '—'} sub={st.bestGame} />
          <Stat label="Copies sold" value={fmtUnits(st.totalUnits)} />
          <Stat label="Lifetime revenue" value={fmtMoney(st.totalRevenue)} />
          <Stat label="Peak valuation" value={fmtMoney(st.peakValuation)} />
          <Stat label="Hits (85+)" value={st.hits} />
          <Stat label="Awards" value={st.awardsWon} />
          <Stat label="Crunch days" value={st.crunchDays} tone={st.crunchDays > 120 ? 'bad' : undefined} />
        </div>
      </Section>
      <Section title={`Achievements (${unlocked}/${ACHIEVEMENTS.length})`}>
        <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {ACHIEVEMENTS.map((a) => {
            const day = s.progress.achievements[a.id];
            const got = day !== undefined;
            return (
              <li key={a.id} className={cx('rounded-xl border p-2 text-xs', got ? 'border-gold/50 bg-gold/10' : 'border-line opacity-60')} title={a.desc}>
                <div className="flex items-center gap-1.5">
                  <Icon name={a.icon as IconName} size={15} className={got ? 'text-gold' : 'text-ink3'} />
                  <span className="truncate font-semibold">{a.name}</span>
                </div>
                <div className="mt-0.5 text-ink3">{a.desc}</div>
                {got && <Pill tone="gold" className="mt-1">{formatDate(day, false)}</Pill>}
              </li>
            );
          })}
        </ul>
      </Section>
      <Section title="End this run">
        <p className="mb-2 text-xs text-ink3">Retire to lock in your score ({runScore(s).toLocaleString()}) and add {s.company.name} to your Hall of Fame. This ends the game for this save.</p>
        {confirmRetire ? (
          <div className="flex gap-2">
            <Button variant="danger" icon="flag" onClick={() => act({ type: 'retire' })}>
              Yes, retire now
            </Button>
            <Button variant="ghost" onClick={() => setConfirmRetire(false)}>
              Keep playing
            </Button>
          </div>
        ) : (
          <Button icon="flag" onClick={() => setConfirmRetire(true)}>
            Retire…
          </Button>
        )}
      </Section>
    </div>
  );
}
