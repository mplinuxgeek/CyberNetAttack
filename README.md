# Cyber Net Attack

A Terminator-inspired squad runner for the browser (HTML5 canvas, no build step, no dependencies). Run up a ruined lane, steer the
squad through gates to grow it, auto-fire at the machines, dodge their fire, pick up special weapons from supply crates and fire them from the item slot, and destroy the sector boss.
No timers, no energy, no purchases. Android build: see `ANDROID.md`.

## Run
`python3 tools/serve.py --port 8080` then open http://localhost:8080 (any static server works; `file://` works too).
Controls: drag / move the mouse (or A/D, arrows) to steer; tap the item slot, double-tap or double-click (or Space/E) to use the held special item; P/Esc pauses.

## Layout
| path | what |
|---|---|
| `index.html`, `game.js` | the whole game (simulation at a fixed 60 Hz, canvas renderer, synthesised audio) |
| `sw.js`, `manifest.webmanifest`, `assets/icons` | PWA support (installs from Chrome, works offline) |
| `assets/sprites/<unit>/` | painted sprites, one folder per unit; `manifest.js` is generated |
| `tests/` | `npm test` (unit tests, seconds) and `npm run sim` (long randomised simulations and balance bots) |
| `tools/` | sprite import/clean/optimise scripts (`assets/README.md`), `render3d` (3D model to sprites), static server |
| `docs/` | `prompt_builder.html` (image-generator prompts per unit), `sprite_demo.html` (sprite viewer), `reference/` |
| `deploy.sh` | rsync + start a Python server on another machine (`npm run deploy`) |

## Design notes
- Machines have per-type tables (`ET`, `EDRAW` in `game.js`); bosses and big machines size their health to the squad's firepower so the
  fight lasts a few seconds more however strong you are; Endos are armoured the same way.
- Squad classes (pick up to three per sector) change what gates add and how the squad fires; classes unlock with scrap.
- Everything visual is sprites plus procedural effects (fire, smoke, tracers, explosions); every sound is synthesised (no audio files).
