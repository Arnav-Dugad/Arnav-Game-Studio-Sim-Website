/** Placeable office items and office tiers. */

export type ItemCategory = 'desk' | 'energy' | 'decor' | 'room' | 'tech' | 'structure';

export type ItemId =
  | 'desk_basic'
  | 'desk_pro'
  | 'desk_studio'
  | 'desk_workstation'
  | 'coffee_machine'
  | 'water_cooler'
  | 'kitchen'
  | 'lounge_sofa'
  | 'arcade_cabinet'
  | 'pinball'
  | 'plant_small'
  | 'plant_large'
  | 'poster'
  | 'rug'
  | 'aquarium'
  | 'bookshelf'
  | 'game_library'
  | 'console_museum'
  | 'nap_pod'
  | 'trophy_shelf'
  | 'whiteboard'
  | 'meeting_table'
  | 'qa_station'
  | 'server_rack'
  | 'sound_booth'
  | 'mocap_rig'
  | 'training_desk'
  | 'rnd_bench'
  | 'marketing_board'
  | 'vending_machine'
  | 'bean_bag'
  | 'ping_pong'
  | 'neon_sign'
  | 'pet_cat'
  | 'pet_dog'
  | 'foosball'
  | 'claw_machine'
  | 'guitar_corner'
  | 'globe'
  | 'mascot_statue'
  | 'gym'
  | 'hammock'
  | 'karaoke';

export interface ItemDef {
  id: ItemId;
  name: string;
  category: ItemCategory;
  w: number;
  h: number;
  cost: number; // 1980 $
  upkeep: number; // 1980 $/month
  year: number;
  research?: string;
  /** Desk: productivity multiplier cap. */
  deskTier?: number;
  /** Energy station: energy restored per break. */
  energy?: number;
  /** Morale aura strength and radius (tiles). */
  aura?: number;
  radius?: number;
  /** Noise emitted (negative for focus-friendly items). */
  noise?: number;
  /** Special effect keys interpreted by the sim. */
  effect?: 'qa' | 'servers' | 'audio' | 'mocap' | 'training' | 'research' | 'marketing' | 'meeting' | 'trophies' | 'wellness';
  /** Effect strength. */
  power?: number;
  /** Extra unlock condition: a franchise with three games. */
  requires?: 'franchise3';
  desc: string;
}

export const ITEMS: readonly ItemDef[] = [
  { id: 'desk_basic', name: 'Folding Desk', category: 'desk', w: 1, h: 1, cost: 400, upkeep: 0, year: 1980, deskTier: 0.9, desc: 'A desk and a beige computer. It works.' },
  { id: 'desk_pro', name: 'Office Desk', category: 'desk', w: 1, h: 1, cost: 1_400, upkeep: 15, year: 1984, deskTier: 1.0, desc: 'Proper chair, proper monitor.' },
  { id: 'desk_studio', name: 'Studio Desk', category: 'desk', w: 1, h: 1, cost: 3_200, upkeep: 30, year: 1994, research: 'biz_ergonomics', deskTier: 1.12, desc: 'Ergonomic chair, dual monitors. +12% productivity cap.' },
  { id: 'desk_workstation', name: 'Dev Workstation', category: 'desk', w: 1, h: 1, cost: 6_500, upkeep: 60, year: 2006, research: 'biz_workstations', deskTier: 1.25, desc: 'Top-spec rig with fast builds. +25% productivity cap.' },
  { id: 'coffee_machine', name: 'Coffee Machine', category: 'energy', w: 1, h: 1, cost: 350, upkeep: 20, year: 1980, energy: 30, aura: 1, radius: 1, desc: 'Breaks restore 30 energy. Coffee Fiends love it.' },
  { id: 'water_cooler', name: 'Water Cooler', category: 'energy', w: 1, h: 1, cost: 200, upkeep: 8, year: 1980, energy: 18, aura: 2, radius: 2, desc: 'Gossip hub. Small energy and morale boost.' },
  { id: 'vending_machine', name: 'Vending Machine', category: 'energy', w: 1, h: 1, cost: 900, upkeep: 15, year: 1982, energy: 22, desc: 'Snacks on demand.' },
  { id: 'nap_pod', name: 'Nap Pod', category: 'energy', w: 1, h: 2, cost: 5_500, upkeep: 25, year: 2012, energy: 60, aura: 2, radius: 1, noise: -1, desc: 'Twenty minutes in the pod, full energy out. Breaks restore 60 energy.' },
  { id: 'kitchen', name: 'Kitchenette', category: 'energy', w: 2, h: 1, cost: 4_000, upkeep: 60, year: 1985, energy: 45, aura: 3, radius: 2, desc: 'Real food. Breaks restore 45 energy.' },
  { id: 'lounge_sofa', name: 'Lounge Sofa', category: 'energy', w: 2, h: 1, cost: 1_500, upkeep: 10, year: 1980, energy: 35, aura: 4, radius: 2, desc: 'Somewhere to collapse after a bug hunt.' },
  { id: 'bean_bag', name: 'Bean Bag', category: 'energy', w: 1, h: 1, cost: 250, upkeep: 0, year: 1995, energy: 20, aura: 2, radius: 1, desc: 'Peak 90s startup energy.' },
  { id: 'arcade_cabinet', name: 'Arcade Cabinet', category: 'decor', w: 1, h: 1, cost: 2_500, upkeep: 15, year: 1980, aura: 7, radius: 3, noise: 2, desc: 'Inspiration and noise in equal measure.' },
  { id: 'pinball', name: 'Pinball Table', category: 'decor', w: 1, h: 2, cost: 3_500, upkeep: 20, year: 1980, aura: 8, radius: 3, noise: 3, desc: 'Loud, beloved, bright.' },
  { id: 'ping_pong', name: 'Ping-Pong Table', category: 'energy', w: 2, h: 2, cost: 2_000, upkeep: 5, year: 1990, energy: 40, aura: 6, radius: 3, noise: 3, desc: 'Team bonding at 40 km/h.' },
  { id: 'plant_small', name: 'Desk Plant', category: 'decor', w: 1, h: 1, cost: 60, upkeep: 2, year: 1980, aura: 2, radius: 1, noise: -0.5, desc: 'Small, green, calming.' },
  { id: 'plant_large', name: 'Fiddle-Leaf Fig', category: 'decor', w: 1, h: 1, cost: 220, upkeep: 4, year: 1980, aura: 4, radius: 2, noise: -1, desc: 'A statement plant. Quiet focus nearby.' },
  { id: 'poster', name: 'Game Poster', category: 'decor', w: 1, h: 1, cost: 40, upkeep: 0, year: 1980, aura: 1.5, radius: 2, desc: 'Framed art from the classics.' },
  { id: 'rug', name: 'Rug', category: 'decor', w: 2, h: 2, cost: 300, upkeep: 0, year: 1980, aura: 2, radius: 2, noise: -1, desc: 'Muffles footsteps. Feels homey.' },
  { id: 'aquarium', name: 'Aquarium', category: 'decor', w: 2, h: 1, cost: 2_800, upkeep: 30, year: 1982, aura: 9, radius: 3, noise: -2, desc: 'Fish are excellent listeners.' },
  { id: 'game_library', name: 'Game Library', category: 'decor', w: 2, h: 1, cost: 1_200, upkeep: 0, year: 1985, aura: 4, radius: 2, effect: 'training', power: 0.06, desc: 'Every game worth playing, in its box. Inspiring — and a small learning boost nearby.' },
  { id: 'console_museum', name: 'Console Museum', category: 'decor', w: 2, h: 1, cost: 6_000, upkeep: 20, year: 1996, aura: 10, radius: 3, desc: 'A lit glass case of classic hardware. Big morale aura; visitors love it.' },
  { id: 'bookshelf', name: 'Bookshelf', category: 'decor', w: 2, h: 1, cost: 500, upkeep: 0, year: 1980, aura: 3, radius: 2, noise: -1, effect: 'training', power: 0.1, desc: 'Reference books. Small learning boost nearby.' },
  { id: 'pet_cat', name: 'Studio Cat', category: 'decor', w: 1, h: 1, cost: 300, upkeep: 30, year: 1980, aura: 6, radius: 4, noise: -0.5, desc: 'A cat bed — and the cat that comes with it. Naps, roams, sits on keyboards. Wide morale aura (pets don’t stack: the best one nearby counts).' },
  { id: 'pet_dog', name: 'Office Dog', category: 'decor', w: 1, h: 1, cost: 650, upkeep: 50, year: 1980, aura: 8, radius: 4, noise: 1, desc: 'A dog bed and a very good dog. Follows people around and greets everyone. Big morale aura, a little noisy (pets don’t stack).' },
  { id: 'foosball', name: 'Foosball Table', category: 'energy', w: 2, h: 1, cost: 1_800, upkeep: 5, year: 1980, energy: 32, aura: 5, radius: 2, noise: 2.5, desc: 'Spin to win. Breaks restore 32 energy; loud.' },
  { id: 'claw_machine', name: 'Claw Machine', category: 'decor', w: 1, h: 1, cost: 2_200, upkeep: 15, year: 1985, aura: 6, radius: 3, noise: 1, desc: 'Nobody has ever won the plushie. Everybody keeps trying.' },
  { id: 'guitar_corner', name: 'Guitar Corner', category: 'decor', w: 1, h: 1, cost: 900, upkeep: 0, year: 1980, aura: 4, radius: 2, noise: 1, desc: 'An acoustic on a stand for impromptu jam sessions.' },
  { id: 'globe', name: 'Antique Globe', category: 'decor', w: 1, h: 1, cost: 600, upkeep: 0, year: 1980, aura: 3, radius: 2, noise: -0.5, desc: 'For planning world domination (and localisation).' },
  { id: 'mascot_statue', name: 'Mascot Statue', category: 'decor', w: 1, h: 1, cost: 15_000, upkeep: 20, year: 1980, aura: 10, radius: 4, requires: 'franchise3', desc: 'A statue of your series’ hero in the lobby. Unlocks with a three-game franchise. Huge morale aura.' },
  { id: 'gym', name: 'Studio Gym', category: 'energy', w: 3, h: 2, cost: 40_000, upkeep: 300, year: 1995, energy: 25, aura: 4, radius: 3, noise: 1, effect: 'wellness', power: 0.25, desc: 'Treadmills and a rowing machine. Breaks restore 25 energy, and burnout builds 25% slower for anyone seated within six tiles.' },
  { id: 'hammock', name: 'Hammock', category: 'energy', w: 1, h: 2, cost: 1_100, upkeep: 6, year: 1980, energy: 24, aura: 2, radius: 1, noise: -1, desc: 'Swing gently. Breaks restore 24 energy; quiet.' },
  { id: 'karaoke', name: 'Karaoke Machine', category: 'decor', w: 1, h: 1, cost: 3_500, upkeep: 20, year: 1990, aura: 9, radius: 3, noise: 3.5, desc: 'Friday nights will never be the same. Big morale aura — and very loud.' },
  { id: 'neon_sign', name: 'Neon Sign', category: 'decor', w: 1, h: 1, cost: 1_200, upkeep: 10, year: 1984, aura: 5, radius: 3, desc: 'Your studio name in glowing glass.' },
  { id: 'trophy_shelf', name: 'Trophy Shelf', category: 'decor', w: 2, h: 1, cost: 1_000, upkeep: 0, year: 1980, aura: 2, radius: 3, effect: 'trophies', power: 1, desc: 'Shows the awards you have actually won (up to eight on display). Each award adds morale.' },
  { id: 'whiteboard', name: 'Whiteboard', category: 'room', w: 2, h: 1, cost: 300, upkeep: 0, year: 1980, aura: 1, radius: 2, effect: 'meeting', power: 0.03, desc: 'Brainstorm space. Small synergy boost nearby.' },
  { id: 'meeting_table', name: 'Meeting Table', category: 'room', w: 2, h: 2, cost: 2_200, upkeep: 10, year: 1980, effect: 'meeting', power: 0.08, desc: 'Teams that plan together build better games. +synergy studio-wide.' },
  { id: 'qa_station', name: 'QA Lab Station', category: 'tech', w: 2, h: 1, cost: 6_000, upkeep: 80, year: 1984, research: 'biz_qa_lab', effect: 'qa', power: 0.25, desc: 'Test hardware. +25% bug fixing per station (diminishing).' },
  { id: 'server_rack', name: 'Server Rack', category: 'tech', w: 1, h: 1, cost: 15_000, upkeep: 400, year: 1996, research: 'online_basic', noise: 2, effect: 'servers', power: 1, desc: 'Hosts online games. Each rack serves one online title comfortably.' },
  { id: 'sound_booth', name: 'Sound Booth', category: 'tech', w: 2, h: 2, cost: 12_000, upkeep: 60, year: 1988, research: 'audio_sampled', noise: -3, effect: 'audio', power: 0.15, desc: 'Studio-grade audio. +15% sound points.' },
  { id: 'mocap_rig', name: 'Mo-Cap Stage', category: 'tech', w: 3, h: 3, cost: 120_000, upkeep: 900, year: 1998, research: 'gfx_mocap', effect: 'mocap', power: 0.2, desc: 'Motion capture. +20% graphics points on 3D games.' },
  { id: 'training_desk', name: 'Training Station', category: 'room', w: 1, h: 1, cost: 2_500, upkeep: 20, year: 1985, effect: 'training', power: 0.5, desc: 'Training courses run 50% faster.' },
  { id: 'rnd_bench', name: 'R&D Bench', category: 'tech', w: 2, h: 1, cost: 8_000, upkeep: 90, year: 1985, research: 'biz_rnd_lab', effect: 'research', power: 0.2, desc: '+20% research speed (diminishing).' },
  { id: 'marketing_board', name: 'Marketing War Room', category: 'room', w: 2, h: 1, cost: 5_000, upkeep: 40, year: 1990, research: 'biz_marketing_dept', effect: 'marketing', power: 0.15, desc: '+15% hype from campaigns.' },
];

export const ITEM_BY_ID: Record<ItemId, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i])) as Record<ItemId, ItemDef>;

export interface OfficeTierDef {
  tier: number;
  name: string;
  floors: number;
  w: number;
  h: number;
  staffCap: number;
  rent: number; // 1980 $/month
  moveCost: number; // 1980 $
  minReputation: number;
  desc: string;
}

export const OFFICE_TIERS: readonly OfficeTierDef[] = [
  { tier: 1, name: 'Garage', floors: 1, w: 8, h: 6, staffCap: 4, rent: 250, moveCost: 0, minReputation: 0, desc: 'Where legends start. Cold in winter.' },
  { tier: 2, name: 'Small Office', floors: 1, w: 14, h: 10, staffCap: 12, rent: 2_200, moveCost: 18_000, minReputation: 10, desc: 'A real door with your name on it.' },
  { tier: 3, name: 'Studio Floor', floors: 1, w: 22, h: 14, staffCap: 30, rent: 7_500, moveCost: 90_000, minReputation: 25, desc: 'Open-plan floor in a creative district.' },
  { tier: 4, name: 'Studio Building', floors: 2, w: 24, h: 16, staffCap: 80, rent: 24_000, moveCost: 420_000, minReputation: 45, desc: 'Two floors. Your logo on the lobby wall.' },
  { tier: 5, name: 'Campus HQ', floors: 3, w: 28, h: 18, staffCap: 200, rent: 70_000, moveCost: 2_000_000, minReputation: 65, desc: 'A campus with a courtyard and a café.' },
  { tier: 6, name: 'Global HQ', floors: 4, w: 28, h: 18, staffCap: 400, rent: 160_000, moveCost: 7_500_000, minReputation: 80, desc: 'A landmark tower. The industry visits you.' },
];
