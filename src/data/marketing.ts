/** Marketing channels and trade shows (fictional show names). */
export interface ChannelDef {
  id: string;
  name: string;
  from: number;
  to?: number;
  research?: string;
  cost: number; // 1980 $ per campaign
  hype: number; // hype gained (before diminishing returns)
  /** Audience the channel reaches best. */
  audience: { kids: number; everyone: number; teen: number; mature: number };
  desc: string;
}

export const CHANNELS: readonly ChannelDef[] = [
  { id: 'flyers', name: 'Store Flyers', from: 1980, to: 2005, cost: 1_500, hype: 0.08, audience: { kids: 1, everyone: 1, teen: 1, mature: 1 }, desc: 'Cheap, local, effective early on.' },
  { id: 'magazine', name: 'Magazine Ads', from: 1980, to: 2014, cost: 8_000, hype: 0.25, audience: { kids: 0.9, everyone: 1, teen: 1.2, mature: 1.1 }, desc: 'Full-page spreads in the gaming press.' },
  { id: 'demo_disc', name: 'Demo Discs', from: 1994, to: 2010, cost: 25_000, hype: 0.45, audience: { kids: 1, everyone: 1, teen: 1.2, mature: 1.1 }, desc: 'Let players try it on a magazine cover disc.' },
  { id: 'tv', name: 'TV Commercials', from: 1982, research: 'biz_marketing_dept', cost: 90_000, hype: 0.9, audience: { kids: 1.3, everyone: 1.3, teen: 1, mature: 0.8 }, desc: 'Expensive, massive reach.' },
  { id: 'web_banners', name: 'Web Banners', from: 1997, cost: 12_000, hype: 0.25, audience: { kids: 0.7, everyone: 0.9, teen: 1.1, mature: 1.2 }, desc: 'Banners on gaming portals.' },
  { id: 'trailer', name: 'Cinematic Trailer', from: 2000, cost: 60_000, hype: 0.7, audience: { kids: 0.9, everyone: 1, teen: 1.2, mature: 1.25 }, desc: 'A trailer that gets people talking.' },
  { id: 'social', name: 'Social Media Campaign', from: 2008, cost: 20_000, hype: 0.45, audience: { kids: 0.8, everyone: 1.1, teen: 1.3, mature: 1 }, desc: 'Viral moments, memes, community.' },
  { id: 'influencers', name: 'Streamers & Influencers', from: 2013, cost: 45_000, hype: 0.85, audience: { kids: 1.1, everyone: 1, teen: 1.4, mature: 1 }, desc: 'Get the game in front of big streamers.' },
  { id: 'open_beta', name: 'Open Beta', from: 2005, research: 'online_basic', cost: 35_000, hype: 0.6, audience: { kids: 0.8, everyone: 1, teen: 1.3, mature: 1.2 }, desc: 'Let the world play early. Also finds bugs.' },
];

export interface TradeShowDef {
  id: string;
  name: string;
  month: number; // 1..12
  from: number;
  to?: number;
  /** Booth costs (1980 $) and hype for small/medium/large. */
  booths: [number, number, number];
  hype: [number, number, number];
  rep: [number, number, number];
}

export const TRADE_SHOWS: readonly TradeShowDef[] = [
  { id: 'winter_electronics', name: 'Winter Electronics Showcase', month: 1, from: 1980, to: 1996, booths: [6_000, 20_000, 60_000], hype: [0.25, 0.55, 1.0], rep: [1, 2, 4] },
  { id: 'summer_games_expo', name: 'Summer Games Expo', month: 6, from: 1995, to: 2022, booths: [15_000, 60_000, 200_000], hype: [0.35, 0.8, 1.5], rep: [1, 3, 6] },
  { id: 'eurogame_fest', name: 'EuroGame Fest', month: 8, from: 2002, booths: [10_000, 40_000, 140_000], hype: [0.3, 0.65, 1.2], rep: [1, 2, 5] },
  { id: 'tokyo_play_show', name: 'Tokyo Play Show', month: 9, from: 1996, booths: [10_000, 38_000, 130_000], hype: [0.3, 0.6, 1.1], rep: [1, 2, 5] },
  { id: 'showcase_live', name: 'Showcase Live (online)', month: 6, from: 2020, booths: [20_000, 70_000, 220_000], hype: [0.35, 0.85, 1.6], rep: [1, 3, 6] },
];
