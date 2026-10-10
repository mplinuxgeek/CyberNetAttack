// The bot's brain, shared by the headless runner (tests/bot.js) and the on-screen one (tools/botwatch.js).
// makeBot(t) wants the game's own functions: squadHalf, ET, bigFoe, bossShielded, useItem.
(function (root) {
  function makeBot(t) {
    const LANE = 205;
    function gateValue(o, n) {
      switch (o.k) {
        case 'add': return o.v >= 0 ? o.v : o.v - Math.floor(n * .1);
        case 'mul': return n * (o.v - 1);
        case 'wpn': return 14 + n * .35;
        case 'rate': return 6 + n * .25;
        case 'dmg': return 6 + n * .3;
        case 'cls': return o.v + 6;
        default: return 0;
      }
    }
    function pilot(G) {
      const half = t.squadHalf(), xs = []; for (let x = -.88; x <= .881; x += .04) xs.push(+x.toFixed(3));
      const cost = new Array(xs.length).fill(0), add = (fn) => { for (let i = 0; i < xs.length; i++) cost[i] += fn(xs[i]); };
      const near = (x, c, w) => Math.abs(x - c) < w;
      // enemy fire: where each bolt will land, and when
      for (const b of G.bolts) { const tl = b.rz / 170, xl = b.x + b.vx * tl; if (tl > 1.7) continue; const wgt = (b.dmg || 1) * (tl < .9 ? 9 : 4); add(x => near(x, xl, half + .12) ? wgt : 0); }
      for (const s of G.strikes) { if (s.fire) continue; const w = s.r + half + .06, wgt = 12 * (s.dmg || 1); add(x => near(x, s.x, w) ? wgt : 0); }
      for (const h of G.haz) { if (h.dead) continue; const rel = h.wz - G.dist; if (rel > 190 || rel < -25) continue; const w = h.hw + half + .07, wgt = h.k === 'mine' ? 11 : 8; add(x => near(x, h.x, w) ? wgt : 0); }
      for (const o of G.obs) {
        if (o.dead) continue; const rel = o.wz - G.dist; if (rel > 280 || rel < -30) continue;
        if (o.k === 'cable') { if (!o.sq) add(x => near(x, o.x, o.hw + half) ? 7 : 0); }
        else if (o.k === 'overpass') { if (o.st === 1) for (let i = 0; i < 3; i++) if (i !== o.open) add(x => near(x, (i - 1) * .6, .3 + half) ? 16 : 0); }
        else if (o.k === 'rubble' || o.k === 'jersey' || o.k === 'slab') add(x => near(x, o.x, o.hw + half) ? (o.k === 'rubble' ? 2.2 : 3) : 0);
        else if (o.k === 'truck' || o.k === 'sandbag') add(x => near(x, o.x, o.hw + half) ? 2 : 0);
      }
      // machines that will reach the squad
      let tgt = null, tgtScore = -1e9;
      for (const e of G.en) {
        if (e.dead) continue; const d = t.ET[e.t], rel = e.wz - G.dist;
        if (rel > 800) continue;
        if (!d.hold && rel < 260 && rel > -10) { const w = d.hw * e.sc + half + .1, wgt = rel < 130 ? 9 : 4; add(x => near(x, e.x, w) ? wgt : 0); }   // walkers, crawlers, drones, blades
        if (d.grab && (e.gs === 'aim' || e.gs === 'lock' || e.gs === 'slam')) add(x => near(x, e.tx, .22 + half) ? 14 : 0);
        if (rel < 40) continue;
        const big = t.bigFoe(e) || e.boss, sc = (e.boss && !t.bossShielded(e) ? 400 : big ? 200 : 40) - rel * .3 - (e.t === 't1000' ? 0 : 0);
        if (sc > tgtScore) { tgtScore = sc; tgt = e; }
      }
      // what to head for: the better side of the next gate, otherwise the target, crates and scrap
      let want = null, ww = 0;
      const gate = G.gates.filter(g => !g.used && g.wz - G.dist > -5).sort((a, b) => a.wz - b.wz)[0];
      // a machine that is holding the squad stops it short of everything beyond it, gates included: shoot it instead of waiting at the gate's side
    const blocking = G.en.some(e => !e.dead && (t.ET[e.t].block || e.boss) && e.wz - G.dist < t.ET[e.t].hold + 60 && !G.gates.some(g => !g.used && g.wz > G.dist - 5 && g.wz < e.wz));
    if (gate && gate.wz - G.dist < 900 && !(blocking && gate.wz > G.dist + 200)) {
        const lv = gateValue(gate.L, G.n), rv = gateValue(gate.R, G.n);
        want = (lv >= rv ? -1 : 1) * (.42 + Math.min(.2, half)); ww = 1.6;
        if (gate.wz - G.dist < 120) ww = 3;   // commit
      }
      if (!want && tgt) { want = tgt.x; ww = tgt.boss ? .9 : .5; }
      const blockWz = Math.min(1e9, ...G.en.filter(e => !e.dead && (t.ET[e.t].block || e.boss)).map(e => e.wz - t.ET[e.t].hold - 60 + G.dist * 0));   // a crate behind a machine that stops the squad cannot be reached
      const pu = G.pups.filter(p => p.wz - G.dist > 30 && p.wz - G.dist < 520 && p.wz < blockWz - 10).sort((a, b) => a.wz - b.wz)[0];
      if (pu && (!gate || gate.wz > pu.wz) && !G.sweep) { want = pu.x; ww = 1.1; }
      if (!want) { const sc = G.scr.filter(c => c.wz - G.dist > 0 && c.wz - G.dist < 360).sort((a, b) => a.wz - b.wz)[0]; if (sc) { want = sc.x; ww = .3; } }
      let best = 0, bc = 1e9;
      for (let i = 0; i < xs.length; i++) {
        let c = cost[i] + .12 * Math.abs(xs[i] - G.px) * 6 + .02 * Math.abs(xs[i]);
        if (want !== null) c += ww * 3 * Math.abs(xs[i] - want);
        if (c < bc) { bc = c; best = i; }
      }
      WHYINFO = { xs, cost, want, ww, tgt, best }; WHYINFO = { xs, cost, want, ww, tgt, best }; G.tx = xs[best]; DBG = `want ${want === null ? '-' : want.toFixed(2)} w${ww} tgt ${tgt ? tgt.t + (tgt.boss ? '*' : '') : '-'} cost ${bc.toFixed(1)} tx ${G.tx}`;
    }

    let lastItem = -9;
    function useItems(G) {
      const it = G.item; if (!it || G.t - lastItem < .9 || G.over) return;
      const us = G.en.filter(e => !e.dead && e.wz - G.dist > 30 && e.wz - G.dist < 800);
      const big = us.filter(e => t.bigFoe(e) && !t.ET[e.t].fly), cnt = (r) => us.filter(e => e.wz - G.dist < r).length;
      const boss = us.find(e => e.boss), lane = us.filter(e => Math.abs(e.x - G.px) < .22);
      let go = false;
      switch (it.k) {
        case 'pulse': go = big.some(e => e.wz - G.dist < 360) || cnt(300) >= 5 || (G.n < G.peak * .4 && cnt(300) >= 2); break;
        case 'c4': { const armed = G.c4.filter(c => c.stuck && !c.dead); if (armed.length) { go = armed[0].fuse < 2.6; } else go = big.some(e => e.wz - G.dist < 520 && !t.bossShielded(e)); break; }
        case 'flare': go = us.filter(e => e.wz - G.dist > 160).length >= 5 || big.length >= 1 && us.length >= 3; break;
        case 'spike': go = !(G.guard && !G.guard.dead) && us.some(e => (e.t === 'grunt' || e.t === 'gunner') && e.wz - G.dist > 60 && e.wz - G.dist < 500); break;
        case 'cannon': go = lane.length >= 3 || lane.some(e => t.bigFoe(e) || e.boss); break;
        case 'nuke': { const zone = us.filter(e => e.wz - G.dist > 380 && e.wz - G.dist < 760); go = zone.length >= 8 || (boss && zone.some(e => e.boss) && big.length >= 1); break; }   // it lands 400+ px ahead and reaches about 340 px around that point
      }
      if (go && t.useItem()) lastItem = G.t;
    }


    let DBG = '', WHYINFO = null;
    return { pilot, useItems, gateValue, dbg: () => DBG, why: () => WHYINFO, why: () => WHYINFO, reset: () => { lastItem = -9; } };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = makeBot; else root.makeBot = makeBot;
})(typeof window !== 'undefined' ? window : globalThis);
