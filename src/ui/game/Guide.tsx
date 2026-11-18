import { useState } from 'react';
import { Modal, Segmented, inputCls } from '../components/ui';

const SECTIONS: { id: string; title: string; body: [string, string][] }[] = [
  {
    id: 'games',
    title: 'Making games',
    body: [
      ['Concept', 'Pick genre × topic × platform × audience. Some combinations are great, some are awful — you learn which by shipping. Your design notes (Market → Trends) remember what worked.'],
      ['Focus sliders', 'Each phase has three focus areas. Genres care about different things: RPGs want story and dialogue, racing games want engine and graphics. Gold marks show what worked for you before.'],
      ['Effort & size', 'Bigger games need bigger teams. A score depends on the effort your team puts in compared with what the era expects — the bar rises every year.'],
      ['Bugs & QA', 'Tech work creates bugs; QA skill (and QA lab stations) fix them during polish. Crunch is faster but buggier and burns people out. From 1986 a buggy console game can fail certification and cost you a week or two.'],
      ['Engines', 'Research features, then build your own engine (Research → Engines) or license one. Old engines look dated on new hardware.'],
      ['Release timing', 'Boxed games sell best in November–December. Competing with a big release in the same genre hurts.'],
      ['Public demos', 'From 1990, an announced game in polish can release a demo once. Demos tell the truth: a great game (75+) wins players over, a weak one (under 60) puts them off.'],
      ['Easter eggs', 'Sometimes someone hides a secret in a game. Leave it in and players may find it a few months after launch — a little buzz and a proud developer.'],
      ['Price tiers', 'Self-published full-price games pick a launch price: Budget (about 30% more buyers and fans at 30% less per copy; players love the value), Standard, or Premium (more per copy, fewer buyers — forgiven only on an 85+ game). Publishers set their own prices.'],
      ['Review embargo', 'During polish, choose when reviews go live: a week early (great reviews sell more, weak ones scare buyers off), at launch, or no review copies at all (hides a weak game a little longer, but the press notices and a decent game sells a little less).'],
      ['Shadow drops', 'From 2015, a good game that was never announced launches as a surprise: the shock is the marketing, and it works best for studios people already know.'],
      ['Cliffhangers', 'The Cliffhanger feature costs a little user score now, but the sequel starts with built-in hype — and paying it off delights players.'],
      ['Post-mortems', 'Every release has a post-mortem (open it from the Games panel): what went right, what went wrong and what to try next time. Money is only judged once sales have settled.'],
      ['Genre renown', 'Average 75+ across your recent games in a genre (at least two) and your studio becomes known for it (★ in the genre picker and on the Overview): up to 12% more buyers for your next one — but a weak entry disappoints those fans.'],
      ['Licences', 'An official league licence or a licensed soundtrack lasts seven years. When it runs out on a game that still sells, renew it (half the original fees) or let it be delisted for good.'],
      ['Trailers & documentaries', 'Announced games can cut a trailer (a 25-second mini-game) for extra hype. From 1995 a film crew may ask to follow a medium-or-bigger game: hype now, and six months after launch the film premieres — acclaimed for a great game, a cautionary tale for a flop.'],
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
      ['One-on-ones', 'Open anyone’s card and Check in: they say what’s really on their mind (burnout, pay against the market, a cramped desk, a dream) and feel heard. Six a month, plus two per producer; the same person benefits again after 90 days.'],
      ['Launch bonuses', 'Within two months of a launch, open the game (Games panel) and thank the team with a bonus: better mood for three months and more loyalty for everyone credited. Bigger hits cost more.'],
      ['Team pulse', 'Staff → Team → Team pulse adds up everyone’s morale into the few things lifting and dragging the whole studio, with how many people each touches and a fix. It opens by itself when morale is low.'],
      ['Staff pitches', 'Senior designers, producers and writers sometimes pitch the game they’ve always wanted to make. Greenlight it and it waits in the new-game screen for six months; make it with them on the team and it’s their passion project — fresh ideas and a very happy developer (cancelling it breaks their heart).'],
      ['Former colleagues', 'People who left on good terms (moved away, took a rival’s offer, finished an internship) may ask to come back one to eight years later — more skilled, asking today’s market rate, and starting out loyal.'],
      ['Studio Awards', 'Every December: MVP, Rookie of the Year, Mentor of the Year and Heart of the Studio. Winners keep the honour on their card.'],
      ['Favourite genres & hobbies', 'Everyone has a favourite genre (a ♥ in the team picker): on a game they love they work 5% faster and are happier. Hobbies change their chatter and breaks.'],
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
      ['Publisher trust', 'Deliver published games on time and above the bar and that publisher offers bigger advances and better terms; let them down and they grow wary. Trust fades slowly either way.'],
      ['Giving back', 'Staff → Policies: pledge 1% or 5% of monthly profit to charity for morale and goodwill; open-source an eight-year-old engine for reputation.'],
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
      ['Mentorship', 'Open a junior or mid-level person’s card and pick a mentor: a senior or lead in the same craft (or the founder). They learn noticeably faster and grow close; the mentor gives up 3% output per mentee, three at most. Mentees graduate when they reach senior.'],
      ['Unions', 'From 2005, a bigger studio that crunches hard while morale sinks may face a union drive. Recognising it costs 5% more pay but lifts morale for good and halves the morale cost of crunch; fighting it hurts your reputation and risks a walkout.'],
      ['Bug bash', 'During a game’s polish phase, run one 20-second bug bash from its card in Develop: every bug you squash fixes about 1% of the remaining bugs, up to a quarter.'],
      ['Live events & conventions', 'Live games (subscription, free-to-play, live service) can run a seasonal event every 90 days for a boost to live income. A series with 300k+ fans can host its own convention every two years: more fans and hype for the next entry.'],
      ['Branch offices', 'Market → World: from 1985 (reputation 35) open a studio in another region. Every game is translated there for free and sells a little better — for monthly rent.'],
      ['Copycats', 'Ship an 85+ hit and rivals may rush out knock-offs in the same genre and topic. They review worse but crowd that space for a while.'],
      ['Gym', 'The Studio Gym (1995+) is a break area that also slows burnout for everyone seated within six tiles.'],
      ['Scenarios', 'Pick Scenario mode when founding a studio for a curated challenge with its own start year, team, cash, goals and deadline — from the gentle Garage Days to the Legendary Empire. The Goals panel tracks each goal; meet them all before the deadline to win, and keep playing afterwards either way.'],
      ['World regions & localisation', 'North America, Europe, Japan and the rest of the world each like different genres, and their share of players shifts over the decades (Market → World). Your home region is chosen when you found the studio. From 1983 you can localise a game for other regions in the new-game wizard — it costs money and a little extra work, and sales rise in proportion to how much each region likes the genre (an RPG in Japan, a strategy game in Europe). Unlocalised games still sell; they just leave players on the table.'],
      ['Studio culture', 'Company → Culture: up to two values. Quality First (better games, slower), Ship Fast (faster, buggier), Player Obsessed (happier players and more fans, lower prices), Profit Driven (higher prices, lower morale), Innovation (faster research, new IP shines, sequels suffer) and Work-Life Balance (happier, less burnout, less output). Some clash. The first choice is free; changing later costs morale and waits a year.'],
      ['Staff ambitions', 'Now and then someone sets a personal goal — ship a game in a genre they love, ship an 80+, their first game, a raise, a month of research, a skill milestone or a holiday. Their card shows the goal, the deadline and a one-click fix where there is one. Help them and loyalty and morale jump; ignore them and they feel overlooked. Taking a promised raise back is remembered.'],
      ['Co-development', 'From 1985, a medium, large or AAA game in pre-production or production can take on a co-development partner (not with a publisher deal). The partner adds a team (up to 40% of the size’s team cap, working like real staff of their quality) every workday — with 15% more bugs than usual. Their share of net revenue (15–55%, including Early Access sales) follows how much they bring relative to a typical team for that size, for the game’s whole life — unless you buy them or they close down, which ends both their work and their cut. They’ll only sign if your reputation is at least half of theirs.'],
      ['Player community', 'From 2005 you can open an official community hub (Company → Community) once you’ve shipped a game. Members grow toward 2% of your fans, plus 1.5% per moderation level. Health (0–100) drifts toward a target set by your last three games’ user scores, moderation (+8 per level) and recent mood swings: patches (+4), live events (+3), launches (by user score), a denied crunch scandal (−12), how you handle review bombs. Effects: up to ±2 user score at launch, ×0.85–1.25 crowdfunding pledges, and review bombs 2.5× likelier when toxic (under 35) or much rarer when healthy (over 70).'],
      ['Platform partners', 'Each platform holder (not open platforms like PC, and not your own hardware) has a favour score from 0 to 100, starting neutral at 50 (Market → Platforms). Every new game on their platforms moves it by (score − 65) ÷ 5, plus 4 for an exclusive, scaled by size (small ×0.3 up to AAA ×1.5); flops lower it. Porting an exclusive within a year takes the exclusive bonus back, and then some. It drifts 2% a month back toward 50. At 70+ their devkits cost 30% less (50% at 85+); at 25 or below, 25% more. At 75+ your launches on their platforms are featured on the storefront: +12% sales potential there.'],
      ['Summer internships', 'Turn on Summer internships in Staff → Policies (from 1985). Each June 1, one student per 25 staff (one to four) joins if there are free desks: junior skills at 60%, potential 15–25 higher than usual, a stipend of about a third of a junior salary, and 50% faster learning (mentors stack). They leave on September 1; the best of them gets an offer event — hire them as a junior at 90% of market salary with +25 loyalty, or let them go back to school.'],
      ['Life outside work', 'Each month a few people have news. Colleagues with a very close bond (85+) may start dating, and couples often marry within a year or two — a ten-day honeymoon for both and +3 morale for the studio. Anyone can marry (ten days off, a happy few months) or have a baby, which starts parental leave: two weeks (−8 loyalty, a sour mood, and 15% quit), six weeks (+4 loyalty) or sixteen weeks (+15 loyalty, +1 morale for everyone, but a long absence). New parents come back short on sleep. When someone’s partner moves for work, a remote policy keeps them; otherwise half resign and the rest face a long commute. Staff cards show who’s married, dating and how many kids they have.'],
      ['Friendships & feuds', 'People on the same project grow closer each week — faster for social butterflies, team players and mentor/junior pairs; hotheads and crunch strain things. Team chemistry shows in a project’s synergy, a best friend on the team lifts morale, and a feud costs both and raises a decision. Staff cards list each person’s closest friends and rivals.'],
      ['Shareholders', 'Once you’ve been public for a while, the annual meeting comes every May: pay a dividend, promise bold growth (expectations rise) or hold steady. If the board turns on you and you own less than half the company, you’ll face a no-confidence vote.'],
      ['Player buzz', 'News → Buzz shows what players say about your games — magazine letters in the 80s, bulletin boards and forums, then social posts and streams. It reflects the real reasons: reviews vs. user scores, bugs, price, features, sequels.'],
      ['Living office', 'Your people chat about your games, play on their breaks, help each other, celebrate hits and sulk after flops. Add a Studio Cat or Office Dog (Office → Edit layout → Decor) for morale, enjoy the seasons and birthdays, and save a picture with Menu → Office photo.'],
      ['Media & licensing', 'Company → IP → Licensing. Each medium unlocks with a fan base and an era: comics and board games (20k/40k fans), toys (100k, 1982), cartoons (250k, 1988), films (1M, 1993), theme-park rides (2.5M, 1996), TV series (600k, 1998). The licensee pays a fee up front (fans × the series’ best score; half if you keep creative control) and releases it 6–30 months later. Quality depends on your best game, creative control (a big help) and the era — film and TV adaptations of games were usually bad until the late 2010s. Hits grow fans (+4% to +20%), pay royalties and, for screen adaptations, revive the latest game’s sales; flops cost fans and reputation. Up to three deals in production; the same medium again after three years.'],
      ['Conference talks', 'From 1988, once a year, a senior, lead or the founder can speak at the Developers Summit about a game they’re credited on (their staff card → Conference talk). Reception depends on their main skill, their level and the game (a flop makes a popular post-mortem). A good talk gives reputation and three months of job-seeker buzz (more and better candidates); a standing ovation gives more — and for three months rivals try to poach the speaker even when they’re fairly loyal. The speaker is away three days and comes back a little sharper and happier.'],
      ['Fan mail', 'Games scoring 72+ in the last five years draw fan mail — more for better and bigger-selling games, most in their first year (two pieces a month at most). Letters and children’s drawings land in News → Fan mail; each gives the game’s credited team +2 morale. Build a Fan Art Wall (Decor) to pin up to eight drawings: each pinned one adds +0.5 morale studio-wide (up to +4), and staff stop by to admire them.'],
      ['Crowdfunding', 'From 2012, a self-published new game can run one crowdfunding campaign before polish, at least 45 days before launch (Develop → the project → Crowdfund). Pledges depend on your fans (and the series’ fans), reputation, hype and the projected score; they rush in on day one, sag, and spike at the end. It’s all or nothing: miss the goal and nobody pays (−1.5 reputation). A modest goal is safe; an ambitious or moonshot goal draws more pledges and hype but often fails. Funded campaigns pay out minus 10% fees, turn backers into fans, and unlock stretch goals at 150/200/300% (+1.5% quality each, ten more days of polish). Backers are promised the planned date plus 45 days: deliver on time for +2 user score, late costs up to −6. Cancelling a funded game is a scandal.'],
      ['Early Access', 'From 2012, a self-published, buy-up-front game with a PC version can go on sale during production or polish (Develop → the project card). Early Access copies sell at 25% off and count towards the game’s totals. The build’s rating (what’s there now, minus what’s still missing) drives sales and word of mouth; players report bugs (QA ×1.15) and their feedback is worth up to +3% quality over six months. At 1.0, Early Access buyers don’t buy again on PC and some of the hype is old news. After 18 months the community grows restless — reputation and hype drip away every week — and cancelling an Early Access game costs 6 reputation.'],
      ['Open betas', 'From 2005, an announced game in its polish phase can run one public beta (Develop → the project card). It adds two weeks and a server bill, but players find a quarter of the bugs, hype rises, and you get an early read on the review score.'],
      ['Expansion packs', 'From 1987, a paid game scoring 65+ can get up to two expansions within 5 years of launch. They take about 40% of the work, sell at 60% of the price mostly to people who own the base game, and bring lapsed players back to it. Not for cartridge platforms or free-to-play games.'],
      ['Rivalries', 'Launch within six weeks of a rival’s game in the same genre (both 65+) and the press calls it a showdown: the better-reviewed game wins a little reputation. Each rival keeps a win/loss record against you (Market → Rivals), and the one you clash with most becomes your nemesis.'],
      ['Esports leagues', 'After researching Esports (2009+), Company → Esports lets you run a league for a competitive game (shooter, strategy, fighting, MMO, sports or racing) scoring 75+ from the last six years. Viewers come from its player base, reviews and the league’s prestige, which grows each season. Sponsors pay per viewer; running costs and a yearly prize pool cost money. Big hits make real money, small ones mostly build fans. A strong sequel takes the league over automatically.'],
      ['Cheats', 'Menu → Cheats (or Settings → Sandbox) opens a sandbox: set or add cash, reputation and fans; forgive loans; edit any staff stats and traits or summon a hire; strengthen or cripple rivals; push genre and topic trends; clear sequel fatigue; unlock achievements; finish games instantly; set review bonuses and sales, work and research multipliers; unlock research; skip time; move offices for free; and switch on infinite money, no bankruptcy, a tireless team, bug-free code or a world without random events. Runs that use cheats are marked in the Hall of Fame.'],
      ['Storefront sales', 'Once most copies sell digitally, a paid game at least 4 months old can go 25%, 50% or 75% off every 6 months. Half price usually earns the most; 75% off moves the most copies (and wins fans before a sequel). Each sale draws a little less than the last.'],
      ['Classics collections', 'From 2006, a self-published 70+ game at least 12 years old can be re-released on a modern storefront (open it from the Games panel) — on its own, or bundled with up to four more classics as a collection that sells to more players.'],
      ['Daily challenge', 'When founding a studio, pick Daily challenge: one scenario and one starting world per day, the same for every player (standard difficulty, an all-rounder founder). Daily runs are marked in the Hall of Fame.'],
      ['Awards season', 'The Golden Pixel Gala is on New Year’s Day: Game of the Year needs 85+ and to beat every rival, a genre award 80+ and to beat the genre. From September you can run one awards campaign a year for a 78+ game (open it from the Games panel): +2 with the jury.'],
      ['Hall of Classics', 'Ten years on, the best games of all time may be inducted into the Hall of Classics: reputation, series fans and a new generation of players.'],
      ['Yearbook & studio card', 'Company → Yearbook keeps a photo of the team every New Year; Company → History → Studio card makes a shareable image of your run.'],
      ['Mascot & headquarters', 'Menu → Studio identity designs your mascot (it stars on the office statue and your studio card); the Office panel shows your building as it grows.'],
    ],
  },
];

export function GuideModal({ onClose, initial = 'games' }: { onClose: () => void; initial?: string }) {
  const [tab, setTab] = useState(initial);
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const sec = SECTIONS.find((x) => x.id === tab) ?? SECTIONS[0]!;
  // searching looks through every section at once
  const rows = query ? SECTIONS.flatMap((x) => x.body).filter(([k, v]) => k.toLowerCase().includes(query) || v.toLowerCase().includes(query)) : sec.body;
  return (
    <Modal open onClose={onClose} title="How to play" wide>
      <h2 className="font-display text-2xl font-semibold">How to play</h2>
      <Segmented ariaLabel="Guide sections" value={tab} onChange={setTab} className="mt-3" options={SECTIONS.map((x) => ({ value: x.id, label: x.title }))} />
      <input className={inputCls + ' mt-3 h-9 text-sm'} placeholder="Search the guide…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the guide" />
      {query && !rows.length && <p className="mt-4 text-sm text-ink3">Nothing about “{q.trim()}” yet.</p>}
      <dl className="mt-4 space-y-3">
        {rows.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-bg2/60 p-3">
            <dt className="text-sm font-semibold">{k}</dt>
            <dd className="mt-0.5 text-sm text-ink2">{v}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
