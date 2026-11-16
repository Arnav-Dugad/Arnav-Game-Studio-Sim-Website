/** Tech tree. Nodes with `engineTech` are engine features you can include in a custom engine. */
export type ResearchBranch = 'graphics' | 'audio' | 'systems' | 'online' | 'platforms' | 'business' | 'ai';

export interface ResearchDef {
  id: string;
  name: string;
  branch: ResearchBranch;
  /** Earliest year it can be researched (historical gate). */
  year: number;
  /** Research points required. */
  points: number;
  /** Cash cost in 1980 dollars. */
  cost: number;
  requires: string[];
  /** If set, this node is an engine feature adding this much tech level. */
  engineTech?: number;
  /** Quality bonus for genres when the feature is in the engine. */
  genreBonus?: Partial<Record<string, number>>;
  desc: string;
  /** Starts unlocked in a new 1980 game. */
  starter?: boolean;
}

export const RESEARCH: readonly ResearchDef[] = [
  // Graphics
  { id: 'gfx_2d_1', name: '2D Graphics I', branch: 'graphics', year: 1980, points: 0, cost: 0, requires: [], engineTech: 0.5, starter: true, desc: 'Blocky sprites and solid colours.' },
  { id: 'gfx_2d_2', name: '2D Graphics II', branch: 'graphics', year: 1982, points: 18, cost: 3_000, requires: ['gfx_2d_1'], engineTech: 0.5, desc: 'More colours, smoother animation.' },
  { id: 'gfx_sprites', name: 'Hardware Sprites', branch: 'graphics', year: 1985, points: 35, cost: 8_000, requires: ['gfx_2d_2'], engineTech: 0.6, genreBonus: { platformer: 0.04, action: 0.03 }, desc: 'Dozens of moving objects without flicker.' },
  { id: 'gfx_parallax', name: 'Parallax Scrolling', branch: 'graphics', year: 1988, points: 55, cost: 14_000, requires: ['gfx_sprites'], engineTech: 0.6, genreBonus: { platformer: 0.05, shooter: 0.03 }, desc: 'Layered backgrounds that give depth.' },
  { id: 'gfx_2_5d', name: 'Pseudo-3D', branch: 'graphics', year: 1991, points: 80, cost: 22_000, requires: ['gfx_parallax'], engineTech: 0.7, genreBonus: { racing: 0.05, shooter: 0.04 }, desc: 'Mode-7 style rotation and raycasting.' },
  { id: 'gfx_3d_1', name: '3D Graphics I', branch: 'graphics', year: 1993, points: 130, cost: 40_000, requires: ['gfx_2_5d'], engineTech: 1, desc: 'Polygons! Flat-shaded worlds you can move through.' },
  { id: 'gfx_3d_2', name: 'Textured 3D', branch: 'graphics', year: 1995, points: 170, cost: 55_000, requires: ['gfx_3d_1'], engineTech: 1, desc: 'Texture mapping and 3D cameras.' },
  { id: 'gfx_mocap', name: 'Motion Capture', branch: 'graphics', year: 1997, points: 160, cost: 60_000, requires: ['gfx_3d_2'], engineTech: 0.3, desc: 'Unlocks the Mo-Cap Stage. Lifelike animation.' },
  { id: 'gfx_shaders', name: 'Programmable Shaders', branch: 'graphics', year: 2001, points: 230, cost: 80_000, requires: ['gfx_3d_2'], engineTech: 1, desc: 'Per-pixel lighting and effects.' },
  { id: 'gfx_hd', name: 'HD Rendering', branch: 'graphics', year: 2005, points: 300, cost: 110_000, requires: ['gfx_shaders'], engineTech: 1, desc: '720p and beyond, normal maps everywhere.' },
  { id: 'gfx_pbr', name: 'Physically Based Rendering', branch: 'graphics', year: 2012, points: 380, cost: 150_000, requires: ['gfx_hd'], engineTech: 1, desc: 'Materials that react to light like the real thing.' },
  { id: 'gfx_raytracing', name: 'Ray Tracing', branch: 'graphics', year: 2018, points: 460, cost: 200_000, requires: ['gfx_pbr'], engineTech: 1, desc: 'Real-time reflections and global illumination.' },
  { id: 'gfx_upscaling', name: 'AI Upscaling', branch: 'graphics', year: 2020, points: 380, cost: 160_000, requires: ['gfx_raytracing'], engineTech: 0.6, desc: 'Render low, display high.' },
  // Audio
  { id: 'audio_beeps', name: 'Beeps & Bloops', branch: 'audio', year: 1980, points: 0, cost: 0, requires: [], engineTech: 0.2, starter: true, desc: 'Square waves and noise.' },
  { id: 'audio_chiptune', name: 'Chiptune Music', branch: 'audio', year: 1982, points: 16, cost: 2_500, requires: ['audio_beeps'], engineTech: 0.3, desc: 'Multi-channel melodies.' },
  { id: 'audio_sampled', name: 'Sampled Audio', branch: 'audio', year: 1987, points: 45, cost: 12_000, requires: ['audio_chiptune'], engineTech: 0.4, desc: 'Real instruments and voices. Unlocks the Sound Booth and Rhythm games.' },
  { id: 'audio_cd', name: 'CD Audio', branch: 'audio', year: 1991, points: 70, cost: 20_000, requires: ['audio_sampled'], engineTech: 0.4, desc: 'Orchestral soundtracks streamed from disc.' },
  { id: 'audio_surround', name: 'Surround Sound', branch: 'audio', year: 1999, points: 140, cost: 45_000, requires: ['audio_cd'], engineTech: 0.4, desc: '5.1 positional audio.' },
  { id: 'audio_dynamic', name: 'Dynamic Music', branch: 'audio', year: 2006, points: 200, cost: 70_000, requires: ['audio_surround'], engineTech: 0.4, desc: 'Scores that react to gameplay.' },
  { id: 'audio_spatial', name: 'Spatial Audio', branch: 'audio', year: 2016, points: 280, cost: 95_000, requires: ['audio_dynamic'], engineTech: 0.4, desc: 'Object-based 3D sound.' },
  // Systems
  { id: 'sys_save', name: 'Save Games', branch: 'systems', year: 1983, points: 22, cost: 4_000, requires: [], engineTech: 0.3, genreBonus: { rpg: 0.06, adventure: 0.05 }, desc: 'Progress that survives power-off.' },
  { id: 'sys_dialogue', name: 'Dialogue Trees', branch: 'systems', year: 1985, points: 40, cost: 9_000, requires: ['sys_save'], engineTech: 0.2, genreBonus: { rpg: 0.05, adventure: 0.06 }, desc: 'Branching conversations.' },
  { id: 'sys_ai_basic', name: 'Pathfinding AI', branch: 'systems', year: 1989, points: 60, cost: 15_000, requires: [], engineTech: 0.4, genreBonus: { strategy: 0.06, simulation: 0.04 }, desc: 'Units that find their way.' },
  { id: 'sys_physics', name: 'Physics Engine', branch: 'systems', year: 1997, points: 150, cost: 50_000, requires: ['gfx_3d_1'], engineTech: 0.6, genreBonus: { racing: 0.06, sandbox: 0.05 }, desc: 'Rigid bodies, ragdolls, things that fall over.' },
  { id: 'sys_ai_adv', name: 'Advanced AI', branch: 'systems', year: 2000, points: 190, cost: 65_000, requires: ['sys_ai_basic'], engineTech: 0.5, genreBonus: { shooter: 0.04, strategy: 0.05, sports: 0.05 }, desc: 'Squad tactics and believable opponents.' },
  { id: 'sys_procgen', name: 'Procedural Generation', branch: 'systems', year: 2004, points: 220, cost: 70_000, requires: ['sys_ai_basic'], engineTech: 0.4, genreBonus: { sandbox: 0.08, rpg: 0.03 }, desc: 'Infinite worlds from a seed. Unlocks Sandbox games.' },
  { id: 'sys_open_world', name: 'Open World Streaming', branch: 'systems', year: 2004, points: 280, cost: 100_000, requires: ['gfx_3d_2', 'sys_physics'], engineTech: 0.6, genreBonus: { action: 0.06, rpg: 0.06, sandbox: 0.05 }, desc: 'Seamless huge worlds.' },
  // Online
  { id: 'online_modem', name: 'Modem Multiplayer', branch: 'online', year: 1992, points: 70, cost: 18_000, requires: [], engineTech: 0.3, genreBonus: { shooter: 0.04, strategy: 0.04 }, desc: 'Head-to-head over phone lines.' },
  { id: 'online_basic', name: 'Internet Play', branch: 'online', year: 1996, points: 130, cost: 40_000, requires: ['online_modem'], engineTech: 0.5, genreBonus: { shooter: 0.05, strategy: 0.04 }, desc: 'Online servers. Unlocks Server Racks.' },
  { id: 'online_mmo', name: 'Massively Multiplayer', branch: 'online', year: 1997, points: 220, cost: 90_000, requires: ['online_basic'], engineTech: 0.5, desc: 'Thousands in one world. Unlocks MMO games and subscriptions.' },
  { id: 'online_matchmaking', name: 'Matchmaking', branch: 'online', year: 2003, points: 180, cost: 60_000, requires: ['online_basic'], engineTech: 0.4, genreBonus: { shooter: 0.05, fighting: 0.04, sports: 0.03 }, desc: 'Fair, fast online matches.' },
  { id: 'online_liveops', name: 'Live Ops', branch: 'online', year: 2011, points: 260, cost: 90_000, requires: ['online_matchmaking'], engineTech: 0.4, desc: 'Seasons, events and telemetry. Live-service games earn more.' },
  { id: 'online_cloud', name: 'Cloud Gaming', branch: 'online', year: 2018, points: 300, cost: 120_000, requires: ['online_liveops'], engineTech: 0.3, desc: 'Stream games to any screen.' },
  { id: 'online_crossplay', name: 'Cross-Play', branch: 'online', year: 2018, points: 240, cost: 80_000, requires: ['online_matchmaking'], engineTech: 0.3, desc: 'Everyone plays together. +sales on multi-platform online games.' },
  // Platforms
  { id: 'platform_motion', name: 'Motion Controls', branch: 'platforms', year: 2006, points: 150, cost: 50_000, requires: [], engineTech: 0.3, genreBonus: { casual: 0.06, sports: 0.05, rhythm: 0.05 }, desc: 'Wave your arms; sell millions.' },
  { id: 'platform_touch', name: 'Touch Interfaces', branch: 'platforms', year: 2007, points: 120, cost: 30_000, requires: [], engineTech: 0.3, genreBonus: { puzzle: 0.06, casual: 0.06 }, desc: 'Unlocks iOS and Android development.' },
  { id: 'platform_vr', name: 'Virtual Reality', branch: 'platforms', year: 2014, points: 320, cost: 130_000, requires: ['gfx_hd'], engineTech: 0.5, desc: 'Unlocks VR platforms.' },
  // Business
  { id: 'biz_self_publishing', name: 'Self-Publishing', branch: 'business', year: 1981, points: 25, cost: 10_000, requires: [], desc: 'Publish your own games. Keep the revenue, carry the risk.' },
  { id: 'biz_qa_lab', name: 'QA Lab', branch: 'business', year: 1984, points: 30, cost: 8_000, requires: [], desc: 'Unlocks QA Lab stations.' },
  { id: 'biz_rnd_lab', name: 'R&D Lab', branch: 'business', year: 1985, points: 40, cost: 12_000, requires: [], desc: 'Unlocks R&D benches for faster research.' },
  { id: 'biz_training', name: 'Training Programme', branch: 'business', year: 1985, points: 30, cost: 9_000, requires: [], desc: 'Unlocks staff training courses.' },
  { id: 'biz_marketing_dept', name: 'Marketing Department', branch: 'business', year: 1988, points: 45, cost: 15_000, requires: ['biz_self_publishing'], desc: 'Unlocks the Marketing War Room and TV campaigns.' },
  { id: 'biz_headhunters', name: 'Headhunters', branch: 'business', year: 1990, points: 50, cost: 20_000, requires: [], desc: 'Better candidates in the hiring pool.' },
  { id: 'biz_ergonomics', name: 'Ergonomic Office', branch: 'business', year: 1993, points: 60, cost: 25_000, requires: [], desc: 'Unlocks Studio Desks (+12% productivity cap).' },
  { id: 'biz_engine_licensing', name: 'Engine Licensing', branch: 'business', year: 1995, points: 90, cost: 40_000, requires: ['gfx_3d_1'], desc: 'License your engines to other studios for monthly income.' },
  { id: 'biz_digital_store', name: 'Digital Distribution', branch: 'business', year: 2003, points: 120, cost: 50_000, requires: ['online_basic'], desc: 'Sell direct on digital stores: no manufacturing, longer tails.' },
  { id: 'biz_workstations', name: 'Dev Workstations', branch: 'business', year: 2005, points: 140, cost: 60_000, requires: ['biz_ergonomics'], desc: 'Unlocks Dev Workstations (+25% productivity cap).' },
  { id: 'biz_esports', name: 'Esports', branch: 'business', year: 2009, points: 160, cost: 70_000, requires: ['online_matchmaking'], desc: 'Unlocks the Esports topic and tournament sponsorships.' },
  { id: 'biz_community', name: 'Community Management', branch: 'business', year: 2009, points: 120, cost: 40_000, requires: [], desc: 'Fans convert better; backlash is softer.' },
  { id: 'biz_hardware_lab', name: 'Hardware Lab', branch: 'business', year: 1985, points: 150, cost: 90_000, requires: ['biz_rnd_lab', 'biz_self_publishing'], desc: 'Design and sell your own console or handheld (Research → Hardware).' },
  { id: 'biz_merch', name: 'Merchandising', branch: 'business', year: 1988, points: 70, cost: 25_000, requires: [], desc: 'Franchises earn monthly merch income.' },
  // AI
  { id: 'ai_ml_tools', name: 'ML Tooling', branch: 'ai', year: 2016, points: 260, cost: 100_000, requires: ['sys_ai_adv'], engineTech: 0.3, desc: 'Machine-learned animation and testing. +10% QA.' },
  { id: 'ai_genai', name: 'Generative AI Assist', branch: 'ai', year: 2023, points: 320, cost: 140_000, requires: ['ai_ml_tools'], engineTech: 0.4, desc: '+12% productivity. Some players and staff object.' },
];

export const RESEARCH_BY_ID: Record<string, ResearchDef> = Object.fromEntries(RESEARCH.map((r) => [r.id, r]));
