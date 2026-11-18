# Keres9 — TYPHON SHADOW

2D Newtonian space simulation game. Trade, Mine, Explore, Combat, Scavenge.

You fly the KITE, a small mining ship in debt to Keres Mutual. The belt below the gas giant TYPHON is full of things to do:
- Cellular rocks you can cut apart, and caves you can explore.
- Derelict hulls to breach and loot.
- Four stations with their own markets and production chains.
- Roughly two dozen NPC crews who mine, haul, fight, run, and call for help.
- Void Kings raiders.
- A sector director that keeps throwing new trouble at you.

## Run it

It's a static site with no build step. ES modules need a real HTTP origin, so serve the folder rather than opening it as a file:

```sh
python3 -m http.server 8080        # or: npx serve .
# open http://localhost:8080/          → title screen
# open http://localhost:8080/?demo     → straight into the AI pilot showcase
```

## Watch the AI pilot

Click **WATCH AI PILOT** on the title screen (or open `?demo`), and the computer plays the whole game without stopping. A caption panel explains each move as it happens. It shows:
- the current task;
- what the pilot is doing;
- live telemetry: burn mode, docking gates, laser DPS, suit air.

What the pilot does:
- **Flight:** braking-aware point-to-point burns with real flip-and-burn retro manoeuvres. It uses RCS for fine translation, plans detours around rocks, and looks ahead along its velocity to brake before terrain. Long hauls use time warp.
- **Docking:**
  - KERES ANCHOR clamp ports and landing pads with mag-gear;
  - SLAGWORKS, which spins: it tracks the moving port;
  - HUB SEVEN's rotating ring: it matches the ring's tangential velocity.
- **Mining:** it picks rocks by the ore it wants, sets a harpoon on the face and cuts a shaft. It then hover-cuts to widen the seam and scoops up the loose ore.
- **Scanning:** directional-array sweeps, resonance lock and drift tracking, then chasing what it found.
- **Caves and derelicts:**
  - harpoons next to a cave mouth or a breach point and sets cutting charges;
  - goes out on EVA with a jetpack, following path-finding through the tunnels;
  - pings the hand scanner and hauls loot back to the ship.
- **Combat:** lead-pursuit dogfights with strafing. It holds fire when a friendly is in the line of fire, picks up escape pods afterwards, and breaks off when the hull or fuel runs low.
- **Economy:**
  - sells cargo where it pays best (never back where it bought);
  - trades price spreads between stations, at most once every 4 minutes;
  - signs contracts and goes after bounty targets;
  - buys rounds at the bar to hear rumours;
  - refuels, repairs, buys upgrades and pays down the ledger.
- **Story:** it advances the shift storyline (first clamp → Slagworks ore → anomaly and crystal → Void Kings → debt).
- **Failure states, as part of the show:**
  - Answers SOS beacons from other crews.
  - When it is broke and out of fuel, or crippled (no RCS, or a dead drive), it calls the recovery tow.
  - When it dies, it accepts the respawn.

A showcase director makes sure scanning, cave EVAs and derelict breaches come up regularly. It also caps how long any one activity can run, so the show keeps moving.

**Take over at any time:**
- Touch a stick or hold a flight key for about 0.3 s and control hands back to you.
- Press **P** (or the **AI** button in the HUD) to toggle the pilot on and off during a normal run.

In demo mode the player ship takes reduced damage, so the show doesn't end too early. Normal play doesn't get this bonus.

## Controls (keyboard)

| Key | Action |
|---|---|
| W A S D | RCS translate |
| Q / E | spin |
| Shift / Ctrl | throttle up / down |
| Space | guns |
| M | mining laser |
| Z | brake (kill ΔV) |
| X | match ΔV with target |
| F | context action (dock / land / anchor / board / grab) |
| V | alt action (EVA, release) |
| C | directional scanner |
| T / Tab | cycle target |
| G | landing gear |
| P | AI pilot on/off |
| H | flight manual |
| Esc | pause (tow, new sector, exit) |

On touch devices you get two virtual sticks, a throttle slider and action buttons.

## Code layout

```
index.html            DOM shell (HUD, panels, overlays) → loads src/main.js
src/styles.css
src/main.js           entry: hook wiring, fixed-step tick() + render loop, boot, window.KERES debug handle
src/game.js           session lifecycle: new run / demo / load / save / death / tow, UI bindings
src/hooks.js          late-bound callbacks so the sim never imports UI directly
src/core/             util.js (math, rng), config.js (constants, materials, goods), state.js (W, G, pl, ev, AG, cam, PC)
src/world/            body.js (cellular terrain: cut, collide, ray), gen.js (sector generation, stations, rocks, hulks)
src/ships.js          ship layouts, module stats, docking / anchoring
src/physics.js        ship integration, loose cargo, debris
src/combat.js         damage model, guns, mining laser, bullets, meteors
src/eva.js            suit physics, tether, carrying cargo
src/player.js         human control mapping, camera, docking gates, harpoon / breach
src/scanner.js        directional array
src/economy.js        markets, production chains, services, station hull repair crews
src/agents.js         NPC crews (miners, haulers, pirates, rescuers)
src/missions.js       storyline and contract board
src/social.js         bar talk and rumours
src/events.js         sector director (raids, convoys, distress, meteor showers, …)
src/fx.js             particles
src/render/render.js  renderer (terrain, lighting, ships, FX, minimap, scope, chart)
src/ui.js             HUD and panels
src/ai/nav.js         flight primitives: fly(), travel(), docking approaches, EVA path-finding
src/ai/pilot.js       AI pilot brain: planner, showcase director, behaviours, captions
original/             the original single-file v1.1 build, kept for reference
scripts/fast-sim.mjs  headless soak test (see below)
```

## Testing

`window.KERES` exposes the live state, plus:
- `fast(seconds, cb, every)`: runs the simulation without rendering.
- `force(name)`: starts a specific AI activity (`cave`, `breach`, `scan`, `mine`, `flyby`).

`scripts/fast-sim.mjs` drives this through headless Chromium (needs `puppeteer-core` and a Chromium build). It simulates N seconds of AI play and prints the following:
- a timeline of tasks and captions;
- telemetry;
- final world stats (mined, kills, docked, rescues, breaches, eva, jobs…);
- any console errors.

```sh
node scripts/fast-sim.mjs 1800 5 http://localhost:8080/?demo > run.log
```
