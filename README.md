# Cyber Net Attack

A Terminator-inspired squad runner for the browser (HTML5 canvas, no build step, no dependencies). Run up a ruined lane, steer the
squad through gates to grow it, auto-fire at the machines, dodge their fire, pick up special weapons from supply crates and fire them from the item slot, and destroy the sector boss.
No timers, no energy, no purchases. Android build: see `ANDROID.md`.

## Run
`python3 tools/serve.py --port 8080` then open http://localhost:8080 (any static server works; `file://` works too).
Controls: drag / move the mouse (or A/D, arrows) to steer; tap the item slot, double-tap or double-click (or Space/E) to use the held special item; F cycles the squad formation (free, V, column, wall); P/Esc pauses.

Every sector has its own look: time of day (dawn, noon, dusk, moonlit night, pitch-dark night, overcast), weather that can change part way through (clear, fog, rain, thunderstorms with lightning, wind, dust, ash), a landscape (wasteland, ash, desert, scorched, winter, flooded, industrial) and a skyline (city, sparse ruins, mountains). It is derived from the sector number, so a sector always looks the same.

Threat tiers: from sector 10, enemy health (including the firepower-based sizing of endos, big machines and bosses) rises 10% every ten sectors, with no limit.

Endless Survival (main menu) chains sectors until the squad is lost. Scores are kept on the device and, when the game is served by `tools/serve.py`, on a shared leaderboard (`/api/scores`, stored in `scores.json` next to the server).

## Layout
| path | what |
|---|---|
| `index.html`, `game.js` | the whole game (simulation at a fixed 60 Hz, canvas renderer, synthesised audio) |
| `sw.js`, `manifest.webmanifest`, `assets/icons` | PWA support (installs from Chrome, works offline) |
| `assets/sprites/<unit>/` | painted sprites, one folder per unit; `manifest.js` is generated |
| `tests/` | `npm test` (unit tests, seconds) and `npm run sim` (long randomised simulations and balance bots) |

Watch the bot play in a Chrome window: `node tests/bot.js --watch` (add `--speed 4` to fast-forward, `--mute`, `--max-sector N`; in the window `]` / `[` change the speed). The progression bot (`node tests/bot.js --help` lists every option; `--max-sector N` sets the cap, default 100; `tests/soak.js` also takes `--max-sector`, `--runs`, `--seed`): `node tests/bot.js` plays sector after sector with no upgrades, and buys one level of every upgrade only after a sector has beaten it three times (`--attempts`, `--max-sector`, `--seed`, `--time`, `--assist`, `--why` for loss diagnostics, `--start N --up L` to test a late sector at a given power level).
| `tools/` | sprite import/clean/optimise scripts (`assets/README.md`), `render3d` (3D model to sprites), static server |
| `docs/` | `prompt_builder.html` (image-generator prompts per unit), `resources.html` (tabbed viewer: every sprite, including units still missing art; the sector looks and props; every sound), `reference/` |
| `deploy.sh` | rsync + start a Python server on another machine (`npm run deploy`) |

## Design notes
- Machines have per-type tables (`ET`, `EDRAW` in `game.js`); bosses and big machines size their health to the squad's firepower so the
  fight lasts a few seconds more however strong you are; Endos are armoured the same way.
- Squad classes (pick up to three per sector) change what gates add and how the squad fires; classes unlock with scrap.
- Everything visual is sprites plus procedural effects (fire, smoke, tracers, explosions); every sound is synthesised (no audio files).
