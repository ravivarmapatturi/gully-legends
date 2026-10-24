// Gully Legends cricket engine — "Field Chess".
// Pure simulation: no DOM, no rendering, no storage. Runs in the browser and in Node
// (tests + balance simulator). Every random draw comes from a seeded generator stored in
// the match state, so the same config + the same decisions replay the same match.
//
// Core idea: each ball is a line+length delivery. The batter picks a zone and a shot type
// (ground or lofted). How easily that delivery goes into that zone ("affinity"), the skill
// match-up, and where the fielders stand decide the odds. See docs/ENGINE.md.
(function (root) {
  'use strict';
  const ENGINE_VERSION = '2.0.0';

  // ---------- Rules data ----------
  const FORMATS = {
    blitz: { key: 'blitz', name: 'Blitz', overs: 2, wickets: 3, maxOvers: 1 },
    t5:    { key: 't5',    name: 'T5',    overs: 5, wickets: 10, maxOvers: 2 },
    t10:   { key: 't10',   name: 'T10',   overs: 10, wickets: 10, maxOvers: 2 },
  };

  const PITCHES = {
    balanced: { name: 'Balanced',     icon: '⚖️', desc: 'Fair for bat and ball' },
    flat:     { name: 'Flat road',    icon: '🛣️', desc: 'Shots come off easier, more boundaries' },
    green:    { name: 'Green top',    icon: '🌿', desc: 'Pace bowlers move the ball more' },
    dusty:    { name: 'Dusty turner', icon: '🏜️', desc: 'Spinners turn it, lofted shots are risky' },
  };

  // 8 scoring zones. Angle in degrees: 0 = straight back past the bowler,
  // negative = leg side, positive = off side (right-handed batter).
  const ZONES = [
    { k: 'fine',    name: 'Fine Leg',   ang: -150 },
    { k: 'square',  name: 'Square Leg', ang: -95 },
    { k: 'midwkt',  name: 'Mid-Wicket', ang: -55 },
    { k: 'longon',  name: 'Long-On',    ang: -15 },
    { k: 'longoff', name: 'Long-Off',   ang: 15 },
    { k: 'cover',   name: 'Cover',      ang: 55 },
    { k: 'point',   name: 'Point',      ang: 95 },
    { k: 'third',   name: 'Third Man',  ang: 150 },
  ];
  const ZONE = Object.fromEntries(ZONES.map(z => [z.k, z]));

  const LINES = ['off', 'stumps', 'leg'];
  const LENGTHS = ['yorker', 'full', 'good', 'short'];
  const LINE_NAMES = { off: 'outside off', stumps: 'on the stumps', leg: 'down leg' };
  const LENGTH_NAMES = { yorker: 'Yorker', full: 'Full', good: 'Good length', short: 'Short' };

  // Where each delivery naturally goes: centre angle, spread, strength.
  const SHAPE = {
    'short/off':     [110, 60, 0.9],  'short/stumps':  [-90, 55, 0.9],  'short/leg':  [-120, 50, 0.95],
    'good/off':      [70, 60, 0.85],  'good/stumps':   [0, 90, 0.65],   'good/leg':   [-80, 60, 0.85],
    'full/off':      [35, 50, 0.95],  'full/stumps':   [0, 55, 0.95],   'full/leg':   [-45, 55, 0.95],
    'yorker/off':    [120, 50, 0.4],  'yorker/stumps': [0, 45, 0.35],   'yorker/leg': [-140, 45, 0.5],
  };

  // Field: 9 fielders (bowler and keeper are extra). Each zone can hold an inner
  // (ring) and/or a deep (boundary) fielder; 'slip' catches edges. Max 5 deep.
  const MAX_FIELDERS = 9, MAX_DEEP = 5;
  const FIELD_PRESETS = {
    attacking:  { name: 'Attacking',  slip: true,  inner: ['point', 'cover', 'longoff', 'longon', 'midwkt', 'square'], deep: ['fine', 'third'] },
    balanced:   { name: 'Balanced',   slip: false, inner: ['point', 'cover', 'longoff', 'longon', 'midwkt'], deep: ['fine', 'square', 'third', 'cover'] },
    defensive:  { name: 'Defensive',  slip: false, inner: ['point', 'cover', 'longoff', 'longon'], deep: ['fine', 'square', 'midwkt', 'cover', 'longon'] },
    offside:    { name: 'Off-side trap', slip: true, inner: ['point', 'cover', 'longoff', 'third'], deep: ['cover', 'longoff', 'point', 'fine'] },
    legside:    { name: 'Leg-side trap', slip: false, inner: ['square', 'midwkt', 'longon', 'cover'], deep: ['fine', 'square', 'midwkt', 'longon', 'third'] },
  };

  // Signature skills: one per player, passive, always on.
  const SIGNATURES = {
    helicopter: { name: 'Helicopter Shot', icon: '🚁', kind: 'bat',  desc: 'Lofted shots off full balls and yorkers come off far more often' },
    ramp:       { name: 'Ramp Shot',       icon: '🛹', kind: 'bat',  desc: 'Shots to Fine Leg and Third Man off short or good balls are much easier' },
    coolhead:   { name: 'Cool Head',       icon: '🧊', kind: 'bat',  desc: 'Ignores chase pressure; failed shots are less likely to be out' },
    wristy:     { name: 'Wristy Flicks',   icon: '🌊', kind: 'bat',  desc: 'Ground shots into the leg side are much easier' },
    toecrusher: { name: 'Toe Crusher',     icon: '🦶', kind: 'bowl', desc: 'Yorkers always land, and are even harder to score off' },
    mystery:    { name: 'Mystery Ball',    icon: '🎭', kind: 'bowl', desc: 'Batters struggle to read every delivery' },
    express:    { name: 'Express Pace',    icon: '🚀', kind: 'bowl', desc: 'Ground shots beat the field less often; short balls hurry batters' },
    golden:     { name: 'Golden Arm',      icon: '✨', kind: 'bowl', desc: 'Last ball of each over: mistakes are much more likely to be out' },
  };

  // Trait tokens: passive, any mix, max 5 per trait and 10 per player.
  const TRAITS = {
    power:    { name: 'Power Hitter',    icon: '💥', kind: 'bat',  desc: 'Lofted shots come off more and clear the rope' },
    timing:   { name: 'Timing Master',   icon: '🎯', kind: 'bat',  desc: 'Every shot is a little easier to play' },
    finisher: { name: 'Finisher',        icon: '🔥', kind: 'bat',  desc: 'Final overs: lofted shots much easier' },
    anchor:   { name: 'Anchor',          icon: '⚓', kind: 'bat',  desc: 'Mistakes are less likely to get you out' },
    pace:     { name: 'Pace Reader',     icon: '⚡', kind: 'bat',  desc: 'Shots against pace bowling are easier' },
    yorker:   { name: 'Yorker Specialist', icon: '🎳', kind: 'bowl', desc: 'Yorkers land more often and are harder to hit' },
    bouncer:  { name: 'Bouncer Brute',   icon: '🪨', kind: 'bowl', desc: 'Short balls are harder to score off' },
    slower:   { name: 'Line & Length',   icon: '📐', kind: 'bowl', desc: 'Deliveries land exactly where you aim' },
    swing:    { name: 'Swing King',      icon: '🌀', kind: 'bowl', desc: 'More edges, more catches behind' },
    death:    { name: 'Death Bowler',    icon: '☠️', kind: 'bowl', desc: 'Final overs: every shot is harder' },
  };

  // ---------- Helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sig = x => 1 / (1 + Math.exp(-x));
  const tl = (p, k) => (p.traits && p.traits[k]) || 0;
  const angDiff = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

  // mulberry32, state kept in the match so it serialises and replays. Outcomes use 'rng';
  // AI choices use their own 'ai' stream so replaying recorded decisions stays exact.
  function rand(st, stream = 'rng') {
    let t = (st[stream] = (st[stream] + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function pickW(st, weights, stream) {
    const total = weights.reduce((s, x) => s + x[1], 0);
    let r = rand(st, stream) * total;
    for (const [v, w] of weights) { r -= w; if (r <= 0) return v; }
    return weights[weights.length - 1][0];
  }

  function affinity(del, zone) {
    const [c, spread, base] = SHAPE[del.length + '/' + del.line];
    const d = angDiff(ZONE[zone].ang, c);
    let a = base * Math.exp(-(d / spread) * (d / spread)) + 0.08;
    if (del.fullToss) a = Math.min(1, a + 0.3);
    return clamp(a, 0, 1);
  }

  function batOverall(p) { return Math.round(0.3 * p.tech + 0.3 * p.power + 0.25 * p.place + 0.15 * p.temper); }
  function bowlOverall(p) { return p.kind === 'none' ? Math.round((p.acc + p.move) / 4) : Math.round(0.45 * p.acc + 0.55 * p.move); }
  function batSkill(p, type) {
    return type === 'lofted' ? 0.35 * p.tech + 0.45 * p.power + 0.2 * p.temper : 0.5 * p.tech + 0.3 * p.place + 0.2 * p.temper;
  }

  function normField(f) {
    return { slip: !!f.slip, inner: [...new Set(f.inner)], deep: [...new Set(f.deep)] };
  }
  function fieldError(f) {
    const n = f.inner.length + f.deep.length + (f.slip ? 1 : 0);
    if (n !== MAX_FIELDERS) return `Place exactly ${MAX_FIELDERS} fielders (you have ${n})`;
    if (f.deep.length > MAX_DEEP) return `At most ${MAX_DEEP} fielders on the boundary`;
    return null;
  }

  // ---------- Match setup ----------
  function snapshot(team) {
    const players = team.xi.map(p => JSON.parse(JSON.stringify(p)));
    return { id: team.id, name: team.name, color: team.color, players, order: players.map(p => p.id), user: !!team.user };
  }

  function createMatch(cfg) {
    const st = {
      engine: ENGINE_VERSION,
      seed: cfg.seed >>> 0, rng: cfg.seed >>> 0, ai: (cfg.seed ^ 0x9E3779B9) >>> 0,
      format: FORMATS[cfg.format], pitch: cfg.pitch || 'balanced',
      teams: [snapshot(cfg.teams[0]), snapshot(cfg.teams[1])],
      inn: 0, innings: [], target: null, result: null, events: [], decisions: [],
      firstBat: cfg.firstBat,
    };
    st.innings.push(newInnings(st, cfg.firstBat));
    return st;
  }

  function newInnings(st, batIdx) {
    const team = st.teams[batIdx], bowlTeam = st.teams[1 - batIdx];
    const batStats = {}, bowlStats = {};
    for (const p of team.players) batStats[p.id] = { r: 0, b: 0, f: 0, s: 0, out: null, batted: false };
    for (const p of bowlTeam.players) bowlStats[p.id] = { balls: 0, r: 0, w: 0, dots: 0 };
    const inn = {
      bat: batIdx, runs: 0, wkts: 0, balls: 0, extras: 0,
      striker: team.order[0], nonStriker: team.order[1], next: 2,
      bowler: null, lastBowler: null, overs: {}, batStats, bowlStats,
      field: normField(FIELD_PRESETS.balanced), freeHit: false, pending: null, fow: [],
    };
    batStats[inn.striker].batted = batStats[inn.nonStriker].batted = true;
    return inn;
  }

  const cur = st => st.innings[st.inn];
  const batTeam = st => st.teams[cur(st).bat];
  const bowlTeam = st => st.teams[1 - cur(st).bat];
  const player = (st, id) => st.teams[0].players.find(p => p.id === id) || st.teams[1].players.find(p => p.id === id);
  const wktLimit = st => Math.min(st.format.wickets, batTeam(st).players.length - 1);
  const ballsLeft = st => st.format.overs * 6 - cur(st).balls;
  const deathOvers = st => cur(st).balls >= st.format.overs * 6 * 0.7;

  // ---------- Bowling side: bowler + field ----------
  function needBowler(st) { return !st.result && cur(st).bowler === null; }
  function eligibleBowlers(st) {
    const inn = cur(st);
    return bowlTeam(st).players
      .filter(p => p.id !== inn.lastBowler && (inn.overs[p.id] || 0) < st.format.maxOvers)
      .sort((a, b) => bowlOverall(b) - bowlOverall(a));
  }
  function setBowler(st, id) {
    if (!eligibleBowlers(st).some(p => p.id === id)) throw new Error('Bowler not eligible: ' + id);
    cur(st).bowler = id;
    st.decisions.push({ t: 'bowler', id });
  }
  function setField(st, field) {
    const f = normField(field), err = fieldError(f);
    if (err) throw new Error(err);
    cur(st).field = f;
    st.decisions.push({ t: 'field', field: f });
  }

  // ---------- Step 1: the delivery ----------
  // The bowling side aims a line+length. Accuracy decides where it actually lands.
  function deliver(st, aim) {
    const inn = cur(st);
    if (st.result) throw new Error('Match is over');
    if (inn.bowler === null) throw new Error('Choose a bowler first');
    if (inn.pending) throw new Error('Ball already bowled; play a shot');
    if (!LINES.includes(aim.line) || !LENGTHS.includes(aim.length)) throw new Error('Bad delivery');
    st.decisions.push({ t: 'deliver', line: aim.line, length: aim.length });
    const b = player(st, inn.bowler);

    // Extras first.
    const pExtra = clamp(0.065 - b.acc / 1600, 0.01, 0.065) + (aim.length === 'short' ? 0.015 : 0);
    const er = rand(st);
    if (er < pExtra * 0.65) return finishWide(st, aim);
    const noBall = er < pExtra;

    let line = aim.line, length = aim.length, fullToss = false;
    const hitP = b.sig === 'toecrusher' && length === 'yorker' ? 1 : clamp(0.5 + b.acc / 200 + tl(b, 'slower') * 0.03 + (length === 'yorker' ? -0.08 + tl(b, 'yorker') * 0.03 : 0), 0.55, 0.98);
    if (rand(st) > hitP) {
      if (rand(st) < 0.5) {
        const i = LENGTHS.indexOf(length);
        if (length === 'yorker') fullToss = true;
        else length = LENGTHS[clamp(i + (rand(st) < 0.5 ? -1 : 1), 1, 3)];
      } else {
        const i = LINES.indexOf(line);
        line = LINES[clamp(i + (rand(st) < 0.5 ? -1 : 1), 0, 2)];
      }
    }
    inn.pending = { line, length, fullToss, noBall, aimed: aim, missed: line !== aim.line || length !== aim.length || fullToss };
    return inn.pending;
  }

  function finishWide(st, aim) {
    const inn = cur(st), b = player(st, inn.bowler);
    const ev = baseEvent(st);
    Object.assign(ev, { outcome: 'WD', extra: 1, delivery: { line: aim.line, length: aim.length, fullToss: false } });
    inn.runs += 1; inn.extras += 1; inn.bowlStats[b.id].r += 1;
    finishEvent(st, ev, false);
    return { wide: true, event: ev };
  }

  function baseEvent(st) {
    const inn = cur(st);
    return { n: st.events.length, inn: st.inn, over: Math.floor(inn.balls / 6), ballInOver: inn.balls % 6 + 1,
             bowler: inn.bowler, batter: inn.striker, outcome: null, runs: 0, extra: 0, how: null };
  }

  // ---------- Step 2: the shot ----------
  // Full outcome distribution for a shot. shot: { zone, type: 'ground'|'lofted' } or { type: 'defend' }.
  function shotOdds(st, shot, del) {
    del = del || cur(st).pending;
    const inn = cur(st), bat = player(st, inn.striker), bowl = player(st, inn.bowler);
    const f = inn.field, why = [];
    const P = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 6: 0, W: 0 };
    const stumps = del.line === 'stumps' && del.length !== 'short';

    if (shot.type === 'defend') {
      let w = stumps ? 0.05 : 0.015;
      if (del.length === 'yorker' && !del.fullToss) w += 0.03;
      w *= 1 - batSkill(bat, 'ground') / 200;
      if (inn.freeHit || del.noBall) w = 0;
      P.W = w; P[1] = 0.12; P[0] = 1 - w - 0.12;
      return { P, control: 1 - w, ev: 0.12, risk: w, why: [['Defensive shot: safe, rarely scores', 0]] };
    }

    const z = shot.zone, lofted = shot.type === 'lofted';
    const aff = affinity(del, z);
    let bowlS = bowlOverall(bowl);
    if (st.pitch === 'green' && bowl.kind === 'pace') bowlS += 8;
    if (st.pitch === 'dusty' && bowl.kind === 'spin') bowlS += 8;
    const batS = batSkill(bat, shot.type);

    let x = (batS - bowlS) / 22 + 2.6 * aff - 1.0 - (lofted ? 0.5 : 0);
    why.push([`This ball into ${ZONE[z].name}: ${aff > 0.6 ? 'natural' : aff > 0.3 ? 'possible' : 'against the ball'}`, 2.6 * aff - 1.3]);
    why.push([`Skill ${Math.round(batS)} vs bowling ${Math.round(bowlS)}`, (batS - bowlS) / 22]);
    if (bat.fav && bat.fav.includes(z)) { x += 0.35; why.push(['Favourite zone', 0.35]); }

    if (st.pitch === 'flat') { x += 0.15; why.push(['Flat pitch', 0.15]); }
    if (st.pitch === 'dusty' && lofted) { x -= 0.1; why.push(['Dusty pitch: lofting is risky', -0.1]); }

    // Batter traits and signature.
    const tt = tl(bat, 'timing'), tp = tl(bat, 'power'), tf = tl(bat, 'finisher'), tpr = tl(bat, 'pace');
    if (tt) { x += tt * 0.06; why.push([`Timing Master ×${tt}`, tt * 0.06]); }
    if (tp && lofted) { x += tp * 0.05; why.push([`Power Hitter ×${tp}`, tp * 0.05]); }
    if (tf && lofted && deathOvers(st)) { x += tf * 0.1; why.push([`Finisher ×${tf}`, tf * 0.1]); }
    if (tpr && bowl.kind === 'pace') { x += tpr * 0.06; why.push([`Pace Reader ×${tpr}`, tpr * 0.06]); }
    if (bat.sig === 'helicopter' && lofted && (del.length === 'full' || del.length === 'yorker')) { x += 0.6; why.push(['🚁 Helicopter Shot', 0.6]); }
    if (bat.sig === 'ramp' && (z === 'fine' || z === 'third') && (del.length === 'short' || del.length === 'good')) { x += 0.6; why.push(['🛹 Ramp Shot', 0.6]); }
    if (bat.sig === 'wristy' && !lofted && ZONE[z].ang < 0) { x += 0.5; why.push(['🌊 Wristy Flicks', 0.5]); }

    // Bowler traits and signature.
    if (del.length === 'yorker' && !del.fullToss) { x -= tl(bowl, 'yorker') * 0.06; if (bowl.sig === 'toecrusher') { x -= 0.3; why.push(['🦶 Toe Crusher', -0.3]); } }
    if (del.length === 'short' && tl(bowl, 'bouncer')) { x -= tl(bowl, 'bouncer') * 0.06; why.push([`Bouncer Brute ×${tl(bowl, 'bouncer')}`, -tl(bowl, 'bouncer') * 0.06]); }
    if (tl(bowl, 'death') && deathOvers(st)) { x -= tl(bowl, 'death') * 0.06; why.push([`Death Bowler ×${tl(bowl, 'death')}`, -tl(bowl, 'death') * 0.06]); }
    if (bowl.sig === 'mystery') { x -= 0.3; why.push(['🎭 Mystery Ball', -0.3]); }
    if (bowl.sig === 'express' && del.length === 'short') { x -= 0.2; why.push(['🚀 Express Pace', -0.2]); }
    if (del.fullToss) why.push(['Full toss!', 0.4]);

    // Chase pressure.
    if (st.target && bat.sig !== 'coolhead') {
      const need = st.target - inn.runs, left = ballsLeft(st), rrr = left > 0 ? need / left * 6 : 99;
      const p = clamp((rrr - 9) / 8, 0, 1) * (1 - bat.temper / 140);
      if (p > 0.02) { x -= p * 0.6; why.push([`Pressure: need ${need} off ${left}`, -p * 0.6]); }
    }

    const control = sig(x);

    // Failure: mistimed.
    const inner = f.inner.includes(z), deep = f.deep.includes(z);
    let failW;
    if (lofted) failW = inner || deep ? 0.5 : 0.15;
    else {
      const offEdge = del.line === 'off' && ZONE[z].ang > 0;
      failW = (offEdge ? 0.15 : 0.06) * (f.slip ? 1.8 : 1) + (stumps ? 0.2 : 0);
    }
    failW += tl(bowl, 'swing') * 0.02;
    failW *= 1 - tl(bat, 'anchor') * 0.08;
    if (bat.sig === 'coolhead') failW *= 0.7;
    if (bowl.sig === 'golden' && inn.balls % 6 === 5) failW *= 1.8;
    failW = clamp(failW, 0, 0.8);
    if (inn.freeHit || del.noBall) failW = 0;
    const fail = 1 - control;
    P.W += fail * failW;
    const failRest = fail * (1 - failW);
    if (lofted) { P[0] += failRest * 0.6; P[1] += failRest * 0.3; P[2] += failRest * 0.1; }
    else { P[0] += failRest * 0.85; P[1] += failRest * 0.15; }

    // Success: depends on the field in that zone.
    const place = bat.place / 100, power = bat.power;
    let boundaryKill = 0;
    if (bowl.sig === 'express') boundaryKill += 0.15;
    if (st.pitch === 'flat') boundaryKill -= 0.1;
    if (!lofted) {
      if (inner) { P[0] += control * (0.55 - place * 0.3); P[1] += control * (0.45 + place * 0.3); }
      else if (deep) { P[1] += control * (0.65 - place * 0.3); P[2] += control * (0.35 + place * 0.3); }
      else {
        const four = clamp(0.35 + power * 0.002 + place * 0.4 - boundaryKill, 0.1, 0.9);
        P[4] += control * four; P[2] += control * (1 - four) * 0.7; P[3] += control * (1 - four) * 0.3;
      }
    } else {
      const six = clamp(sig((power - 65) / 10) * 0.75 + tl(bat, 'power') * 0.03 - (st.pitch === 'dusty' ? 0.05 : 0), 0.05, 0.95);
      if (deep) {
        const caught = clamp(0.3 - power / 500, 0.08, 0.3);
        P.W += control * caught;
        P[6] += control * (1 - caught) * six * 0.5;
        P[1] += control * (1 - caught) * (1 - six * 0.5) * 0.5;
        P[2] += control * (1 - caught) * (1 - six * 0.5) * 0.5;
      } else {
        P[6] += control * six; P[4] += control * (1 - six);
      }
    }
    if (inn.freeHit || del.noBall) { P[0] += P.W; P.W = 0; }
    const ev = P[1] + 2 * P[2] + 3 * P[3] + 4 * P[4] + 6 * P[6];
    return { P, control, ev, risk: P.W, why };
  }

  function play(st, shot) {
    const inn = cur(st);
    if (!inn.pending) throw new Error('No delivery to play');
    if (shot.type !== 'defend' && !(ZONE[shot.zone] && (shot.type === 'ground' || shot.type === 'lofted'))) throw new Error('Bad shot');
    st.decisions.push({ t: 'shot', zone: shot.zone || null, type: shot.type });
    const del = inn.pending, bat = player(st, inn.striker), bowl = player(st, inn.bowler);
    const { P } = shotOdds(st, shot, del);
    const outcome = pickW(st, ['0', '1', '2', '3', '4', '6', 'W'].filter(o => P[o] > 0).map(o => [o, P[o]]));
    inn.pending = null;

    const ev = baseEvent(st);
    Object.assign(ev, { delivery: { line: del.line, length: del.length, fullToss: del.fullToss }, missed: del.missed,
                        shot: { zone: shot.zone || null, type: shot.type }, freeHit: inn.freeHit });
    const bs = inn.batStats[bat.id], ws = inn.bowlStats[bowl.id];

    if (del.noBall) {
      const r = outcome === 'W' ? 0 : +outcome;
      Object.assign(ev, { outcome: 'NB', runs: r, extra: 1, hit: outcome });
      inn.runs += r + 1; inn.extras += 1; bs.r += r; bs.b++; ws.r += r + 1;
      if (r === 4) bs.f++; if (r === 6) bs.s++;
      if (r % 2 === 1) swap(inn);
      inn.freeHit = true;
      finishEvent(st, ev, false);
      return ev;
    }

    inn.freeHit = false;
    inn.balls++; bs.b++; ws.balls++;
    if (outcome === 'W') {
      ev.outcome = 'W';
      ev.how = dismissal(st, shot, del);
      ev.dismissed = bat.id;
      inn.wkts++; ws.dots++;
      if (ev.how !== 'run out') ws.w++;
      bs.out = ev.how === 'run out' ? 'run out' : ev.how === 'caught' ? `c ${fielderName(shot)} b ${bowl.name}` : `${ev.how} b ${bowl.name}`;
      inn.fow.push(`${inn.runs}-${inn.wkts}`);
      if (inn.wkts < wktLimit(st) && inn.next < batTeam(st).players.length) {
        inn.striker = batTeam(st).order[inn.next++];
        inn.batStats[inn.striker].batted = true;
      }
    } else {
      const r = +outcome;
      Object.assign(ev, { outcome, runs: r });
      inn.runs += r; bs.r += r; ws.r += r;
      if (r === 4) bs.f++; if (r === 6) bs.s++;
      if (r === 0) ws.dots++;
      if (r % 2 === 1) swap(inn);
    }
    finishEvent(st, ev, true);
    return ev;
  }

  function fielderName(shot) {
    if (shot.type === 'defend') return 'keeper';
    if (shot.type === 'ground') return shot.zone === 'point' || shot.zone === 'cover' || shot.zone === 'third' ? 'slip' : 'keeper';
    return ZONE[shot.zone].name;
  }
  function dismissal(st, shot, del) {
    if (shot.type === 'lofted') return 'caught';
    if (shot.type === 'defend') return del.line === 'stumps' ? pickW(st, [['bowled', 5], ['lbw', 4], ['caught', 1]]) : 'caught';
    const stumps = del.line === 'stumps' && del.length !== 'short';
    return pickW(st, [['caught', 6], ['bowled', stumps ? 5 : 0.5], ['lbw', stumps ? 4 : 0.5], ['run out', 1]]);
  }
  function swap(inn) { const t = inn.striker; inn.striker = inn.nonStriker; inn.nonStriker = t; }

  function finishEvent(st, ev, legal) {
    const inn = cur(st);
    ev.score = `${inn.runs}/${inn.wkts}`;
    ev.text = commentary(st, ev);
    st.events.push(ev);
    if (legal && inn.balls % 6 === 0) {
      inn.overs[inn.bowler] = (inn.overs[inn.bowler] || 0) + 1;
      inn.lastBowler = inn.bowler; inn.bowler = null;
      swap(inn);
    }
    const done = inn.wkts >= wktLimit(st) || inn.balls >= st.format.overs * 6 || (st.target !== null && inn.runs >= st.target);
    if (done) endInnings(st);
  }

  function endInnings(st) {
    const inn = cur(st);
    inn.bowler = null; inn.pending = null;
    if (st.inn === 0) {
      st.target = inn.runs + 1;
      st.inn = 1;
      st.innings.push(newInnings(st, 1 - inn.bat));
      return;
    }
    const first = st.innings[0], second = st.innings[1];
    const t1 = st.teams[first.bat], t2 = st.teams[second.bat];
    if (second.runs >= st.target) {
      const w = wktLimit(st) - second.wkts;
      st.result = { winner: second.bat, text: `${t2.name} won by ${w} wicket${w === 1 ? '' : 's'}` };
    } else if (second.runs === st.target - 1) {
      st.result = { winner: null, text: 'Match tied' };
    } else {
      const r = st.target - 1 - second.runs;
      st.result = { winner: first.bat, text: `${t1.name} won by ${r} run${r === 1 ? '' : 's'}` };
    }
  }

  // ---------- Commentary ----------
  function delText(d) { return d.fullToss ? 'full toss' : `${LENGTH_NAMES[d.length].toLowerCase()} ball ${LINE_NAMES[d.line]}`; }
  function commentary(st, ev) {
    const b = player(st, ev.batter), w = player(st, ev.bowler);
    const bn = b.name.split(' ')[0], wn = w.name.split(' ')[0];
    const pickS = arr => arr[(ev.n * 7 + ev.over) % arr.length];
    if (ev.outcome === 'WD') return `Wide from ${wn}. One extra.`;
    const d = delText(ev.delivery), zn = ev.shot && ev.shot.zone ? ZONE[ev.shot.zone].name : '';
    const lofted = ev.shot && ev.shot.type === 'lofted';
    switch (ev.outcome) {
      case 'NB': return `No-ball! ${bn} gets ${ev.runs} off it. Free hit next.`;
      case 'W':
        if (ev.how === 'run out') return `${bn} pushes to ${zn} and is run out!`;
        if (ev.how === 'caught') return lofted ? pickS([`OUT! ${bn} goes over ${zn} and is caught in the deep.`, `${bn} skies it towards ${zn}. Taken!`])
                                              : `Edged! ${bn} nicks a ${d} and it's caught.`;
        return pickS([`OUT! ${cap(ev.how)}. ${wn}'s ${d} beats ${bn}.`, `${wn} gets ${bn}, ${ev.how}!`]);
      case '6': return pickS([`SIX! ${bn} lifts the ${d} over ${zn}.`, `Massive hit over ${zn} by ${bn}!`]);
      case '4': return pickS([`FOUR! ${bn} finds the gap at ${zn}.`, `${bn} threads it through ${zn} for four.`]);
      case '0': return ev.shot && ev.shot.type === 'defend' ? `${bn} defends the ${d}.` : pickS([`${bn} goes for ${zn}, can't beat the field.`, `Dot ball. ${wn}'s ${d} is well bowled.`]);
      default: return `${bn} works it to ${zn} for ${ev.runs}.`;
    }
  }
  const cap = s => s[0].toUpperCase() + s.slice(1);

  // ---------- AI ----------
  // Batter: best expected runs minus a wicket cost that depends on the situation.
  function wicketCost(st, tactic = 1) {
    const inn = cur(st), left = ballsLeft(st), wl = wktLimit(st) - inn.wkts;
    let c = clamp(left / Math.max(wl, 1) * 1.1, 1.5, 25) * tactic;
    if (st.target) { const need = st.target - inn.runs; c *= clamp(1.4 - need / Math.max(left, 1) / 2, 0.15, 1.4); }
    return c;
  }
  const ALL_SHOTS = [{ type: 'defend' }].concat(...ZONES.map(z => [{ zone: z.k, type: 'ground' }, { zone: z.k, type: 'lofted' }]));
  function bestShot(st, del, tactic = 1) {
    const c = wicketCost(st, tactic), inn = cur(st);
    const need = st.target ? st.target - inn.runs : null;
    let best = ALL_SHOTS[0], bestV = -1e9;
    for (const s of ALL_SHOTS) {
      const o = shotOdds(st, s, del);
      let v = o.ev - o.risk * c;
      if (need !== null && need <= 6 && ballsLeft(st) <= 1) v = (need <= 4 ? o.P[4] + o.P[6] : o.P[6]) - o.risk * 0.1; // last ball: go for it
      if (v > bestV) { bestV = v; best = s; }
    }
    return { shot: best, value: bestV };
  }
  // Bowler: pick the line+length whose best batter reply is worst for the batter.
  function bestDelivery(st, rnd = true) {
    const scored = [];
    for (const length of LENGTHS) for (const line of LINES) {
      const v = bestShot(st, { line, length, fullToss: false }).value;
      scored.push([{ line, length }, v]);
    }
    if (!rnd) return scored.sort((a, b) => a[1] - b[1])[0][0];
    // Softmin so the AI is good but not perfectly predictable.
    const m = Math.min(...scored.map(s => s[1]));
    return pickW(st, scored.map(([d, v]) => [d, Math.exp(-(v - m) * 4)]), 'ai');
  }
  function bestField(st) {
    // Late in a chase or the death: protect the boundary. Early / new batter: attack.
    const inn = cur(st), bs = inn.batStats[inn.striker];
    if (deathOvers(st)) return FIELD_PRESETS.defensive;
    if (bs.b < 4 || inn.balls < 6) return FIELD_PRESETS.attacking;
    const p = player(st, inn.striker);
    if (p.fav && p.fav.every(z => ZONE[z].ang < 0)) return FIELD_PRESETS.legside;
    if (p.fav && p.fav.every(z => ZONE[z].ang > 0)) return FIELD_PRESETS.offside;
    return FIELD_PRESETS.balanced;
  }
  function aiBowler(st) {
    const el = eligibleBowlers(st);
    if (!el.length) throw new Error('No eligible bowler');
    return deathOvers(st) ? el[0].id : pickW(st, el.map((p, i) => [p.id, Math.max(1, bowlOverall(p) - i * 8)]), 'ai');
  }

  // One full ball with AI deciding for whichever sides are automatic.
  function autoBall(st, tactics = {}) {
    if (needBowler(st)) { setBowler(st, aiBowler(st)); setField(st, bestField(st)); }
    const d = deliver(st, bestDelivery(st));
    if (d.wide) return d.event;
    return play(st, bestShot(st, d, tactics[cur(st).bat] || 1).shot);
  }
  function simulate(st, tactics = {}, until = () => false) {
    while (!st.result && !until(st)) autoBall(st, tactics);
    return st;
  }
  function replay(cfg, decisions) {
    const st = createMatch(cfg);
    for (const d of decisions) {
      if (d.t === 'bowler') setBowler(st, d.id);
      else if (d.t === 'field') setField(st, d.field);
      else if (d.t === 'deliver') deliver(st, d);
      else play(st, d.type === 'defend' ? { type: 'defend' } : { zone: d.zone, type: d.type });
    }
    return st;
  }

  const api = {
    ENGINE_VERSION, FORMATS, PITCHES, ZONES, ZONE, LINES, LENGTHS, LINE_NAMES, LENGTH_NAMES,
    FIELD_PRESETS, MAX_FIELDERS, MAX_DEEP, SIGNATURES, TRAITS,
    createMatch, needBowler, eligibleBowlers, setBowler, setField, fieldError, normField,
    deliver, shotOdds, play, affinity, bestShot, bestDelivery, bestField, aiBowler, autoBall, simulate, replay,
    batOverall, bowlOverall, batSkill, cur, player, ballsLeft, wktLimit, rand, delText,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
