# Build Plan

Each phase ends with these steps:
1. `npm run typecheck && npm run lint && npm test`
2. Run the game in a browser and check the phase's features by hand.
3. Fix anything that's broken.
4. Commit with a descriptive message.

Nothing ships with placeholder systems or dead buttons. If something gets cut, it is removed cleanly and reported.

## Phase 0: Scaffold
- **Project setup:** Vite + React + TS (strict), Tailwind, Zustand, PixiJS, Vitest, ESLint/Prettier.
- **Folder layout:** `src/sim`, `src/data`, `src/render`, `src/ui`, `src/services`, `scripts`, and `tests`.
- **Repo hygiene:** `git init`, `.gitignore` (including `.env`), `.env.example` with `VITE_FIREBASE_*`, and the MIT `LICENSE`.
- **Import guard:** an ESLint boundary rule so `src/sim` can't import React/DOM/Pixi/Firebase.
- **Art direction:** write `docs/ART.md` (palette tokens, shape language, lighting, sprite grid, avatar system, cover-art system).

## Phase 1: Simulation core (headless)
- **Engine basics:** seeded RNG, calendar/tick scheduler, `GameState`, the actions/`dispatch` API, and `Breakdown` explainability types.
- **Data:** `platforms.ts` (full roster + install-base curves), `genres.ts`, `topics.ts`, the historical part of `events.ts`, and `balance.ts`.
- **Systems:**
  - dev pipeline (concept → 3 phases → bugs → release);
  - quality model;
  - critic outlets, reviews, and blurb grammar;
  - sales model and revenue split;
  - finance ledger and loans;
  - basic staff (hire, fire, assign, morale/energy);
  - contract work;
  - bankruptcy.
- **Tests:** unit tests per system, a determinism test, and **bot playthrough v1** (Idle, Steady, Random) over 40+ years with the invariants.

## Phase 2: Simulation depth
- **Staff:** traits, specialisations, burnout, training, loyalty, poaching, and a hiring pool scaled by reputation.
- **Office:** office tiers and grid, facilities, and layout metrics (BFS distances, crowding, auras, synergy, noise).
- **Tech:** research tree, custom engines, engine licensing in and out.
- **Market:** rival AI, flagship franchises on real dates, procedural rival releases, trends, and the release-window competition model.
- **Fans:** franchise fans and fatigue; user score; awards.
- **Business:**
  - publisher deals and self-publishing;
  - marketing channels and trade shows;
  - platform dev kits and royalties;
  - IPO, stock price, and the board;
  - acquisitions, subsidiaries, buyout offers, and hostile takeovers.
- **Events, news, and goals:** random/choice events, the news feed, achievements, milestones, the Hall of Fame record, and endless mode (procedural future platforms).
- **Tests:**
  - bot playthrough v2 with all 6 strategies, 40+ years, multiple seeds;
  - a test for each edge in the dependency table;
  - `npm run balance` report, followed by a first tuning pass.

## Phase 3: Art system (no AI images)
- **Office sprites:** an SVG sprite library for floors, walls, ~40 furniture/facility items, and staff bodies in four facings with walk, type, and idle frames.
- **Atlas build:** `scripts/build-atlas.ts` rasterises the SVGs to WebP sprite atlases plus JSON frame data, at 1× and 2×.
- **Procedural art:** the layered staff avatar generator, the game cover-art generator, rival monogram badges, and the event vignette set.
- **UI icons:** a hand-built SVG icon set.

## Phase 4: Office renderer
- **Scene:** Pixi app, camera pan/zoom (mouse, keys, touch), floors, depth sorting, and a baked static layer.
- **Staff:** A* walking that mirrors the sim's activities (work, break, meeting, chat, burnout), plus state-driven animation and tint.
- **Build mode:** placement, rotation, move, and sell, with validity checks and heat-map overlays.
- **Feedback and look:** number pops and particles, the day/night tint, and a 200-staff stress test held at 60 fps.

## Phase 5: Game UI
- **Shell:** HUD, speed controls, keyboard shortcuts, the panel system, and the toasts/notification centre.
- **Panels:** new-game wizard, dev panel (phase gates, sliders, crunch/delay/cut, announce), staff, research tree, market (charts, trends, competitors), finance (P&L, cash flow, loans, stock), company (publishing, IPO, M&A), news, and goals/achievements.
- **Moments:** review reveal and the sales chart per game.
- **Help:** "Why" tooltips driven by `Breakdown`, and the interactive first-game tutorial.
- **Settings:** theme, reduced motion, sound (WebAudio synth SFX + mute), UI scale, and autopause flags.
- **Quality bar:** accessibility (focus, ARIA, contrast) and tablet layout.

## Phase 6: Accounts & saves
- **Firebase setup:** a new project under the Firebase account, with Auth (email/password, Google, reset) and a Firestore database.
- **Screens:** landing page, auth screens, and the save-slot picker (create/rename/delete, 5 slots).
- **Saving:** save serialisation, compression, chunking, schema versioning and migrations, monthly autosave to IndexedDB, throttled cloud sync, save on tab hide/close, offline mode, and conflict resolution.
- **Security:** `firestore.rules`, with rules tests run in the emulator if Java is present.

## Phase 7: Polish & balance
- **Playtests:** full playthroughs in the browser at each speed, tuning pacing and difficulty with the balance report.
- **Performance:** profiling for bundle size, frame time, and memory over long sessions.
- **Quality pass:** an accessibility audit, copy review, and an edge-case hunt (bankruptcy flow, takeover, endless mode, migration from old saves).

## Phase 8: Ship
- **GitHub:** `gh repo create studio-empire --public`, then the README (screenshots, features, stack, setup) and push.
- **Cloudflare Pages:** create the project, set the `VITE_FIREBASE_*` env vars, build, then `wrangler pages deploy dist`.
- **Firebase:** add the `*.pages.dev` domain to Firebase Auth authorized domains, then deploy Firestore rules (`firebase deploy --only firestore:rules`).
- **Live check:** run sign-up → new game → release a game → save → reload → load on the live URL, and fix any issues.
- **Report:** the repo URL, live URL, and known limitations.
