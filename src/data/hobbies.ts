/**
 * Hobbies: everyone has a life outside work. Stable per person (derived from their id, so no save data),
 * cosmetic: a hobby colours what someone talks about, which break spots they gravitate to, and the odd office
 * moment (Friday cookies from the baker, a gardener fussing over the plants).
 */
export interface Hobby {
  id: string;
  name: string;
  emoji: string;
  /** Office items this person likes to spend breaks at. */
  likes: string[];
  /** Openers about it, with a reply. */
  chat: [string, string][];
}

export const HOBBIES: Hobby[] = [
  { id: 'baking', name: 'Baking', emoji: '🍰', likes: ['lounge_sofa', 'bean_bag'], chat: [['Baked banana bread!', 'Save me a slice!'], ['My sourdough rose!', 'Finally!'], ['Cookies on Friday?', 'Yes please! 🍪']] },
  { id: 'running', name: 'Running', emoji: '🏃', likes: ['gym', 'ping_pong'], chat: [['Ran 10k this morning.', 'Before work?!'], ['Marathon in May!', 'You’re mad. Good luck!'], ['New running shoes.', 'Fancy!']] },
  { id: 'music', name: 'Music', emoji: '🎸', likes: ['guitar_corner', 'karaoke'], chat: [['Band practice tonight.', 'Gig soon?'], ['Learning a new song.', 'Play it later!'], ['Our band has a name now.', 'Is it a pun?']] },
  { id: 'gaming', name: 'Retro gaming', emoji: '🕹️', likes: ['arcade_cabinet', 'pinball', 'claw_machine', 'game_library', 'console_museum', 'screening_room'], chat: [['Beat the final boss at 3am.', 'Worth it?'], ['Found a rare cartridge!', 'Jealous!'], ['Speedrun PB last night.', 'Nice time!']] },
  { id: 'reading', name: 'Reading', emoji: '📚', likes: ['bookshelf', 'hammock', 'lounge_sofa', 'zen_corner'], chat: [['Finished a great novel.', 'Lend it to me?'], ['Book club Thursday?', 'Haven’t finished it…'], ['Read any good sci-fi?', 'Always.']] },
  { id: 'gardening', name: 'Gardening', emoji: '🌱', likes: ['plant_large', 'bonsai'], chat: [['My tomatoes are huge!', 'Bring some in!'], ['Who’s watering the plants?', 'Not me…'], ['Planted a lemon tree.', 'Fancy!']] },
  { id: 'painting', name: 'Painting', emoji: '🎨', likes: ['fan_wall', 'aquarium'], chat: [['Painted all weekend.', 'Show me!'], ['Life drawing class tonight.', 'Brave!'], ['Watercolours are hard.', 'Looks great though.']] },
  { id: 'hiking', name: 'Hiking', emoji: '🥾', likes: ['globe', 'hammock'], chat: [['Climbed a mountain Sunday.', 'Legs okay?'], ['Camping this weekend.', 'Bring bug spray!'], ['Saw a deer on the trail.', 'So cool!']] },
  { id: 'cooking', name: 'Cooking', emoji: '🍜', likes: ['bean_bag', 'lounge_sofa'], chat: [['Made ramen from scratch.', 'Recipe please!'], ['Trying a new curry.', 'Bring leftovers!'], ['Knife skills class!', 'Careful 😅']] },
  { id: 'boardgames', name: 'Board games', emoji: '🎲', likes: ['foosball', 'ping_pong'], chat: [['Board game night Friday?', 'I’m in!'], ['I designed a card game.', 'Playtest?'], ['Lost at Catan again.', 'Classic.']] },
  { id: 'photography', name: 'Photography', emoji: '📷', likes: ['aquarium', 'globe', 'mascot_statue'], chat: [['Got a great sunset shot.', 'Frame it!'], ['New lens arrived!', 'Ooh.'], ['Photo walk Saturday?', 'Sure!']] },
  { id: 'singing', name: 'Singing', emoji: '🎤', likes: ['karaoke', 'guitar_corner'], chat: [['Choir concert tonight.', 'Break a leg!'], ['Karaoke after work?', 'Only if you go first.'], ['Hit the high note!', '🎶']] },
  { id: 'cycling', name: 'Cycling', emoji: '🚲', likes: ['gym', 'ping_pong'], chat: [['Biked in today.', 'In this weather?'], ['100 km on Saturday.', 'Wow.'], ['Flat tyre again.', 'Classic.']] },
  { id: 'pets', name: 'Animals', emoji: '🐾', likes: ['aquarium', 'lounge_sofa', 'parrot_perch'], chat: [['My dog learned a trick!', 'Video?!'], ['Fostering kittens.', 'Bring one in!'], ['Can I take the office cat home?', 'No!']] },
];

export const HOBBY_BY_ID: Record<string, Hobby> = Object.fromEntries(HOBBIES.map((h) => [h.id, h]));

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** This person's hobby (stable for a given id). */
export function hobbyOf(id: string): Hobby {
  return HOBBIES[hash(`hobby:${id}`) % HOBBIES.length]!;
}
