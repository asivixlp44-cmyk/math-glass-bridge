# Math Glass Bridge

A Bloxity game built with Three.js and Colyseus. It is a clone of the Roblox game
"[Math Glass Bridge](https://www.roblox.com/games/106251887264209/Math-Glass-Bridge)" (reference video: `reference/Gameplay.mp4`).
It shares its engine with the other Legion games (server, Bloxity login and avatars, profiles, pets, effects).

## How it plays

- **A journey of 40 stages through space, in 4 worlds** of 10: **Space Station** (stages 1-10), **Candy Land** (11-20),
  **Ice Kingdom** (21-30) and **Lava Core** (31-40). Each world has its own glass colours, sky, fog, floating props and space dust.
  Stages get longer (8 rows on Stage 1, so the first clear takes under a minute, up to 29 on the last boss) and get more panes per row
  (2, then 3, 4 and 5). 668 questions in all, about an hour for a good player.
  The ramp is long and gentle on purpose: quick easy wins first, the hard math and the combined modifiers in Worlds 3 and 4.
  6 more world themes are ready (Jungle Temple, Deep Ocean, Desert Pyramids, Cyber City, Rainbow Galaxy, Golden Heaven):
  add worlds in `WORLD_IDS` in `shared/config.js` (and give the new stages modifiers in `STAGE_MODS`).
- **Every row is a math question.** It floats beside the row and sits in the banner at the top of the screen ("7 + 1 = ?").
  Each glass pane shows a number. Step on the right one: it lights up green, chimes and pays Cash.
  Step on the wrong one: the glass **shatters** and you fall into the void. No jumping on the glass.
- **Checkpoint islands** between the stages. Reaching one clears the stage (Cash chest + Wins) and saves your progress.
  Falling sends you back to the start of the stage you are on, never to the lobby. The lobby's **Continue** portal (and the
  "▶ Stage N" button under your Cash) take you straight back to your checkpoint; the Teleport panel lists every stage you have reached.
- **The math gets harder step by step** (a new level every 4 stages, the hardest from Stage 37), and the wrong numbers sit close
  to the answer: adding to 10; bigger sums and "biggest / smallest number"; times tables and missing numbers;
  division and "pick the EVEN number"; big sums and x12 tables; squares, percentages and two-step sums; order of operations and fractions;
  negatives, powers and roots; equations and big multiplication; then everything at the hardest. The wrong panes are the classic mistakes.
  Every run gets a fresh seed from the server, and no question repeats inside a run (`shared/questions.js`).
- **Stage modifiers** (`STAGE_MODS` in `shared/config.js`): World 1 brings them in one at a time between plain stages,
  combos start at the Stage 20 boss and fill Worlds 3 and 4:
  **Lights Out** (the glass only lights up right in front of you), **Crumbling Glass** (every pane breaks 2.4 s after you step on it
  in World 1, down to 1.6 s in World 4), **Shuffle** (the numbers swap panes every 2.6 s, down to 1.8 s), **Ghost Glass** (numbers only
  show in flashes) and **Time Limit** (15 s per row on Stage 6, down to 9 s by Stage 40, or the glass under you breaks).
  Every 10th stage is a longer **boss stage**; the last one is Lights Out + Shuffle + Time Limit with 5 panes.
- **Revive**: when you fall, a "Revive" button and a draining bar come up (like the reference). The first revive on every stage is FREE;
  after that a revive uses a Revive token (from Free! gifts and quests) or costs Bux (free with the **Infinite Revives** pass).
  Otherwise the stage starts over with new questions. Revive puts you back on the row before.
- **Rebirth** on the Golden Throne after Stage 40: back to Stage 1 with a permanent +50% Cash per rebirth (keeps everything else).
- **Cash per right answer** grows 25% per stage (15 on Stage 1, about 1K on Stage 20 and 90K on Stage 40), times your multipliers, plus a streak bonus
  (+5% per right answer in a row, up to +100%). Each stage's chest pays 4x its rows' Cash (12x on boss stages), plus 1 Win (5 on boss stages).
- **Top progress bar**: the 10 stages of the world you are in, with every player in that world on it.
- **Kill All / Show Path / Skip Stage** (Bux, top of the screen, like the reference):
  Kill All shatters the glass under every other player on a stage, Show Path turns the right panes gold (and the wrong ones dark),
  Skip Stage takes you straight to the next checkpoint.
- **Gears** in the hotbar (1-3): a free **Calculator** (a working pocket calculator, keyboard too), a **Speed Coil** ($12K, +35% speed)
  and a **Gravity Coil** ($30K, moon jumps, not on the glass).
- **Crates and pets**: Basic ($2.5K), Galaxy ($40K), Genius ($400K) and Mythic (Bux) crates at the CRATES stall. Eleven school-supply
  pets (Pencil Pup ... Infinity Kitty, plus the limited Golden Genius) follow you and multiply Cash. 3 slots (4 with VIP).
- **Trails** (x1.1 to x2.5 Cash), the **Lucky Wheel** (a free spin every 10 minutes of playtime, extra spins for Bux),
  the **Space Chest** (every 15 min) and the **Rainbow Stairs** parkour with a chest on top (every 10 min).
- **MATH RUSH**: the last 5 minutes of every 30 (server clock) are x2 Cash for everyone (a pill on the HUD counts down).
- **Friend Boost**: +10% Cash per Bloxity friend in your server (up to +50%).
- Free! gifts for playtime (1, 3, 5, 8, 11 minutes ... with big ones at 15, 30 and 60: Galaxy, Genius and Mythic crates; the HUD
  button counts down to the next one and pulses when one is ready), 7-day Daily Rewards, a quest chain (the first three are the tutorial, with guide arrows to Stage 1),
  redeem codes (`RELEASE`, `MATH`, `GLASS`, `BRIDGE`, `LEGION`, `BLOXITY`) and three leaderboards (Top Stage, Top Wins, Top Cash).
- Passes: **2x Cash**, **2x Speed**, **VIP** (x1.5 Cash, gold name, +1 pet slot), **Infinite Revives**, **Rainbow Trail**.

## Look and feel

- Deep space: a nebula sky tinted per world, twinkling stars, a ringed gas giant, a moon, spiral galaxies, drifting asteroids,
  shooting stars and a glow in the abyss under the glass. The lobby and every island float on rocks with glowing crystals underneath.
- The glass is a custom shader: tinted body, fresnel edges, a sheen that sweeps across, a soft neon rim, the pane's number from a canvas
  atlas, and the modifier effects (Lights Out, Ghost flashes, crumbling cracks). All panes of a stage are one instanced mesh (one draw call).
- Glow is kept gentle (low bloom, exposure and neon strength) so long play sessions are easy on the eyes.
- Performance: the nebula is baked once per world into a cube map (not computed every frame); collision and triggers live in a z index so
  only nearby objects are checked; only the stages around you exist on the GPU (built one per frame ahead of you, thrown away behind you);
  and the quality steps down by itself if the frame rate stays low (unless you picked one in Settings).
- Bloom, a vignette/saturation grade, soft shadows, a blob shadow that grounds you on the glass, shard explosions when the glass breaks,
  a red edge glow and camera shake while you fall, and the camera stays up by the bridge to watch you drop.
- Procedural music (122 BPM space synth-pop) and sound: glass footsteps, a chime that climbs the scale with your streak, the crack and
  tinkle of breaking glass, a falling whistle, the revive shimmer and the chest fanfare. No asset files.

## Run it

Double-click `start-local.bat`, or:

```bash
npm install        # also installs client/ and server/
npm run build      # builds the client into client/dist
npm start          # server + built client on http://localhost:2621 (PORT to change)
```

For development, run the server and the Vite client side by side:

```bash
npm run dev:server     # http://localhost:2621
npm run dev:client     # http://localhost:5197 (talks to the server on :2621, VITE_SERVER_URL overrides it)
```

The dev build exposes `window.__qa` (player, state, teleport, question) for automated play-tests.

## Deploy (Bloxity hosting)

Every push to `main` (prod) or `dev` runs `.github/workflows/deploy.yml`:

1. Builds the server image from `server/Dockerfile` and pushes it to `ghcr.io/asivixlp44-cmyk/math-glass-bridge-server`.
2. Tells Legion (`legion.bloxity.io/v1/apps/math-glass-bridge/deploy`) to roll it out (seat cap 24, up to 5 replicas).
3. Builds the client with `VITE_BLOXITY_GAME_ID` and uploads it to the Bloxity hosting API.

Play at https://math-glass-bridge.play.bloxity.io (prod) or https://math-glass-bridge.dev.play.bloxity.io (dev).

One-time setup:

- Create the app `math-glass-bridge` on hosting.bloxity.io (Legion has no create-on-deploy).
- Repo secret: `LEGION_DEPLOY_TOKEN` (from hosting.bloxity.io).
- After the first run, make the GHCR package public so Legion can pull it.
- On Legion, `MONGODB_URI` is provided: player profiles live in MongoDB and are shared by every pod.
  Without it (local dev) they are kept in `server/data/profiles.json`.

## Controls

| Action | Keyboard / mouse | Controller |
|---|---|---|
| Walk | WASD / arrows | Left stick |
| Jump (not on the glass) | Space | A |
| Camera | Drag, wheel to zoom | Right stick, D-pad up/down to zoom |
| Interact (crates, shops, chests) | E | X |
| Gears | 1 / 2 / 3 (calculator: type numbers, Enter, Esc to put away) | |
| Revive | R / Enter or the button | A (B: back to the lobby) |
| Shop / Pets / Gears / Teleport / Settings | HUD buttons | Y / LB / RB / Back / Start |

Phones get an on-screen joystick and a jump button.

## Layout

- `shared/config.js`: game data used by both sides (worlds, the stages and their geometry, modifiers, economy, pets, crates, trails, gears, wheel, store, quests,
  daily, gifts, codes). `shared/questions.js`: the deterministic question generator (same questions on client and server from a seed).
- `server/src/BridgeRoom.js`: the room. It owns the run seed, checks every step, pays Cash and Wins, revives, Kill All / Show Path / Skip,
  crates, pets, gears, the wheel, chests, codes and purchases.
- `client/src/main.js`: player, physics, judging the pane under your feet, falling and reviving, networking, other players, camera.
- `client/src/stages.js`: the stages (collision for all of them, streamed visuals, glass shader, atlases, modifiers, shards, islands, props).
- `client/src/world.js`: the plaza, stalls, crates, Lucky Wheel, Rainbow Stairs, Space Chest, leaderboards, logo.
- `client/src/sky.js`: the space backdrop. `client/src/fx.js`: bloom, grade, particles, fireworks.
- `client/src/ui.js` and `client/index.html`: the HUD (progress bar, question banner, revive, calculator, hotbar) and the panels.

## Multiplayer and anti-cheat

- Movement is client-side; the client sends its position about 15 times a second.
- The server picks each run's seed and keeps the answers. A step only counts for the next unanswered row, while the player is over
  that pane, at most one every 0.12 s. Clearing a stage needs every row answered (or a Skip Stage) and the player on the next island; Shuffle steps are judged at the time the client stepped (within 1.5 s).
- Crates check the player is at the stall, chests check the spot (and the height for the Rainbow Stairs), prices are checked on the server.

## Bloxity

- Login, avatars, friends, settings, Bux purchases and stats (Wins, Right Answers, Cash Earned).
- Game slug: `math-glass-bridge` (`client/src/bloxity.js`).
- Create the Bux SKUs from `SKUS` in `shared/config.js` in the game's IAP catalog.
- Set `LEGION_WEBHOOK_SECRET` on the host to turn on Bux mode (without it, purchases are granted free for testing).

UI rules: the top-left corner stays empty for the Bloxity overlay, prices are in Bux only, and there is no start menu.
