import { useState } from 'react';
import { Icon, type IconName } from '../icons';

/** Bump when adding entries so returning players see the card once. */
export const WHATS_NEW_VERSION = '2026-11-19d';
const KEY = 'ase:whatsNew';

const ITEMS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'sparkle', title: 'Four new signature features', body: 'Full voice acting (1996) for RPGs and adventures, dynamic music (2001), motion controls (2006) for sports and family games, and a speedrun mode (2010) the platformer crowd will love.' },
  { icon: 'lightbulb', title: 'Decisions during development', body: 'Making a game now throws up real choices: your designer pitches one more feature, a programmer finds a risky rendering trick, a hard drive dies (keep backups!), a famous composer offers a score, or playtesters fall in love with something you never planned.' },
  { icon: 'handshake', title: 'Platform partners', body: 'Platform holders now keep score (Market → Platforms). Great games on their hardware — exclusives most of all — win their favour: at 75+ your launches are featured on their storefront (+12% sales there), and devkits get up to 50% cheaper. Flops cool things off, and favour fades without new games. Interns now wear a lanyard, too.' },
  { icon: 'flag', title: 'Four new scenarios', body: 'Kickstarter Kid (raise $750k from fans), Early Access Odyssey (grow an Early Access game into an 85+ hit), Media Mogul (a two-million-fan series and three licensing hits) and Timeless (two games in the Hall of Classics). Pick Scenario when founding a studio.' },
  { icon: 'people', title: 'Summer internships', body: 'Staff → Policies (1985+): every June a few students join for the summer — cheap, green and full of potential, learning 50% faster. Pair them with mentors. On September 1 you can offer the standout intern a job; former interns are loyal for life.' },
  { icon: 'build', title: 'Bonsai, meditation & movie nights', body: 'Three new things to build: a Bonsai Tree (1984) the gardeners fuss over, a Meditation Corner (2005) that slows burnout nearby, and a Screening Room (1990) with a big screen and comfy seats — a big morale aura, and the retro gamers’ favourite hangout.' },
  { icon: 'heart', title: 'Hobbies', body: 'Everyone has a hobby now — baking, running, music, retro gaming, gardening, board games and more (shown on their card). It changes what they chat about and where they spend their breaks, and on Fridays the bakers bring in treats.' },
  { icon: 'medal', title: 'Hall of Classics', body: 'Ten years on, the best games of all time are inducted into the Golden Pixel Hall of Classics — front-page news, reputation, fans for the series and a new generation discovering it. Will yours make it? (Plus a little chime when fan mail arrives.)' },
  { icon: 'camera', title: 'Studio card', body: 'Company → History → Studio card: a shareable image of your run — your studio, the numbers, your three best games fanned out and the founder. Save it as a PNG and show it off.' },
  { icon: 'sparkle', title: 'Media & licensing', body: 'Company → IP → Licensing: turn your series into comics, board games, toy lines, cartoons, TV shows, films and theme-park rides. Take the money and run, or keep creative control for half the fee and a much better shot at a hit. Hits grow the fan base and send viewers back to your games; flops embarrass the series.' },
  { icon: 'megaphone', title: 'Conference talks', body: 'From 1988 the studio gets one speaking slot a year at the Developers Summit (open a senior’s or lead’s card). They talk about a game they made — or give an honest post-mortem of a flop. A great talk builds reputation and brings better applicants for three months… and puts your star in front of rival recruiters.' },
  { icon: 'people', title: 'Studio yearbook', body: 'Every New Year’s Day your team lines up for a class photo (Company → Yearbook) — the founder in front, the old guard behind, with the year’s games and awards in the caption. Their faces show how the year went. Watch the garage crew grow into an empire.' },
  { icon: 'palette', title: 'Fan mail & fan art', body: 'Players now write in about the games they love — thank-yous, funny stories, sequel requests — and kids send crayon drawings of your games (News → Fan mail). Every letter cheers up the people who made that game. Build a Fan Art Wall and pin your favourite drawings up in the office.' },
  { icon: 'crowd', title: 'Crowdfunding campaigns', body: 'From 2012, pitch a self-published game to your fans (Develop → the project → Crowdfund): 30 days, all or nothing, with a live pledge bar. Pick a modest, ambitious or moonshot goal; stretch goals add content. Backers become fans — and they remember whether you delivered on time.' },
  { icon: 'heart', title: 'Life outside work', body: 'Your people have lives now: very close colleagues may fall for each other (and marry — the whole studio is invited), staff get married and go on honeymoon, have babies, and sometimes have to move away (a remote policy lets them stay). Set parental leave in Staff → Policies: two, six or sixteen weeks — each a real trade-off.' },
  { icon: 'coin', title: 'Early Access', body: 'From 2012, put a self-published PC game on sale while it’s still in production (Develop → the project). Players pay 25% less, file bug reports and shape the design — up to +3% quality — and a great build spreads the word. But Early Access buyers won’t buy again at 1.0, the launch is partly old news, and after 18 months players lose patience. Abandoning one is a scandal.' },
  { icon: 'target', title: 'Quarterly objectives', body: 'Goals → This quarter: three bite-sized goals that fit your studio right now — ship a game, lift morale, hire, grow cash, finish research. Each one met pays cash, reputation and a morale lift. Plus: a robot vacuum (2002+).' },
  { icon: 'people', title: 'Focus tests, re-releases, wellness & floor copying', body: 'Run a focus test once per phase (any era) for a rough score and what players want more of. From 2006, re-release 12-year-old classics on modern storefronts. A Wellness Program policy slows burnout. In big offices, copy a floor’s layout onto the next floor.' },
  { icon: 'coin', title: 'Venture funding', body: 'Company → Stock: before going public, raise a Seed round, Series A and Series B — cash now for a slice of the studio. Every round shrinks the share you keep at the IPO.' },
  { icon: 'handshake', title: 'Spin-offs & negotiation', body: 'A star who quits may found their own studio and become your rival (buy them back for an achievement). And you can now haggle with publishers: ask for a bigger advance or royalty — they might walk away.' },
  { icon: 'leaf', title: 'Sabbaticals & work anniversaries', body: 'Veterans with 8+ years can take a two-month sabbatical and come back better at their craft. Work anniversaries bring cake every five years and loyalty at 10, 20 and 30.' },
  { icon: 'library', title: 'New topics, gym & unions', body: 'Four new topics with their own cover art — Trains, Witches & Wizards, Giant Monsters and Cozy Village (huge around 2020). A Studio Gym slows burnout nearby. Heavy crunch can spark a union drive. Personalities now show in the office.' },
  { icon: 'sparkle', title: 'Little things', body: 'Lo-fi beats from 2012, Ctrl+Z to undo today’s last placement in build mode, school tours for famous studios, Monday-morning arrivals, starry night windows, a dice button for studio names, and knock-off counts on your hits.' },
  { icon: 'people', title: 'Fan conventions & seasonal sales', body: 'Company → IP: a series with 300k+ fans can host its own convention every two years (fans +8%, hype for the sequel). In June and December, put your whole catalogue on sale in one click.' },
  { icon: 'bug', title: 'Bug bash & copycats', body: 'During polish, run a 20-second bug bash (Develop → the project): squash bugs to fix up to a quarter of them, once per game. And your big hits now inspire rival knock-offs.' },
  { icon: 'people', title: 'Mentorship', body: 'Pair a junior with a senior in the same craft (open the junior’s card): they learn 40% faster and grow close; the mentor gives up 3% output per mentee. Plus: late-night crunch lighting, headhunters, anniversaries, promotions and welcome-backs in the office.' },
  { icon: 'news', title: 'Front pages & credits', body: 'Big moments make the front page — a broadsheet in the 80s, a tabloid in the 90s, a news site later. Every game now ends with a credits roll, and staff cards list the games each person shipped.' },
  { icon: 'palette', title: 'Office style', body: 'Office panel → Style: pick the floor (wood, carpet, concrete, tiles, checkerboard) and the wall colour. Purely cosmetic — make the place yours.' },
  { icon: 'build', title: 'New things to build', body: 'Foosball table, claw machine (1985), guitar corner, antique globe — and a Mascot Statue once a franchise has three games. Staff play foosball, try the claw, jam on the guitar and pose for photos with your mascot. People who leave now pack a box and say goodbye.' },
  { icon: 'eye', title: 'Cinematic mode & live monitors', body: 'Press V (or Menu → Cinematic mode) to hide the interface and let the camera wander between conversations, breaks and busy desks. Screens at working desks now show code, art, waveforms, game tests and charts.' },
  { icon: 'building', title: 'Branch offices abroad', body: 'Market → World: from 1985, open a studio in Europe, Japan or the rest of the world. Every game is localised there for free and the local team lifts sales a little — for monthly rent.' },
  { icon: 'flag', title: 'Scenarios', body: 'Found a studio in Scenario mode: challenges from Garage Days to Empire — survive the 1983 crash, build Japan’s greatest RPG house, bet on 3D, win Game of the Year as a two-person indie. Goals and the deadline live in the Goals panel.' },
  { icon: 'sparkle', title: 'Live events', body: 'Run seasonal events in your subscription, free-to-play and live-service games (open the game → Post-launch): a Halloween Spooktacular or Winter Festival costs about a month of live income and lifts it for three months — most for well-loved games.' },
  { icon: 'trophy', title: 'Employee of the Month & team retreats', body: 'Each month your top contributor wins Employee of the Month (a medal on their shirt and a morale boost). Once a year, book a team retreat (Staff → Policies): everyone rested, morale up, friendships closer.' },
  { icon: 'people', title: 'Friendships & feuds', body: 'Colleagues on the same project grow close (or clash). Best friends on a team lift morale and team chemistry; feuds drag both down and need your call — mediate, split them up or let it ride. See who gets on with whom on each staff card.' },
  { icon: 'music', title: 'Office ambience', body: 'Hear your studio: keyboards clatter with the number of people working (clacky in the 80s), chatter murmurs, the coffee machine gurgles, desk phones ring and the pets chime in. Settings → Office ambience.' },
  { icon: 'sparkle', title: 'Studio culture', body: 'Company → Culture: pick up to two values — Quality First, Ship Fast, Player Obsessed, Profit Driven, Innovation, Work-Life Balance. Each is a real trade-off, some clash, and changing course costs morale and waits a year.' },
  { icon: 'globe', title: 'World regions & localisation', body: 'North America, Europe, Japan and the rest of the world each have their own tastes and a share of players that shifts over the decades. Choose your home region when founding a studio, and localise games (from 1983) to reach players abroad — an RPG in Japan, a strategy game in Europe. Market → World; each game shows its players by region.' },
  { icon: 'people', title: 'Visitors', body: 'People drop by: couriers with parcels, the pizza run during crunch, journalists chasing a preview of your hyped game, investors calling on the founder, candidates arriving for interviews.' },
  { icon: 'bell', title: 'Shareholder meetings', body: 'Public studios face their shareholders every May: pay a dividend, promise bold growth or hold steady — and if the board turns on you, fight a no-confidence vote or accept a cost-cutting mandate.' },
  { icon: 'star', title: 'Staff ambitions', body: 'People now form personal goals — make a game in a genre they love, ship a hit, earn a raise, do research, master their craft, get a better desk, take a holiday. Help them before the deadline for a big loyalty and morale boost; ignore them and they feel overlooked. Staff → Team → Ambitions.' },
  { icon: 'camera', title: 'Office photo', body: 'Menu → Office photo saves a captioned picture of your studio floor — pets, holiday lights and all.' },
  { icon: 'news', title: 'Player buzz', body: 'News → Buzz: what players say about your games — magazine letters in the 80s, bulletin boards, forums, then social posts and streams. Each game’s page shows its sentiment and top posts.' },
  { icon: 'calendar', title: 'Seasons & holidays', body: 'Snow on the windows, string lights and a tree in December, Santa hats, pumpkins and witch hats at Halloween, autumn leaves and spring flowers, balloons after a party, New Year cheers — and everyone has a birthday (party hat and cake).' },
  { icon: 'heart', title: 'Office pets', body: 'Build menu → Decor: a Studio Cat or an Office Dog. They nap, roam, follow people, sit on keyboards and get fussed over — and lift morale across a wide area. Hover one to learn its name.' },
  { icon: 'people', title: 'Characters come alive', body: 'Everyone now blinks, breathes, smiles or frowns with their mood, talks with their hands, types, sips coffee, waves hello, stretches, yawns, checks their phone, facepalms at bugs, high-fives friends, lounges on sofas — and dances when a game hits.' },
  { icon: 'people', title: 'A living office', body: 'Staff chat about your games, reviews and rivals, play arcade games on breaks, visit teammates to help, think at whiteboards — and greet you on their first day.' },
  { icon: 'sliders', title: 'Signature features', body: 'Open world, online multiplayer, branching story, battle pass and more — up to three per game, each a bet on your genre.' },
  { icon: 'house', title: 'Studio overview & automation', body: 'A home screen of everything needing attention with one-click fixes (O), plus policies that put idle staff on research and send burnt-out people on vacation.' },
  { icon: 'people', title: 'Big-team management', body: 'Filter, search, group and bulk-assign hundreds of staff; every team picker gets search and a one-click “Best team”.' },
  { icon: 'sparkle', title: 'Cheats & sandbox mode', body: 'Bend any rule from Menu → Cheats (press `), with one-click presets, or tick Sandbox mode when founding a studio.' },
  { icon: 'trophy', title: 'Gala ceremonies & rivalries', body: 'Win an award and the Golden Pixel Gala celebrates you. Beat rival studios in head-to-head showdowns.' },
];

function seen(): boolean {
  try {
    return localStorage.getItem(KEY) === WHATS_NEW_VERSION;
  } catch {
    return true;
  }
}

export function WhatsNew() {
  const [open, setOpen] = useState(() => !seen());
  const [all, setAll] = useState(false);
  if (!open) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, WHATS_NEW_VERSION);
    } catch {
      /* private mode: just hide it for this visit */
    }
    setOpen(false);
  };
  return (
    <section aria-label="What’s new" className="mt-4 rounded-2xl border border-accent/40 bg-accent/5 p-4 animate-fade-up">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-accent">What’s new</div>
          <h2 className="font-display text-lg font-semibold">New ways to build your empire</h2>
        </div>
        <button type="button" aria-label="Dismiss what’s new" className="grid size-7 place-items-center rounded-lg text-ink3 hover:bg-bg2" onClick={close}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {(all ? ITEMS : ITEMS.slice(0, 8)).map((it) => (
          <li key={it.title} className="flex gap-2.5 text-xs">
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
              <Icon name={it.icon} size={14} />
            </span>
            <span>
              <b className="block text-sm">{it.title}</b>
              <span className="text-ink2">{it.body}</span>
            </span>
          </li>
        ))}
      </ul>
      {ITEMS.length > 8 && (
        <button type="button" className="mt-2 text-xs font-semibold text-accent hover:underline" onClick={() => setAll((x) => !x)}>
          {all ? 'Show fewer' : `Show all ${ITEMS.length} updates`}
        </button>
      )}
    </section>
  );
}
