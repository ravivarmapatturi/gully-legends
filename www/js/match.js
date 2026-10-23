// The on-field part of the game: canvas rendering plus both innings.
// Innings 1: you bowl (pick bowler per over, delivery per ball, AI bats).
// Innings 2: you bat (tap timing + direction, your batters' traits apply).

const Match = (() => {
  const W = 400, H = 720;
  const PY0 = 170, PY1 = 600, HW0 = 30, HW1 = 78, STUMP_H = 38;
  let cv, ctx, wrap, scale = 1, dpr = 1;
  let fieldCache = null;
  let M = null, onEnd = null, raf = 0, hiddenAt = 0;
  let particles = [], shake = 0, trail = [];

  const now = () => performance.now();
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lv = (p, k) => (p.traits && p.traits[k]) || 0;
  const $ = id => document.getElementById(id);

  // ---------- Sound / haptics ----------
  let ac;
  function snd(f, d, type = 'square', v = 0.1) {
    if (!UI.settings().sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(v, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + d);
      o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + d);
    } catch (e) {}
  }
  const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

  // ---------- Setup ----------
  function init() {
    cv = $('field'); ctx = cv.getContext('2d'); wrap = $('matchWrap');
    addEventListener('resize', resize);
    cv.addEventListener('pointerdown', onDown);
    addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', () => {
      if (!M) return;
      if (document.hidden) hiddenAt = now();
      else if (hiddenAt) { shiftTimes(now() - hiddenAt); hiddenAt = 0; }
    });
  }

  function resize() {
    if (!M) return;
    scale = Math.min(innerWidth / W, innerHeight / H);
    dpr = Math.min(devicePixelRatio || 1, 2);
    const cw = Math.round(W * scale), ch = Math.round(H * scale);
    wrap.style.width = cw + 'px'; wrap.style.height = ch + 'px';
    wrap.style.setProperty('--s', scale);
    cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    fieldCache = null;
  }

  // A pause (app in background) must not make the ball "fly past" the batter.
  function shiftTimes(dt) {
    for (const k of ['t0', 'runStart', 'swingAt']) if (M[k]) M[k] += dt;
    if (M.ball) { M.ball.start += dt; M.ball.arrive += dt; }
    if (M.shot) { M.shot.start += dt; M.shot.end += dt; }
  }

  // ---------- Match lifecycle ----------
  function start(opp, squad, done) {
    onEnd = done;
    const batOrder = squad.slice().sort((a, b) => a.order - b.order).slice(0, WKTS);
    M = {
      opp, squad, batOrder,
      inn: 1,
      score: [newInnings(), newInnings()],
      target: 0,
      state: 'choose',
      ball: null, shot: null, swingAt: -1e9,
      bowler: null, lastBowlerId: null, oversBy: {},
      lastType: null, repeat: 0, wicketsBy: {},
    };
    resize();
    showBowlerPick();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }
  function newInnings() { return { runs: 0, wk: 0, balls: 0, log: [], fours: 0, sixes: 0 }; }
  function stop() { cancelAnimationFrame(raf); M = null; hideAll(); }
  const cur = () => M.score[M.inn - 1];
  const lastOver = () => cur().balls >= BALLS - 6;

  // ---------- HTML overlay controls ----------
  function hideAll() { for (const id of ['bowlerPick', 'deliveryBar', 'breakCard']) $(id).hidden = true; }

  function showBowlerPick() {
    hideAll();
    M.state = 'choose';
    const list = $('bowlerList');
    list.innerHTML = '';
    const bowlers = M.squad.filter(p => p.bowl >= 40).sort((a, b) => b.bowl - a.bowl);
    for (const p of bowlers) {
      const banned = p.id === M.lastBowlerId;
      const b = document.createElement('button');
      b.className = 'pick' + (banned ? ' disabled' : '');
      b.disabled = banned;
      const sig = SIGNATURES[p.sig];
      const traits = Object.entries(p.traits).filter(([k, v]) => v && TRAITS[k].kind === 'bowl')
        .map(([k, v]) => `${TRAITS[k].icon}${v}`).join(' ');
      b.innerHTML = `<b>${p.name}</b><span class="rating">${p.bowl}</span>
        <small>${sig.kind === 'bowl' ? sig.icon + ' ' + sig.name : ''} ${traits}${banned ? ' · bowled last over' : ''}</small>`;
      b.onclick = () => { M.bowler = p; $('bowlerPick').hidden = true; nextDelivery(); };
      list.appendChild(b);
    }
    $('bowlerPick').hidden = false;
  }

  function nextDelivery() {
    M.state = 'pick';
    const bat = M.opp.batters[cur().wk];
    $('scout').innerHTML = `<b>${bat.name}</b> (${bat.rating}) · weak vs <em>${DELIVERIES[bat.weak].name}</em> · strong vs ${DELIVERIES[bat.strong].name}`;
    $('deliveryBar').hidden = false;
  }

  function chooseDelivery(type) {
    if (!M || M.state !== 'pick') return;
    $('deliveryBar').hidden = true;
    M.repeat = type === M.lastType ? M.repeat + 1 : 0;
    M.lastType = type;
    const bat = M.opp.batters[cur().wk];
    const out = bowlOutcome(M.bowler, bat, type);
    const D = DELIVERIES[type];
    const speed = 1000 - M.bowler.bowl * 3 - (M.bowler.sig === 'express' ? 60 : 0);
    const L = out.how === 'bowled' ? (Math.random() - 0.5) * 0.2 : Math.random() * 1.2 - 0.6;
    M.ball = newBall(type, out.fullToss ? 1.1 : D.dB, L, speed * D.slow);
    M.ball.ai = out;
    M.state = 'runup'; M.runStart = now();
  }

  // ---------- Probability model for innings 1 (AI batting) ----------
  function bowlOutcome(bw, bat, type) {
    let e = (bw.bowl - bat.rating) / 100;
    let fullToss = false;
    if (type === 'yorker') {
      const miss = Math.max(0, 0.22 - bw.bowl / 600 - lv(bw, 'yorker') * 0.03);
      if (bw.sig !== 'toecrusher' && Math.random() < miss) fullToss = true;
      else e += 0.05 + lv(bw, 'yorker') * 0.03;
    }
    if (type === 'bouncer') e += lv(bw, 'bouncer') * 0.03;
    if (type === 'slower') e += lv(bw, 'slower') * 0.035;
    if (bat.weak === type) e += 0.15;
    if (bat.strong === type) e -= 0.12;
    if (M.repeat > 0 && bw.sig !== 'mystery') e -= 0.08 * M.repeat;
    if (lastOver()) e += lv(bw, 'death') * 0.025;
    if (fullToss) e -= 0.3;
    const lastBall = cur().balls % 6 === 5;
    const pW = clamp(0.07 + e * 0.22 + lv(bw, 'swing') * 0.015 + (type === 'bouncer' ? 0.03 : 0) + (bw.sig === 'golden' && lastBall ? 0.15 : 0), 0.02, 0.45);
    const p6 = clamp(0.09 - e * 0.22 + (type === 'bouncer' ? 0.03 : 0) - (bw.sig === 'express' ? 0.03 : 0), 0.01, 0.4);
    const p4 = clamp(0.15 - e * 0.2 - (bw.sig === 'express' ? 0.03 : 0), 0.02, 0.35);
    const p0 = clamp(0.28 + e * 0.3, 0.08, 0.6);
    const p2 = 0.08;
    const r = Math.random();
    let res, how = 'hit';
    if (r < pW) { res = 'W'; how = type === 'bouncer' || Math.random() < 0.45 ? 'caught' : 'bowled'; }
    else if (r < pW + p6) res = 6;
    else if (r < pW + p6 + p4) res = 4;
    else if (r < pW + p6 + p4 + p0) { res = 0; how = Math.random() < 0.5 ? 'beaten' : 'hit'; }
    else if (r < pW + p6 + p4 + p0 + p2) res = 2;
    else res = 1;
    return { res, how, fullToss };
  }

  // ---------- Balls & shots ----------
  function newBall(type, dB, L, dur) {
    return { type, dB, L, r0: (Math.random() - 0.5) * 0.3, dur: dur * (0.94 + Math.random() * 0.12),
             start: 0, arrive: 0, d: 0, swung: false, resolved: false, timing: null };
  }
  function proj(line, d) { return { x: W / 2 + line * lerp(HW0, HW1, d), y: lerp(PY0, PY1, d), s: lerp(0.45, 1, d) }; }
  function ballH(b, d) {
    if (d < b.dB) { const u = d / b.dB; return 60 * (1 - u * u); }
    const bh = (1 - b.dB) * 110 + 4, v = (d - b.dB) / (1 - b.dB);
    return bh * Math.sin(Math.min(v, 1) * Math.PI / 2) + (v > 1 ? (v - 1) * 20 : 0);
  }

  function hitShot(res, q, dir, t, labelTxt, sub) {
    const b = M.ball;
    b.resolved = true;
    b.d = clamp((t - b.start) / b.dur, 0, 1.05);
    const p = proj(lerp(b.r0, b.L, b.d), b.d);
    const ang = -Math.PI / 2 + dir * 0.6 + (Math.random() - 0.5) * 0.35;
    const edge = res === 'W' && q === 0;
    const dist = res === 6 ? 720 : res === 4 ? 470 : res === 'W' ? (edge ? 0 : 280) : res === 2 ? 260 : res === 1 ? 170 : 60;
    const peak = res === 6 ? 230 : res === 'W' ? (edge ? 0 : 110) : res === 4 ? 8 : 25;
    M.shot = { miss: false, res, q, from: { x: p.x, y: p.y, h: ballH(b, b.d) * p.s }, ang, dist, peak,
               start: t, end: t + (res === 6 ? 1500 : 1200), label: labelTxt || label(res, q), sub: sub || '' };
    M.state = 'shot';
    trail = [];
    if (res === 6) { snd(520, 0.25, 'sawtooth', 0.09); buzz(60); burst(W / 2, 140, 60); }
    else if (res === 4) { snd(420, 0.2, 'square', 0.08); buzz(40); burst(W / 2, 200, 25); }
    else if (res === 'W') { snd(110, 0.35, 'sawtooth', 0.1); buzz([30, 40, 30]); shake = 10; }
    else snd(300, 0.08, 'square', 0.06);
  }

  function missShot(t, bowled, sub) {
    const b = M.ball;
    b.resolved = true;
    M.shot = { miss: true, res: bowled ? 'W' : 0, bowled, start: t, end: t + 1100,
               label: bowled ? 'BOWLED!' : 'Beaten!', sub };
    M.state = 'shot';
    if (bowled) { snd(90, 0.4, 'sawtooth', 0.1); buzz([30, 40, 30]); shake = 12; }
  }

  function label(res, q) {
    if (res === 6) return 'SIX!';
    if (res === 4) return q === 0 ? 'Edged for FOUR' : 'FOUR!';
    if (res === 'W') return q === 0 ? 'Caught behind!' : 'CAUGHT!';
    if (res === 0) return 'Dot ball';
    return res + (res === 1 ? ' run' : ' runs');
  }

  // AI batter plays the shot that bowlOutcome() already decided.
  function resolveAI(t) {
    const b = M.ball, o = b.ai;
    const name = DELIVERIES[b.type].name + (o.fullToss ? ' → full toss!' : '');
    if (o.res === 'W' && o.how === 'bowled') return missShot(t, true, name);
    if (o.res === 0 && o.how === 'beaten') return missShot(t, false, name);
    M.swingAt = t - 30;
    const q = o.res === 6 ? 3 : o.res === 4 ? 2 : o.res === 'W' ? (Math.random() < 0.3 ? 0 : 1) : 1;
    hitShot(o.res, q, [-1, 0, 1][Math.floor(Math.random() * 3)], t, null, name);
  }

  // ---------- Innings 2: your batting ----------
  function aiBall() {
    const opp = M.opp, L = opp.idx;
    const types = [['good', 4], ['yorker', 0.6 + L * 0.3], ['bouncer', 1.5 + L * 0.25], ['slower', L > 1 ? 1 + L * 0.1 : 0]];
    let tot = types.reduce((s, t) => s + t[1], 0), r = Math.random() * tot, pick = 'good';
    for (const [k, w] of types) { r -= w; if (r <= 0) { pick = k; break; } }
    const bw = opp.bowlers[Math.floor(cur().balls / 6) % opp.bowlers.length];
    const batter = M.batOrder[cur().wk];
    const speed = (1150 - bw.rating * 4.5) * (1 + lv(batter, 'pace') * 0.04);
    return newBall(pick, DELIVERIES[pick].dB, Math.random() * 1.6 - 0.8, speed * DELIVERIES[pick].slow);
  }

  function swing(x, t) {
    if (M.inn !== 2 || (M.state !== 'ball' && M.state !== 'runup')) return;
    const b = M.ball;
    if (b.swung || b.resolved) return;
    b.swung = true; M.swingAt = t;
    snd(140, 0.06, 'triangle', 0.05);
    if (M.state === 'runup') { b.timing = 'Way too early!'; return; }

    const p = M.batOrder[cur().wk];
    const dt = t - b.arrive, adt = Math.abs(dt);
    const k = (b.type === 'yorker' ? 0.7 : 1) * (1 + (p.bat - 60) / 250);
    const bonus = lv(p, 'timing') * 7 + (lastOver() ? lv(p, 'finisher') * 5 : 0);
    const win = [45, 95, 140, 175].map(v => v * k + bonus);
    let q = adt <= win[0] ? 3 : adt <= win[1] ? 2 : adt <= win[2] ? 1 : adt <= win[3] ? 0 : -1;
    if (q < 0) { b.timing = dt < 0 ? 'Too early!' : 'Too late!'; return; }

    const dir = x < W / 3 ? -1 : x > W * 2 / 3 ? 1 : 0;
    const side = b.L < -0.3 ? -1 : b.L > 0.3 ? 1 : 0;
    if (side !== 0 && dir === -side && p.sig !== 'wristy') q -= 1;
    if (b.type === 'bouncer' && dir === 0) q -= 1;
    q = Math.max(q, 0);

    const res = batOutcome(p, q, b);
    const sub = q === 3 ? 'Perfect timing' : (dt < 0 ? 'Early' : 'Late') + ' by ' + Math.round(adt) + 'ms';
    hitShot(res, q, dir, t, null, sub);
  }

  function batOutcome(p, q, b) {
    const r = Math.random();
    const catchMul = 1 - lv(p, 'anchor') * 0.15;
    const sixBonus = lv(p, 'power') * 0.05 + (lastOver() ? lv(p, 'finisher') * 0.05 : 0) + (p.bat - 60) / 400;
    if (p.sig === 'helicopter' && b.type === 'yorker' && q === 3) return 6;
    if (p.sig === 'ramp' && b.type === 'bouncer' && q >= 2) return r < 0.5 ? 6 : 4;
    if (q === 3) return r < 0.75 + sixBonus ? 6 : 4;
    if (q === 2) {
      if (p.sig !== 'coolhead' && r < 0.08 * catchMul) return 'W';
      const s = Math.random();
      return s < 0.1 + sixBonus ? 6 : s < 0.6 ? 4 : 2;
    }
    if (q === 1) {
      if (r < 0.15 * catchMul) return 'W';
      const s = Math.random();
      return s < 0.5 ? 1 : s < 0.8 ? 2 : 0;
    }
    if (r < 0.35 * catchMul) return 'W';
    const s = Math.random();
    return s < 0.25 ? 4 : s < 0.65 ? 1 : 0;
  }

  // ---------- Update ----------
  function update(t) {
    const m = M;
    if (m.inn === 2 && m.state === 'wait' && t >= m.t0) { m.state = 'runup'; m.runStart = t; m.ball = aiBall(); }
    if (m.state === 'runup' && t >= m.runStart + 650) { m.state = 'ball'; m.ball.start = t; m.ball.arrive = t + m.ball.dur; }
    if (m.state === 'ball') {
      const b = m.ball;
      b.d = (t - b.start) / b.dur;
      if (m.inn === 1 && t >= b.arrive) resolveAI(t);
      else if (m.inn === 2 && t > b.arrive + 175) {
        const bowled = Math.abs(b.L) < 0.2 && ballH(b, 1) < STUMP_H;
        missShot(t, bowled, b.timing || (b.swung ? 'Missed it' : 'No shot played'));
      }
    }
    if (m.state === 'shot' && m.shot.miss && !m.shot.bowled) m.ball.d = Math.min((t - m.ball.start) / m.ball.dur, 1.22);
    if (m.state === 'shot' && t > m.shot.end) finishBall(t);
  }

  function finishBall(t) {
    const s = cur(), r = M.shot.res;
    if (r === 'W') {
      s.wk++;
      if (M.inn === 1) M.wicketsBy[M.bowler.id] = (M.wicketsBy[M.bowler.id] || 0) + 1;
    } else {
      s.runs += r;
      if (r === 4) s.fours++;
      if (r === 6) s.sixes++;
    }
    s.balls++;
    s.log.push(r);
    M.shot = null;

    if (M.inn === 1) {
      if (s.wk >= WKTS || s.balls >= BALLS) return inningsBreak();
      if (s.balls % 6 === 0) {
        M.lastBowlerId = M.bowler.id;
        M.state = 'overgap'; setTimeout(() => M && showBowlerPick(), 500);
      } else { M.state = 'gap'; setTimeout(() => M && nextDelivery(), 350); }
      return;
    }
    if (s.runs >= M.target) return finish('won');
    if (s.wk >= WKTS || s.balls >= BALLS) return finish(s.runs === M.target - 1 ? 'tied' : 'lost');
    M.state = 'wait'; M.t0 = t + 500;
  }

  function inningsBreak() {
    M.state = 'break';
    M.target = M.score[0].runs + 1;
    const s = M.score[0];
    $('breakTitle').textContent = `${M.opp.name}: ${s.runs}/${s.wk}`;
    $('breakText').innerHTML = `You need <b>${M.target}</b> off ${BALLS} balls.<br>Batting: ` +
      M.batOrder.map(p => `<span class="chip">${SIGNATURES[p.sig].icon} ${p.name}</span>`).join(' ');
    $('breakCard').hidden = false;
  }
  function startChase() {
    $('breakCard').hidden = true;
    M.inn = 2; M.ball = null; M.state = 'wait'; M.t0 = now() + 700;
  }

  function finish(result) {
    M.state = 'end';
    const a = M.score[0], b = M.score[1];
    const summary = {
      result, opp: M.opp, mine: b, theirs: a, target: M.target,
      wickets: a.wk, wicketsBy: M.wicketsBy, ballsLeft: BALLS - b.balls,
    };
    snd(result === 'won' ? 660 : 160, 0.5, result === 'won' ? 'triangle' : 'sawtooth', 0.09);
    setTimeout(() => { const cb = onEnd; stop(); cb && cb(summary); }, 1300);
  }

  // ---------- Particles ----------
  function burst(x, y, n) {
    const cols = ['#f5c518', '#ff6b6b', '#5dade2', '#2ecc71', '#fff'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 5;
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, life: 1, c: cols[i % cols.length], r: 2 + Math.random() * 3 });
    }
  }
  function drawParticles() {
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life -= 0.016;
      ctx.globalAlpha = Math.max(p.life, 0); ctx.fillStyle = p.c;
      ctx.fillRect(p.x, p.y, p.r, p.r * 1.6);
    }
    ctx.globalAlpha = 1;
    particles = particles.filter(p => p.life > 0);
  }

  // ---------- Drawing ----------
  function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
  function text(s, x, y, size, color, align = 'center', weight = 700) {
    ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
  }

  // The stadium never changes during a match, so it is painted once to an offscreen canvas.
  function buildField() {
    const c = document.createElement('canvas');
    c.width = cv.width; c.height = cv.height;
    const g = c.getContext('2d');
    g.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    const sky = g.createLinearGradient(0, 0, 0, 100);
    sky.addColorStop(0, '#0f1b33'); sky.addColorStop(1, '#2c3e66');
    g.fillStyle = sky; g.fillRect(0, 0, W, 100);
    // floodlights
    for (const x of [30, W - 30]) {
      const lg = g.createRadialGradient(x, 18, 2, x, 18, 120);
      lg.addColorStop(0, 'rgba(255,250,220,0.55)'); lg.addColorStop(1, 'rgba(255,250,220,0)');
      g.fillStyle = lg; g.fillRect(x - 120, 0, 240, 160);
      g.fillStyle = '#fffbe6'; g.fillRect(x - 10, 12, 20, 8);
    }
    // crowd
    const cols = ['#e74c3c', '#f1c40f', '#3498db', '#ecf0f1', '#9b59b6', '#1abc9c'];
    for (let i = 0; i < 260; i++) {
      g.fillStyle = cols[i % cols.length]; g.globalAlpha = 0.35 + (i % 3) * 0.12;
      g.beginPath(); g.arc((i * 37.7) % W, 58 + ((i * 13) % 36), 2.2, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#123'; g.fillRect(0, 96, W, 6);
    // grass with mowing stripes and a gentle vignette
    for (let y = 102, i = 0; y < H; y += 34, i++) { g.fillStyle = i % 2 ? '#1f7a3a' : '#238c43'; g.fillRect(0, y, W, 34); }
    const vg = g.createRadialGradient(W / 2, 430, 120, W / 2, 430, 460);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)');
    g.fillStyle = vg; g.fillRect(0, 102, W, H - 102);
    // boundary rope
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(W / 2, 520, 230, 410, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
    // inner circle
    g.setLineDash([4, 6]); g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(W / 2, 470, 150, 250, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); g.setLineDash([]);
    // fielders
    for (const [fx, fy] of [[70, 230], [330, 210], [200, 140], [110, 380], [300, 360], [40, 520], [360, 500]]) {
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(fx, fy + 6, 6, 2.5, 0, 0, 7); g.fill();
      g.fillStyle = '#e8eef5'; rr(g, fx - 3, fy - 8, 6, 12, 2); g.fill();
      g.fillStyle = '#2d3436'; g.beginPath(); g.arc(fx, fy - 11, 3, 0, 7); g.fill();
    }
    // pitch with a worn strip down the middle
    const a = proj(-1.25, -0.06), b = proj(1.25, -0.06), cc = proj(1.25, 1.12), d = proj(-1.25, 1.12);
    const pg = g.createLinearGradient(0, a.y, 0, d.y);
    pg.addColorStop(0, '#b8955c'); pg.addColorStop(1, '#d4b47a');
    g.fillStyle = pg;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(cc.x, cc.y); g.lineTo(d.x, d.y); g.closePath(); g.fill();
    const m1 = proj(-0.4, 0.1), m2 = proj(0.4, 0.1), m3 = proj(0.4, 0.95), m4 = proj(-0.4, 0.95);
    g.fillStyle = 'rgba(120,85,40,0.18)';
    g.beginPath(); g.moveTo(m1.x, m1.y); g.lineTo(m2.x, m2.y); g.lineTo(m3.x, m3.y); g.lineTo(m4.x, m4.y); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.5;
    for (const dd of [0, 1]) {
      const l = proj(-1.15, dd), r = proj(1.15, dd);
      g.beginPath(); g.moveTo(l.x, l.y); g.lineTo(r.x, r.y); g.stroke();
    }
    drawStumps(g, proj(0, -0.02), 0.45, false);
    return c;
  }

  function drawStumps(c, p, s, scattered) {
    c.strokeStyle = '#f3e3b5'; c.lineWidth = 2.5 * s; c.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      c.save(); c.translate(p.x + i * 8 * s, p.y);
      if (scattered) c.rotate(i * 0.6 + 0.2);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -STUMP_H * s); c.stroke();
      c.restore();
    }
  }

  function drawBowler(t) {
    let y = 150, arm = 0;
    if (M.state === 'runup') { const p = (t - M.runStart) / 650; y = lerp(70, 150, p); arm = p > 0.75 ? (p - 0.75) * 4 : 0; }
    else if (M.state !== 'ball' && M.state !== 'shot') y = 80;
    const x = W / 2 - 14;
    const jersey = M.inn === 1 ? '#1f5fbf' : M.opp.color;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y + 2, 9, 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#eee'; rr(ctx, x - 5, y - 12, 4, 13, 2); ctx.fill(); rr(ctx, x + 1, y - 12, 4, 13, 2); ctx.fill();
    ctx.fillStyle = jersey; rr(ctx, x - 6, y - 26, 12, 16, 3); ctx.fill();
    ctx.fillStyle = '#2d3436'; ctx.beginPath(); ctx.arc(x, y - 30, 5, 0, 7); ctx.fill();
    ctx.strokeStyle = jersey; ctx.lineWidth = 3; ctx.lineCap = 'round';
    const a = -Math.PI / 2 + arm * Math.PI;
    ctx.beginPath(); ctx.moveTo(x, y - 23); ctx.lineTo(x + Math.cos(a) * 14, y - 23 + Math.sin(a) * 14); ctx.stroke();
  }

  function drawBatter(t) {
    const bx = W / 2 + 26, by = PY1 + 8;
    drawStumps(ctx, proj(0, 1), 1, M.state === 'shot' && M.shot && M.shot.bowled);
    const jersey = M.inn === 2 ? '#1f5fbf' : M.opp.color;
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(bx, by + 4, 18, 5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#f5f5f5'; rr(ctx, bx - 11, by - 26, 9, 28, 3); ctx.fill(); rr(ctx, bx + 2, by - 26, 9, 28, 3); ctx.fill();
    ctx.fillStyle = jersey; rr(ctx, bx - 13, by - 58, 26, 34, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; rr(ctx, bx - 13, by - 58, 8, 34, 6); ctx.fill();
    ctx.fillStyle = '#0d2a5c'; ctx.beginPath(); ctx.arc(bx, by - 66, 10, 0, 7); ctx.fill();
    ctx.fillStyle = '#c9d6e3'; ctx.fillRect(bx - 8, by - 66, 16, 2);
    const sp = clamp((t - M.swingAt) / 180, 0, 1);
    const amt = sp < 1 ? Math.sin(sp * Math.PI / 2) : (t - M.swingAt < 600 ? 1 : Math.max(0, 1 - (t - M.swingAt - 600) / 300));
    ctx.save(); ctx.translate(bx - 12, by - 40); ctx.rotate(lerp(1.95, -1.7, amt));
    ctx.fillStyle = '#7a5a2e'; rr(ctx, -3, 0, 6, 12, 2); ctx.fill();
    ctx.fillStyle = '#f0d9a8'; rr(ctx, -6, 12, 12, 40, 4); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(1, 14, 4, 36);
    ctx.restore();
  }

  function drawBallSprite(x, y, r, color) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, '#fff'); g.addColorStop(0.35, color); g.addColorStop(1, '#5a0d0d');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }

  function drawBall(t) {
    const b = M.ball;
    if (!b || (M.state !== 'ball' && M.state !== 'shot')) return;
    if (M.state === 'shot' && !M.shot.miss) {
      const sh = M.shot, p = clamp((t - sh.start) / (sh.end - sh.start - 300), 0, 1), e = 1 - (1 - p) * (1 - p);
      const x = sh.from.x + Math.cos(sh.ang) * sh.dist * e, y = sh.from.y + Math.sin(sh.ang) * sh.dist * e;
      const h = sh.from.h * (1 - e) + sh.peak * 4 * e * (1 - e), s = lerp(1, 0.55, e);
      trail.push([x, y - h]); if (trail.length > 10) trail.shift();
      for (let i = 0; i < trail.length; i++) {
        ctx.globalAlpha = i / trail.length * 0.35; ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(trail[i][0], trail[i][1], 3 * s, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y, 5 * s, 2 * s, 0, 0, 7); ctx.fill();
      drawBallSprite(x, y - h, (5 + h / 60) * s, '#d63b2b');
      if (sh.res === 'W' && sh.q > 0) {
        const fx = sh.from.x + Math.cos(sh.ang) * sh.dist, fy = sh.from.y + Math.sin(sh.ang) * sh.dist;
        ctx.fillStyle = M.inn === 1 ? '#1f5fbf' : M.opp.color; rr(ctx, fx - 4, fy - 12, 8, 14, 2); ctx.fill();
        ctx.fillStyle = '#2d3436'; ctx.beginPath(); ctx.arc(fx, fy - 16, 4, 0, 7); ctx.fill();
      }
      return;
    }
    if (M.state === 'shot' && M.shot.bowled) b.d = 1;
    const d = b.d, p = proj(lerp(b.r0, b.L, d), d), h = ballH(b, d) * p.s;
    if (M.inn === 2 && M.state === 'ball' && d > 0.35 && d < 1 && UI.settings().ring) {
      const c = proj(b.L, 1), ch = ballH(b, 1);
      ctx.strokeStyle = `rgba(255,255,255,${(d - 0.35) * 1.2})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(c.x, c.y - ch, 9 + 70 * (1 - d), 0, 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(245,197,24,0.85)';
      ctx.beginPath(); ctx.arc(c.x, c.y - ch, 9, 0, 7); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 5 * p.s, 2 * p.s, 0, 0, 7); ctx.fill();
    drawBallSprite(p.x, p.y - h, 5.5 * p.s + 1, b.type === 'slower' ? '#e88f8f' : '#d63b2b');
  }

  function drawHUD(t) {
    const s = cur();
    rr(ctx, 12, 10, W - 24, 74, 14); ctx.fillStyle = 'rgba(8,20,40,0.85)'; ctx.fill();
    if (M.inn === 1) {
      text(`${M.opp.name}`, 28, 32, 15, '#9fb3d1', 'left', 700);
      text(`${s.runs}/${s.wk}`, 28, 60, 26, '#fff', 'left', 800);
      text(`Over ${Math.floor(s.balls / 6) + 1} of ${OVERS}`, W - 28, 32, 13, '#9fb3d1', 'right', 600);
      text(M.bowler ? `🏏 ${M.bowler.name}` : 'Pick a bowler', W - 28, 60, 15, '#f5c518', 'right', 700);
    } else {
      const need = Math.max(M.target - s.runs, 0), left = BALLS - s.balls;
      const p = M.batOrder[Math.min(s.wk, WKTS - 1)];
      text(`Need ${need} off ${left}`, 28, 32, 22, '#fff', 'left', 800);
      const icons = SIGNATURES[p.sig].icon + Object.entries(p.traits).filter(([k, v]) => v && TRAITS[k].kind === 'bat').map(([k]) => TRAITS[k].icon).join('');
      text(`${p.name} ${icons}`, 28, 62, 13, '#9fb3d1', 'left', 600);
      text(`${s.runs}/${s.wk}`, W - 28, 32, 22, '#f5c518', 'right', 800);
      for (let i = 0; i < WKTS; i++) {
        ctx.fillStyle = i < WKTS - s.wk ? '#2ecc71' : '#555';
        ctx.beginPath(); ctx.arc(W - 54 + i * 12, 62, 4.5, 0, 7); ctx.fill();
      }
    }
    // last six balls
    const st = Math.floor((s.log.length - (s.log.length % 6 === 0 && s.log.length ? 6 : s.log.length % 6)) / 1);
    for (let i = 0; i < 6; i++) {
      const r = s.log[st + i], x = W / 2 - 105 + i * 42, y = M.inn === 2 ? H - 70 : 118;
      ctx.beginPath(); ctx.arc(x, y, 14, 0, 7);
      ctx.fillStyle = r === undefined ? 'rgba(255,255,255,0.12)' : r === 'W' ? '#c0392b' : r === 6 ? '#8e44ad' : r === 4 ? '#2980b9' : 'rgba(255,255,255,0.88)';
      ctx.fill();
      if (r !== undefined) text(r === 0 ? '•' : String(r), x, y + 1, 13, r === 'W' || r === 6 || r === 4 ? '#fff' : '#1a1a1a');
    }
    if (M.inn === 2) {
      text('◀ LEFT', 50, H - 28, 13, 'rgba(255,255,255,0.6)');
      text('STRAIGHT', W / 2, H - 28, 13, 'rgba(255,255,255,0.6)');
      text('RIGHT ▶', W - 50, H - 28, 13, 'rgba(255,255,255,0.6)');
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
      for (const x of [W / 3, W * 2 / 3]) { ctx.beginPath(); ctx.moveTo(x, H - 45); ctx.lineTo(x, H - 12); ctx.stroke(); }
      if (s.balls === 0 && M.state !== 'shot') text('Tap as the ball reaches the yellow ring', W / 2, 108, 14, '#fff', 'center', 600);
    }
    if (M.state === 'shot') {
      const sh = M.shot, p = clamp((t - sh.start) / 250, 0, 1);
      const col = sh.res === 6 ? '#f5c518' : sh.res === 4 ? '#5dade2' : sh.res === 'W' ? '#ff6b6b' : '#fff';
      ctx.save(); ctx.translate(W / 2, 300); ctx.scale(0.6 + p * 0.4, 0.6 + p * 0.4); ctx.globalAlpha = p;
      ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 10;
      text(sh.label, 0, 0, sh.res === 6 || sh.res === 4 ? 54 : 38, col, 'center', 900);
      ctx.shadowBlur = 0;
      text(sh.sub, 0, 44, 16, '#fff', 'center', 600);
      ctx.restore();
    }
  }

  function frame() {
    if (!M) return;
    const t = now();
    update(t);
    if (!M) return;
    if (!fieldCache) fieldCache = buildField();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(fieldCache, 0, 0);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= 0.85; if (shake < 0.5) shake = 0; }
    drawBowler(t);
    const b = M.ball, inFront = !b || !M.shot || M.shot.miss;
    if (inFront && b && b.d < 1) drawBall(t);
    drawBatter(t);
    if (!inFront || (b && b.d >= 1)) drawBall(t);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    drawHUD(t);
    drawParticles();
    raf = requestAnimationFrame(frame);
  }

  function onDown(e) {
    if (!M) return;
    const r = cv.getBoundingClientRect();
    swing((e.clientX - r.left) / scale, now());
  }
  function onKey(e) {
    if (!M || M.inn !== 2) return;
    const map = { ArrowLeft: 0, ArrowUp: W / 2, ' ': W / 2, ArrowRight: W };
    if (e.key in map) { e.preventDefault(); swing(map[e.key], now()); }
  }

  return { init, start, stop, chooseDelivery, startChase, active: () => !!M };
})();
