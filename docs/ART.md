# Art Direction — "Soft Diorama"

All art is **hand-built vector (SVG) or procedurally generated in code**. **No AI-generated images**, no real logos, no likenesses of real people, no trademarked characters.

## 1. Look and feel

The office should feel like a tidy tabletop diorama seen from slightly above. It is warm, calm and readable, with small details that reward zooming in.

- **Projection:** top-down with a ¾ tilt. Front faces of furniture are visible (about 35% of the top face's height). The grid is square, not isometric diamonds, so it is easy to build on.
- **Lighting:** a soft key light from the top-left.
  - Every object has a darker front face and a contact shadow: a blurred ellipse at 18% opacity.
  - Ambient tint follows in-game time: warm daylight → golden hour → cool blue night with lit monitors.
- **Shapes:** rounded rectangles (corner radius 15–25% of the short side), no hard 1px outlines, chunky silhouettes.
  - Things should read at 24px per tile.
  - Detail appears at 64px+, e.g. monitors show code lines and posters show shapes.
- **Motion:** gentle and purposeful.
  - Staff walk at about 2.2 tiles/s, with a 2-frame bob and arms that swing.
  - Typing pulses at 6 Hz when productive and 3 Hz when tired.
  - Particles are rare: only sales coins, confetti for hits, and steam from coffee.
  - All motion respects reduced-motion settings.

## 2. Palette

The palette is restrained: warm neutrals, plus one accent per room function.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--floor-wood` | `#E9D8BF` | `#3B3128` | Garage/office floor |
| `--floor-carpet` | `#D7DCE4` | `#2C3340` | Studio floors |
| `--wall` | `#F5EFE6` | `#232028` | Walls |
| `--wall-trim` | `#CBB89C` | `#4A4036` | Wall caps |
| `--wood` | `#B98957` | `#8A6440` | Desks, shelves |
| `--metal` | `#9AA4B2` | `#6D7685` | Racks, machines |
| `--plant` | `#5FA36A` | `#4E8A58` | Greenery |
| `--accent-design` | `#E07A5F` | `#F08A6F` | Design/creative |
| `--accent-tech` | `#3D85C6` | `#5AA0E0` | Programming/servers |
| `--accent-art` | `#9B6BD3` | `#B28AE6` | Art/mocap |
| `--accent-audio` | `#2EB5A8` | `#3CCFC0` | Audio booth |
| `--accent-biz` | `#E3B23C` | `#F2C450` | Money, marketing, trophies |
| `--ink` | `#2A2622` | `#F1EDE6` | Text |
| `--good` / `--bad` | `#2E9E5B` / `#D1495B` | `#46C07A` / `#F06478` | Deltas |

Charts use a colour-blind-safe categorical palette defined in `src/ui/theme.ts`, with distinct lightness steps.

## 3. Office sprites

- Each sprite is generated at runtime by `src/render/sprites.ts`, which draws on the canvas with the same shape language. Sprites are drawn once per zoom bucket into a texture atlas, so the result is crisp at every zoom with no image downloads.
- Every item has a top face, a front face, a contact shadow, and an optional emissive layer (monitor glow, neon), which brightens at night.
- **Desks:** each tier adds detail.
  - Folding desk: a beige CRT.
  - Office desk: one monitor and a chair.
  - Studio desk: dual monitors.
  - Workstation: an ultrawide monitor plus RGB.
  - Monitor style follows the in-game era: CRT before 2003, then LCD.

## 4. Staff

- **Body:** a chunky, friendly figure with a head-to-body ratio of about 1:1.6, viewed top-down/¾.
  - Variable parts: skin tone, hair style and colour, top colour (tinted by role), and accessories (glasses, headphones, cap, beanie, hijab, beard).
  - The founder wears the company colour.
- **States are readable at a glance:**

  | State | Visual |
  |---|---|
  | Working | Seated, typing |
  | Crunch | Faster typing, sweat-drop particle, slight red tint |
  | Burnout | Head on desk, desaturated, little grey cloud |
  | Break | Walks to the energy station, then a steam puff |
  | Chat | Speech bubble with a random glyph (♪ ! ? ☕ 💡) |
  | Sick | Desk empty, sticky note on the monitor |
  | Training / research | Book or flask icon above the head |
  | Happy (morale > 80) | Occasional hop |

## 5. Portraits (procedural)

- `src/ui/avatar/Avatar.tsx` builds a layered SVG from a seed: background blob, shoulders/top, neck, face shape (5), skin tone (8), eyes (6), brows (5), mouth (6, chosen by mood), hair (14 styles × colours), facial hair, accessories.
- Expression follows morale: smile, neutral or frown.
- **Legendary real people never get a face.** They get an **initials badge**: monogram, gold ring, star.

## 6. Covers, badges and illustrations

- **Game covers (`Cover.tsx`):**
  - A genre layout template: diagonal action slash, framed RPG, top-down strategy grid, and so on.
  - A topic motif from the icon library: dragon wing, rocket, skull, car, crown and others.
  - A palette from the genre × topic hash, plus the generated title set in a display font.
- **Company badges:** a rounded-square monogram with the brand-adjacent colour from `companies.ts` and an inner ring. **Never a logo.**
- **Event cards:** vignettes composed from the icon library (`art` key on each event).
- **Landing hero:** the real Pixi office scene, running a scripted demo.

## 7. Typography & UI chrome

- **Display:** "Space Grotesk" (titles, numbers).
- **Text:** "Inter".
- **Numbers:** `font-variant-numeric: tabular-nums`.
- **Chrome:** glassy panels (backdrop blur, 8% tint) over the office canvas, 14px radius, soft shadow, 1px inner highlight.
- **Accessibility:** AA contrast in both themes and visible focus rings (2px accent + 2px offset).

## 8. Icons

The icon set is hand-built at 24×24 with a 1.75 stroke and round caps, defined as path data in `src/ui/icons.tsx`. There are no icon fonts.
