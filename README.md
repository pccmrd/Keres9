# KERES-9 — CATALOG ZERO · Moon 2035

A 2D Newtonian game set in lunar orbit, about prospecting and surveying.

Haul engines drag rocks and comets in from the Belt and the Kuiper dark and park them in lunar orbit. Then the **KERES-9** catalog AI died, and nobody knows what is up there anymore. More than 300 bodies in the band are uncatalogued.

You live in HAB 14 on the Shackleton rim. Every morning you ride the Selene Lift cable up to orbit. You start as an EVA crew hand with a suit and a hand cutter. You work up to an orbital tug, and then to a surface lander. In the end you stake the **Orphan**: a huge metallic body with a platinum heart that nobody admits to owning.

## Run it

It's a static site with no build step. ES modules need a real HTTP origin, so serve the folder rather than opening `index.html` as a file:

```sh
python3 -m http.server 8080        # or: npx serve .
# open http://localhost:8080/          → title screen
# open http://localhost:8080/?demo     → straight into WATCH AI PLAY
```

The career saves to `localStorage` under the key `keres9_moon2035_v1`. Demo runs are never saved.

## The world

- **The Moon** is an analytic regolith heightfield with contact physics and a day/night cycle. Gravity is 1.6 m/s² at the surface. The camera rotates so that "up" always points away from the Moon. A dotted line shows your ballistic path, and **IMPACT** warns you when that path hits the ground.
- **The synchronous band** is 1.5 km up. Rocks and stations sit there because gravity and the rotating frame balance out, so they hang still above the Rim. That is why the cable works.
- **Places:**

  | Site | Where | What's there |
  |---|---|---|
  | HAB 14 | surface | home |
  | Selene Lift | surface ↔ band | a counterweighted pair of cars on a 1.4 km cable |
  | SELENE HIGH | in the band, at the top of the cable | crew office, shipyard, market, Catalog Office |
  | SHACKLETON DEPOT | surface | landing pads, HARE yard; ice and metal sell for more down here |
  | VULCAN REFINERY | in the band | refinery: trading and refuel |
  | ARES TRANSIT (Mars-bound), GAIA RETURN (Earth-bound) | pass through the band | transfer ships that come and go in numbered generations (II, III, …), each with its own buyers |

- **Rocks** are cellular. You can cut them with a laser and they rotate. Each holds its own mix of water ice, nickel-iron, volatiles, platinum group, rare-earth crystal and parts. Some also hide sealed chambers, KERES-9 core shards or HELION claim transponders.

## The career

Three tiers carried by a 15-step story:

| Tier | Ship | What you do |
|---|---|---|
| 1 · Crew hand | your suit; Foreman Lu's MULE-3 shuttle | Ride the lift up, sign on in the CREW OFFICE, and get dropped at a rock. Cut ore on EVA until your sack is full, then get back aboard before the horn. Pay is a base rate plus half your haul. |
| 2 · Orbital tug | **WREN** (2,400₡ at SELENE HIGH) | Fly anywhere in the band. Harpoon onto rocks and mine from the hull. Survey bodies, deep-scan for core shards and claim tags, and sell to the Mars, Earth and refinery buyers. |
| 3 · Lander | **HARE** (6,500₡ at SHACKLETON DEPOT) | You fly it all the way: launch from the pad, climb into the band, mine and trade, then deorbit and land on the tail. You carry water down the well and mine the Orphan. |

Story steps:
1. wake
2. ride up the cable
3. sign on with Lu
4. first shift
5. survey 3 bodies
6. save for the WREN
7. sell 8 units off-world
8. resolve 2 ghost claim tags
9. hand in 3 KERES-9 core shards
10. buy the HARE
11. pad to orbit
12. sell 20 water ice at the Depot
13. sell 12 platinum group from the Orphan to GAIA RETURN
14. file the claim at the Catalog Office
15. free prospector

**Core shards can't be lost for good.** The story needs 3, and the world starts with exactly 3. If one is lost (sold, left drifting, or gone with a wreck), the Catalog Office soon picks up another sealed lattice in some uncatalogued rock, and a message appears in the feed.

**Solar storms** come with a 40-second warning. During a storm, suit air outside drains 3.5× faster, so get under a roof: a pressurised room or right beside your ship or the MULE.

The contract boards keep the work coming: survey jobs, delivery runs, and up-well runs from the surface to SELENE HIGH.

Upgrades for sale:
- **Ship:** ENGINE TUNE, CARGO RACKS, LASER FOCUS, AUX TANKS, ARRAY GAIN.
- **Suit:** BIG TANK, DEEP SACK, HOT CUTTER.

If you die, Rim medics wake you in HAB 14 and you lose 15% of your credits. If you're stranded, the pause menu lets you call a rescue tow for 120–300₡.

## Watch the AI play

Click **WATCH AI PLAY** on the title screen (or open `?demo`), and the computer plays the career on its own. It uses the same sticks, throttle rail and buttons a human does: it never moves a ship directly. A caption panel explains each move, along with the current task and live telemetry. Time runs at ×3 during long cruises.

What it does:

- **On foot and EVA:**
  - Walks between rooms with path-finding and rides the lift.
  - On crew shifts, it surveys with the hand scanner, cuts ore, and stows the sack before the horn. It heads back for air while there's still enough left for the trip to the MULE.
  - When a solar-storm warning sounds, it shelters at the MULE until the storm passes.
  - In open space it steps around rocks and station hulls, keeping close to the real surface, instead of pushing straight into them.
  - Boards ships as soon as the BOARD prompt is live.
- **Flight** (a gravity-aware autopilot, `src/autop.js`, which NPC traffic also uses):
  - Plans detours around rocks.
  - Caps cruise speed in the band.
  - **Arc routing:** long trips follow the band's curve rather than the straight chord, which would sag below the synchronous radius. On a 4 km leg this cuts fuel about 4×.
  - Approaches station berths along the port axis, then clamps.
  - Pad approaches for the tail-sitting HARE, with a fuel check before every descent.
  - Launches from the pad without tripping its clamp interlock.
- **Mining:**
  - Picks rocks by value and distance, and skips rocks that refused its harpoon.
  - Harpoons onto the rock from a standoff point and turns the laser mount (not the hull) to face the target.
  - Sweeps the cut, scoops the loose ore, and comes back for more.
  - **On the Orphan:** casts rays to find the real surface above each platinum vein, chooses a reachable one, rounds the body in short ring hops to reach it, and cuts down to it.
- **Scanning:** surveys UNKNOWN bodies on the way past. For deep contacts it perches on the rock and sweeps the directional array's dial to find the resonance.
- **Economy:**
  - Sells where the price is best and refuels against a reserve model. The reserve grows with distance, how far the ship is from the band, and how far it is down the well, with a floor of 22% of the tank.
  - Takes contracts it can finish, buys upgrades and the next ship, and hands in shards, collects bounties and files the claim at the Catalog Office.
- **Recovery:**
  - Detects stalled legs and backs out the open way.
  - Kicks a pinned suit free.
  - Rethinks any task that runs too long.
  - Stops retrying Catalog Office visits that change nothing.
  - Calls the tow as a last resort.

**Take over at any time:** touch a stick or a flight key and control hands back to you. Press **P**, or use **AI PILOT** in the pause menu, to toggle the AI during a normal career.

## Controls

**Desktop:**

| Key | Action |
|---|---|
| W A S D | RCS translate (screen-relative); on the ground A/D walk, W hops |
| Q / E | turn |
| Shift / Ctrl | throttle up / down |
| M | mining laser / suit cutter |
| F | use: context action (terminal, lift, dock, land, harpoon, board) |
| V | alt: suit scanner ping on EVA; SAS (UP / RETRO / PRO) in flight |
| X | match target velocity |
| Z | brake against the band |
| T / Tab | cycle target |
| G | landing gear |
| C | directional array / hand scanner |
| P | AI player on/off |
| H | field manual |
| Esc | pause (tow, new career, exit) |

**Touch:** the left stick moves and fires RCS relative to the screen. The right stick turns. The right rail is the throttle. Tap to pick a target.

**Docking and landing limits:**
- Berths clamp below 2.5 m/s.
- Harpoons hold below 3 m/s relative to the rock.
- The HARE pad clamps automatically if you come down nose-up, under 3 m/s, with less than 20° of tilt.

## Code layout

```
index.html            DOM shell (title, HUD, station panel, chart, manual) → loads src/main.js
src/styles.css
src/main.js           entry: hook wiring, fixed-step tick() + render loop, window.KERES debug handle
src/game.js           session lifecycle: new career / demo / load / save / death / tow, panel actions
src/hooks.js          late-bound callbacks so the sim never imports UI directly
src/input.js          keyboard + touch sticks, throttle rail, buttons
src/core/             util.js (math, rng), config.js (constants, materials, goods, ship classes), state.js (W, G, pl, ev, cam, PC)
src/world/moon.js     lunar heightfield, ground contact, day/night
src/world/body.js     cellular terrain: cut, collide, ray, ports
src/world/gen.js      world generation: stations, surface sites, band rocks, the Orphan
src/lift.js           the Selene Lift cars
src/crew.js           tier 1: Foreman Lu, MULE-3 and the EVA crew
src/autop.js          gravity-aware steering shared by NPC traffic and the AI
src/ships.js          ship layouts, module stats, docking / anchoring / attach
src/physics.js        ship integration, engines, RCS, pad clamps, loose cargo
src/combat.js         module damage model, mining laser
src/eva.js            suit physics, rooms, boarding, hand scanner
src/player.js         human control mapping, camera, context actions, harpoon
src/scanner.js        directional array, dial and resonance lock
src/economy.js        markets, services, shipyard, upgrades, hold
src/missions.js       story steps and contract boards
src/agents.js         NPC traffic in the band
src/events.js         world events (inbound hauls, meteors, …)
src/social.js         bar talk and rumours
src/fx.js, audio.js   particles and sound
src/render/render.js  renderer (Moon, terrain, lighting, ships, FX, chart)
src/ui.js             HUD and station panels
src/ai/nav.js         AI flight primitives: fly(), flyRoute() arc routing, port / pad approaches, EVA path-finding
src/ai/pilot.js       AI player brain: tier planner, tasks, captions, recovery
original/             the original single-file v1.1 build, kept for reference
scripts/fast-sim.mjs  headless soak test (see below)
```

## Testing

`window.KERES` exposes the live state (`W`, `G`, `pl`, `ev`, `AP`, `PC`, `SITES`, …). It also provides `fast(seconds, cb, every)`, which runs the simulation without rendering.

`scripts/fast-sim.mjs` uses this through headless Chromium. It needs `puppeteer-core`, plus either `CHROME_PATH` or `@sparticuz/chromium`. It simulates N seconds of AI play and prints:
- a timeline of story step, tier, credits, task and caption;
- final world stats (mined, earned, catalogued, shifts, delivered, lifts, …);
- the AI's caption log;
- any console errors.

```sh
node scripts/fast-sim.mjs 3600 60 http://localhost:8080/?demo > run.log
```

`scripts/check-imports.mjs` checks every module's imports without a browser. It runs Node's real module linker over `src/` but never executes the code, so a missing export, a typo'd import name or a bad path fails exactly as it would in the browser:

```sh
node --experimental-vm-modules scripts/check-imports.mjs
```

Status: in headless runs the AI has made it from a fresh career into the WREN tier. Runs started at story step 11 (pad to orbit) have finished the career (tiers 2 and 3, through filing the Orphan claim). Runs are not deterministic, so tuning is still going on.
