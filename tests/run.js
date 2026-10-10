#!/usr/bin/env node
// Runs every unit test script against ../game.js (or the file given as the first argument) and prints a summary.
//   node tests/run.js            unit tests: logic, logic3, classes, menu          (a few seconds)
//   node tests/run.js --sim      adds the long simulations: soak (random full runs with rendering), sweep, passive/aimbot balance bots
const { spawnSync } = require('child_process'), path = require('path');
const args = process.argv.slice(2), sim = args.includes('--sim'), game = args.find(a => !a.startsWith('--')) || '';
const units = ['logic', 'logic3', 'classes', 'menu'], sims = [['ui_fuzz', game, '3', '1500'], ['soak', game, '5', '10'], ['sweep'], ['passive'], ['aimbot', game, '1,2,3']];
let failed = 0;
for (const t of units.concat(sim ? sims.map(s => s[0]) : [])) {
  const extra = (sims.find(s => s[0] === t) || [t]).slice(1);
  const r = spawnSync('node', [path.join(__dirname, t + '.js'), ...(extra.length ? extra : game ? [game] : [])], { encoding: 'utf8', timeout: 600000 });
  const out = (r.stdout || '') + (r.stderr || ''), fails = out.split('\n').filter(l => /^FAIL|Error|invariant violations?$|^TypeError/.test(l) && !/no invariant/.test(l));
  const summary = out.split('\n').filter(l => /passed|menu frames|no invariant|no ui errors|wins of|^lv /.test(l)).slice(-4).join(' | ');
  console.log((fails.length || r.status ? 'FAIL ' : 'ok   ') + t.padEnd(8) + summary); if (fails.length || r.status) { failed++; fails.slice(0, 5).forEach(l => console.log('       ' + l)); }
}
process.exit(failed ? 1 : 0);
