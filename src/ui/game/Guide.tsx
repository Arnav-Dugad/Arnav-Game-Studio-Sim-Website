import { useState } from 'react';
import { Modal, Segmented } from '../components/ui';

const SECTIONS: { id: string; title: string; body: [string, string][] }[] = [
  {
    id: 'games',
    title: 'Making games',
    body: [
      ['Concept', 'Pick genre × topic × platform × audience. Some combinations are great, some are awful — you learn which by shipping. Your design notes (Market → Trends) remember what worked.'],
      ['Focus sliders', 'Each phase has three focus areas. Genres care about different things: RPGs want story and dialogue, racing games want engine and graphics. Gold marks show what worked for you before.'],
      ['Effort & size', 'Bigger games need bigger teams. A score depends on the effort your team puts in compared with what the era expects — the bar rises every year.'],
      ['Bugs & QA', 'Tech work creates bugs; QA skill (and QA lab stations) fix them during polish. Crunch is faster but buggier and burns people out.'],
      ['Engines', 'Research features, then build your own engine (Research → Engines) or license one. Old engines look dated on new hardware.'],
      ['Release timing', 'Boxed games sell best in November–December. Competing with a big release in the same genre hurts.'],
    ],
  },
  {
    id: 'people',
    title: 'Staff & office',
    body: [
      ['Hiring', 'Reputation attracts better candidates. Traits matter: Perfectionists add quality, Hotheads cause conflicts, Mentors teach.'],
      ['Morale & energy', 'Pay, décor, space, noise, crunch and recent success drive morale. Energy drains while working and refills at break areas — keep the coffee close.'],
      ['Burnout', 'Low energy and crunch build burnout. Burnt-out staff slump at their desks, get sick, and eventually quit. Send them on a week or two of vacation (click a person) before it gets that far.'],
      ['Layout', 'Use build mode (B) and the heat-map overlays to place break areas, décor and desks. Seating a team together boosts synergy.'],
      ['Growth', 'Staff learn by doing. Training (after research) and specialisations (seniors+) push them further.'],
    ],
  },
  {
    id: 'money',
    title: 'Money & business',
    body: [
      ['Cash flow', 'Salaries, rent and upkeep are paid monthly. Hover the cash counter for last month’s breakdown.'],
      ['Contracts', 'Reliable early income. Make sure your team can finish before the deadline.'],
      ['Publishing', 'Publishers pay an advance and give wider reach but keep most of the revenue. Self-publishing (after research) keeps everything — if the game sells.'],
      ['Loans & insolvency', 'If cash goes negative you have a grace period to recover. Borrow, cut costs or sell IP — or go bankrupt.'],
      ['Going big', 'With enough revenue and reputation you can IPO, acquire studios (real companies bring their franchises!) and run subsidiaries.'],
      ['Publishing label', 'After Self-Publishing research, fund indie studios’ games (Company → Publishing). You pay an advance and get a share of the revenue when they ship — star ratings hint at their talent.'],
      ['Showcases', 'Once famous (70+ reputation, 1990+), host your own yearly showcase to hype every announced game at once.'],
      ['Subscription pass', 'With Subscription Service research, 8+ games and decent reputation, launch a monthly pass (Company → Pass). Good recent games bring subscribers; older games sell a little less while it runs.'],
      ['Your own console', 'Research the Hardware Lab, then design a console or handheld (Research → Hardware). Hardware is sold near cost; licence fees from other publishers and your own royalty-free exclusives are where the money is. Price it against what the market expects and keep releasing hits on it.'],
    ],
  },
  {
    id: 'tips',
    title: 'Tips',
    body: [
      ['Start small', 'Ship small games, take contracts, and hire one or two good people before scaling up.'],
      ['Read the reviews', 'Every review screen shows exactly what drove the score. Hover numbers everywhere for the “why”.'],
      ['Watch the market', 'Platforms rise and fall on their real dates. Don’t be the last studio making cartridges in 1997.'],
      ['Keep fans happy', 'Good games build franchise fans who buy sequels — but sequels too close together cause fatigue.'],
      ['Patches, ports & remasters', 'Open a released game (Games panel) to patch bugs, port it to new platforms, or — once a 70+ game is 8 years old — remaster it for about half the work of a new game.'],
      ['Expansion packs', 'From 1987, a paid game scoring 65+ can get up to two expansions within 5 years of launch. They take about 40% of the work, sell at 60% of the price mostly to people who own the base game, and bring lapsed players back to it. Not for cartridge platforms or free-to-play games.'],
      ['Storefront sales', 'Once most copies sell digitally, a paid game at least 4 months old can go 25%, 50% or 75% off every 6 months. Half price usually earns the most; 75% off moves the most copies (and wins fans before a sequel). Each sale draws a little less than the last.'],
    ],
  },
];

export function GuideModal({ onClose, initial = 'games' }: { onClose: () => void; initial?: string }) {
  const [tab, setTab] = useState(initial);
  const sec = SECTIONS.find((x) => x.id === tab) ?? SECTIONS[0]!;
  return (
    <Modal open onClose={onClose} title="How to play" wide>
      <h2 className="font-display text-2xl font-semibold">How to play</h2>
      <Segmented ariaLabel="Guide sections" value={tab} onChange={setTab} className="mt-3" options={SECTIONS.map((x) => ({ value: x.id, label: x.title }))} />
      <dl className="mt-4 space-y-3">
        {sec.body.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-bg2/60 p-3">
            <dt className="text-sm font-semibold">{k}</dt>
            <dd className="mt-0.5 text-sm text-ink2">{v}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
