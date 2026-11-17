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
      ['Building fast', 'In build mode, pick an item and drag across the floor to place a whole row in one go (blocked tiles are skipped). Arrows + Enter place by keyboard, R rotates, right-click cancels. “Desks for everyone” (in build mode or from the Overview) places the best desk you can buy, in tidy rows, until nobody is left standing.'],
      ['Studio overview', 'The house icon at the top of the left rail (or O) lists everything that needs attention — cash runway, phase reviews, people at risk, idle staff, research with nothing to do, a full office, platforms being phased out under a game you’re making, missed deadlines and weak projects — each with a button that takes you straight to the fix. A red dot on the icon means something urgent.'],
      ['Managing a big team', 'Staff → Team scales to hundreds: filter by status (Idle, On projects, Research, Away, Needs attention), search names, roles and traits, sort and group by role or assignment, and switch to compact rows. Tick people (or “Select all”) to act on them together: assign to a project, research, idle, vacation, training, a 10% raise or letting them go. Team pickers for games, contracts and engines have search, role filters and a one-click “Best team” ranked by fit for the job. The “N idle · Assign” chip at the bottom jumps straight to idle people. In Staff → Policies you can automate the routine: idle people join research each week, and anyone whose burnout passes 70 takes two weeks off.'],
      ['Retirement', 'After 30–40 years at the studio, veterans retire. The team throws a farewell party (a short morale boost), colleagues in the same role pick up some of their craft, and they join your alumni in Company → History. A staff profile shows the expected year once it is within five years — plan your succession.'],
      ['Mod support', 'Research Mod Tools (Online, 1997+) and your PC strategy, shooter, RPG, simulation and sandbox games ship with level editors: 10% more sales on computers, a longer tail and +2 user score.'],
      ['Signature features', 'Pick up to three in the new-game wizard: branching story, open world, online multiplayer, co-op, level editor, procedural worlds, crafting, photo mode, accessibility options, a licensed soundtrack or a battle pass (each from its era). Each adds scope (more work), lifts quality in genres it suits and drags a little in others; some change sales or how players feel. Look for the “great fit” tags.'],
      ['Launch titles', 'A game released within about four months of a platform’s launch sells up to 35% better there — early adopters buy almost anything. Look for the “Launch window” tag in the new-game wizard.'],
      ['Sequels and expectations', 'Fans compare every sequel with the best game in the series. Fall more than 8 points short and players are disappointed (lower user score) and some fans drift away; beat the best and they love you for it.'],
      ['Scenarios', 'Pick Scenario mode when founding a studio for a curated challenge with its own start year, team, cash, goals and deadline — from the gentle Garage Days to the Legendary Empire. The Goals panel tracks each goal; meet them all before the deadline to win, and keep playing afterwards either way.'],
      ['World regions & localisation', 'North America, Europe, Japan and the rest of the world each like different genres, and their share of players shifts over the decades (Market → World). Your home region is chosen when you found the studio. From 1983 you can localise a game for other regions in the new-game wizard — it costs money and a little extra work, and sales rise in proportion to how much each region likes the genre (an RPG in Japan, a strategy game in Europe). Unlocalised games still sell; they just leave players on the table.'],
      ['Studio culture', 'Company → Culture: up to two values. Quality First (better games, slower), Ship Fast (faster, buggier), Player Obsessed (happier players and more fans, lower prices), Profit Driven (higher prices, lower morale), Innovation (faster research, new IP shines, sequels suffer) and Work-Life Balance (happier, less burnout, less output). Some clash. The first choice is free; changing later costs morale and waits a year.'],
      ['Staff ambitions', 'Now and then someone sets a personal goal — ship a game in a genre they love, ship an 80+, their first game, a raise, a month of research, a skill milestone or a holiday. Their card shows the goal, the deadline and a one-click fix where there is one. Help them and loyalty and morale jump; ignore them and they feel overlooked. Taking a promised raise back is remembered.'],
      ['Friendships & feuds', 'People on the same project grow closer each week — faster for social butterflies, team players and mentor/junior pairs; hotheads and crunch strain things. Team chemistry shows in a project’s synergy, a best friend on the team lifts morale, and a feud costs both and raises a decision. Staff cards list each person’s closest friends and rivals.'],
      ['Shareholders', 'Once you’ve been public for a while, the annual meeting comes every May: pay a dividend, promise bold growth (expectations rise) or hold steady. If the board turns on you and you own less than half the company, you’ll face a no-confidence vote.'],
      ['Player buzz', 'News → Buzz shows what players say about your games — magazine letters in the 80s, bulletin boards and forums, then social posts and streams. It reflects the real reasons: reviews vs. user scores, bugs, price, features, sequels.'],
      ['Living office', 'Your people chat about your games, play on their breaks, help each other, celebrate hits and sulk after flops. Add a Studio Cat or Office Dog (Build → Decor) for morale, enjoy the seasons and birthdays, and save a picture with Menu → Office photo.'],
      ['Open betas', 'From 2005, an announced game in its polish phase can run one public beta (Develop → the project card). It adds two weeks and a server bill, but players find a quarter of the bugs, hype rises, and you get an early read on the review score.'],
      ['Expansion packs', 'From 1987, a paid game scoring 65+ can get up to two expansions within 5 years of launch. They take about 40% of the work, sell at 60% of the price mostly to people who own the base game, and bring lapsed players back to it. Not for cartridge platforms or free-to-play games.'],
      ['Rivalries', 'Launch within six weeks of a rival’s game in the same genre (both 65+) and the press calls it a showdown: the better-reviewed game wins a little reputation. Each rival keeps a win/loss record against you (Market → Rivals), and the one you clash with most becomes your nemesis.'],
      ['Esports leagues', 'After researching Esports (2009+), Company → Esports lets you run a league for a competitive game (shooter, strategy, fighting, MMO, sports or racing) scoring 75+ from the last six years. Viewers come from its player base, reviews and the league’s prestige, which grows each season. Sponsors pay per viewer; running costs and a yearly prize pool cost money. Big hits make real money, small ones mostly build fans. A strong sequel takes the league over automatically.'],
      ['Cheats', 'Menu → Cheats (or Settings → Sandbox) opens a sandbox: set or add cash, reputation and fans; forgive loans; edit any staff stats and traits or summon a hire; strengthen or cripple rivals; push genre and topic trends; clear sequel fatigue; unlock achievements; finish games instantly; set review bonuses and sales, work and research multipliers; unlock research; skip time; move offices for free; and switch on infinite money, no bankruptcy, a tireless team, bug-free code or a world without random events. Runs that use cheats are marked in the Hall of Fame.'],
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
