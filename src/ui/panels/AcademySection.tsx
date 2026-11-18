/** Staff → Policies: found and run the studio academy (systems/academy.ts). */
import { useState } from 'react';
import { fromDay } from '@/sim/calendar';
import {
  ACADEMY_FUNDING_NAMES,
  ACADEMY_YEAR,
  GRAD_DAYS,
  academyBlocked,
  academyBudget,
  academyFoundCost,
  academyName,
  classSize,
  gradBoost,
  type AcademyFunding,
  type AcademyTrack,
} from '@/sim/systems/academy';
import { HIREABLE_ROLES, ROLE_NAMES } from '@/sim/systems/staff';
import { fmtMoney } from '@/sim/util';
import { Button, Section, Segmented, inputCls } from '../components/ui';
import { useGame } from '../store';

const trackLabel = (t: AcademyTrack) => (t === 'mixed' ? 'Every craft' : `${ROLE_NAMES[t]}s`);

export function AcademySection() {
  const s = useGame((g) => g.s)!;
  useGame((g) => g.v);
  const act = useGame((g) => g.act);
  const [track, setTrack] = useState<AcademyTrack>('programmer');
  const [funding, setFunding] = useState<AcademyFunding>(2);
  const [closing, setClosing] = useState(false);
  if (fromDay(s.day).year < ACADEMY_YEAR) return null;
  const a = s.company.academy;
  const blocked = academyBlocked(s);
  const tracks: AcademyTrack[] = ['mixed', ...HIREABLE_ROLES];
  const trackSelect = (value: AcademyTrack, onChange: (t: AcademyTrack) => void) => (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value as AcademyTrack)} aria-label="What the academy teaches">
      {tracks.map((t) => (
        <option key={t} value={t}>
          {trackLabel(t)}
        </option>
      ))}
    </select>
  );
  const fundingPick = (value: AcademyFunding, onChange: (f: AcademyFunding) => void) => (
    <Segmented
      ariaLabel="Academy budget"
      value={String(value)}
      onChange={(v) => onChange(Number(v) as AcademyFunding)}
      options={([1, 2, 3] as const).map((f) => ({ value: String(f), label: `${ACADEMY_FUNDING_NAMES[f]} · ${fmtMoney(academyBudget(s, f))}/mo` }))}
    />
  );

  if (!a)
    return (
      <Section title="Studio academy">
        <p className="text-xs text-ink3">
          Found a games school that teaches one craft. Every June its graduating class joins your hiring pool for {Math.round(GRAD_DAYS / 30)} months: strong for their age, high potential, asking 10% under market and loyal to the studio that trained them. A bigger budget means bigger, better classes, and the school improves as it matures. Each graduation also adds to your name.
        </p>
        <div className="mt-2 grid gap-2">
          {trackSelect(track, setTrack)}
          {fundingPick(funding, setFunding)}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-ink3">{blocked ?? `Founding costs ${fmtMoney(academyFoundCost(s))}, then the monthly budget.`}</span>
            <Button size="sm" variant="primary" disabled={!!blocked} onClick={() => act({ type: 'foundAcademy', track, funding })}>
              Found the academy
            </Button>
          </div>
        </div>
      </Section>
    );

  const firstJune = s.day - a.since < 240;
  return (
    <Section title={academyName(s)}>
      <p className="text-xs text-ink3">
        Teaching {trackLabel(a.track).toLowerCase()} since {fromDay(a.since).year}. {firstJune ? 'The first class is still in its first year.' : `Next June: about ${classSize(s)} graduates, roughly ${Math.round(gradBoost(s))} skill points ahead of a typical newcomer.`}{' '}
        {a.grads > 0 && `${a.grads} graduated so far, ${a.hired} hired by you.`}
      </p>
      <div className="mt-2 grid gap-2">
        {trackSelect(a.track, (t) => act({ type: 'setAcademy', track: t }))}
        {fundingPick(a.funding, (f) => act({ type: 'setAcademy', funding: f }))}
        <div className="flex justify-end">
          {closing ? (
            <span className="flex items-center gap-2 text-xs">
              Close it for good? (reputation −0.5)
              <Button size="sm" variant="danger" onClick={() => act({ type: 'closeAcademy' })}>
                Close
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setClosing(false)}>
                Keep it
              </Button>
            </span>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setClosing(true)}>
              Close the academy
            </Button>
          )}
        </div>
      </div>
    </Section>
  );
}
