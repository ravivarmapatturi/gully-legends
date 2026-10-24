// Gully Legends app shell: saves, squad, training, league, match flow and panels.
// Outcomes come only from Engine (engine.js); Scene3D (scene3d.js) only animates them.
(() => {
  const E = window.Engine;
  const $ = id => document.getElementById(id);
  const SAVE_KEY = 'gullyLegends.v2';
  let S = null, Scene = null, sceneReady = null, viewing = null;

  // ---------- Save ----------
  function fresh() {
    return {
      v: 2, coins: 300, tp: 6, freeTrainDay: '', played: 0, wins: 0,
      settings: { sound: true, hq: true, format: 'blitz' },
      club: { name: 'Gully Legends XI', color: '#1f5fbf' },
      players: STARTER_SQUAD.map(starterPlayer),
      season: newSeason(5, 1, Date.now() % 100000),
      history: [],
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) { S = JSON.parse(raw); return; }
      const old = localStorage.getItem('gullyLegends.v1');
      S = fresh();
      if (old) { // carry coins and trait choices over from v0.1
        const o = JSON.parse(old);
        S.coins += o.coins || 0;
        for (const op of o.players || []) {
          const np = S.players.find(p => p.name === op.name);
          if (np) { np.traits = op.traits || {}; np.tokens = op.tokens || 2; }
        }
      }
    } catch (e) { S = fresh(); }
  }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }
  const today = () => new Date().toISOString().slice(0, 10);
  const used = p => Object.values(p.traits).reduce((a, b) => a + b, 0);
  const player = id => S.players.find(p => p.id === id);
  const xi = () => S.players.filter(p => p.inXI).sort((a, b) => a.order - b.order);

  function show(id) {
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
    window.scrollTo(0, 0);
  }

  // ---------- Sound ----------
  let ac;
  function snd(f, d, type = 'triangle', v = 0.08) {
    if (!S.settings.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(v, ac.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + d);
      o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + d);
    } catch (e) {}
  }
  const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

  // ---------- Home ----------
  function renderHome() {
    $('coins').textContent = S.coins;
    $('tp').textContent = S.tp;
    $('divName').textContent = S.season.div === 1 ? 'Premier' : 'Div ' + S.season.div;
    const sn = S.season;
    if (sn.over) {
      $('nextLabel').textContent = `Season ${sn.no} finished`;
      $('nextOpp').innerHTML = 'Check the league table to start the next season.';
      $('playBtn').textContent = '🏆 See final table';
    } else {
      const opp = nextOpponent();
      $('nextLabel').textContent = `Season ${sn.no} · ${DIVISIONS[sn.div].name} · Round ${sn.round + 1}/${sn.rounds.length}`;
      $('nextOpp').innerHTML = `vs <b style="color:${opp.color}">${opp.name}</b> <span class="rating">${opp.strength}</span> · ${E.FORMATS[S.settings.format].name}`;
      $('playBtn').textContent = '▶ Play league match';
    }
    $('freeHint').hidden = S.freeTrainDay === today();
    show('home');
  }
  function nextOpponent() {
    const sn = S.season, pair = sn.rounds[sn.round].find(p => p.includes('me'));
    const id = pair[0] === 'me' ? pair[1] : pair[0];
    return sn.teams.find(t => t.id === id);
  }

  // ---------- Squad ----------
  function renderSquad() {
    const list = $('squadList');
    list.innerHTML = '';
    const all = S.players.slice().sort((a, b) => (b.inXI - a.inXI) || a.order - b.order);
    const xiN = all.filter(p => p.inXI).length;
    $('xiCount').textContent = `XI ${xiN}/11`;
    const warn = xiWarning();
    $('xiWarn').hidden = !warn; $('xiWarn').textContent = warn || '';
    let batPos = 0;
    all.forEach(p => {
      const sig = E.SIGNATURES[p.sig];
      const card = document.createElement('div');
      card.className = 'pcard' + (p.inXI ? '' : ' bench');
      const traitIcons = Object.entries(p.traits).filter(([, v]) => v).map(([k, v]) => `<span class="tchip">${E.TRAITS[k].icon}${v}</span>`).join('');
      card.innerHTML = `
        <label class="xi"><input type="checkbox" ${p.inXI ? 'checked' : ''}><span>${p.inXI ? ++batPos : ''}</span></label>
        <div class="pinfo">
          <div class="pname">${p.name} <span class="role">${p.role}</span> <span class="lvl">Lv ${p.level}</span></div>
          <div class="pstats">🏏 ${E.batOverall(p)} · 🎳 ${p.kind === 'none' ? '–' : E.bowlOverall(p) + ' ' + p.kind} · ${sig.icon} ${sig.name}</div>
          <div class="ptraits">${traitIcons}</div>
        </div>
        <div class="pmove">
          <button class="icon" data-up="${p.id}" ${p.inXI ? '' : 'disabled'} aria-label="Bat higher">▲</button>
          <button class="icon" data-down="${p.id}" ${p.inXI ? '' : 'disabled'} aria-label="Bat lower">▼</button>
        </div>`;
      card.querySelector('.pinfo').onclick = () => renderPlayer(p.id);
      card.querySelector('input').onchange = e => {
        if (e.target.checked && xiN >= XI_SIZE) { e.target.checked = false; toast('XI is full. Untick someone first.'); return; }
        p.inXI = e.target.checked;
        if (p.inXI) p.order = Math.max(...S.players.filter(q => q.inXI && q !== p).map(q => q.order), 0) + 1;
        persist(); renderSquad();
      };
      list.appendChild(card);
    });
    list.querySelectorAll('[data-up],[data-down]').forEach(b => b.onclick = () => {
      const arr = xi(), id = b.dataset.up || b.dataset.down, i = arr.findIndex(p => p.id === id), j = i + (b.dataset.up ? -1 : 1);
      if (j < 0 || j >= arr.length) return;
      [arr[i].order, arr[j].order] = [arr[j].order, arr[i].order];
      persist(); renderSquad();
    });
    show('squad');
  }
  function xiWarning() {
    const t = xi();
    if (t.length !== XI_SIZE) return `Pick exactly 11 players (you have ${t.length}).`;
    const f = E.FORMATS[S.settings.format];
    const bowlers = t.filter(p => p.kind !== 'none').length;
    const need = Math.ceil(f.overs / f.maxOvers) + (f.overs > 2 ? 1 : 1);
    if (bowlers < need) return `You need at least ${need} bowlers for ${f.name} (you have ${bowlers}).`;
    if (!t.some(p => p.role === 'WK')) return 'Tip: you have no wicketkeeper in the XI.';
    return null;
  }

  // ---------- Player ----------
  const ATTRS = [['tech', 'Technique', 'Ground shots and defence'], ['power', 'Power', 'Lofted shots and sixes'],
                 ['place', 'Placement', 'Finding gaps for 2s and 4s'], ['temper', 'Temperament', 'Calm under pressure'],
                 ['acc', 'Accuracy', 'Landing the ball where you aim'], ['move', 'Movement', 'Swing or spin that beats the bat']];
  function renderPlayer(id) {
    viewing = id;
    const p = player(id), sig = E.SIGNATURES[p.sig];
    $('pTitle').textContent = p.name;
    $('pMeta').innerHTML = `${p.role} · Level ${p.level} (${p.xp} XP) · ${p.kind === 'none' ? 'does not bowl' : p.kind + ' bowler'} · Potential ${p.potential}<br>
      Favourite zones: ${p.fav.map(z => E.ZONE[z].name).join(', ')} · ${p.stats.m} matches, ${p.stats.r} runs, ${p.stats.w} wickets`;
    $('pSig').innerHTML = `<span class="sigicon">${sig.icon}</span><div><b>${sig.name}</b> <span class="badge">Signature</span><br><small>${sig.desc}</small></div>`;
    $('pTp').textContent = S.tp;
    const al = $('attrList');
    al.innerHTML = '';
    for (const [k, name, desc] of ATTRS) {
      if ((k === 'acc' || k === 'move') && p.kind === 'none') continue;
      const v = p[k], cost = v >= 80 ? 2 : 1, capped = v >= p.potential;
      const row = document.createElement('div');
      row.className = 'attr';
      row.innerHTML = `<div class="aname"><b>${name}</b><small>${desc}</small></div>
        <div class="abar"><span style="width:${v}%"></span><i style="left:${p.potential}%"></i></div>
        <b class="aval">${v}</b>
        <button class="icon plus" ${capped || S.tp < cost ? 'disabled' : ''} aria-label="Train ${name}">+</button>`;
      row.querySelector('button').onclick = () => { S.tp -= cost; p[k]++; persist(); renderPlayer(id); };
      al.appendChild(row);
    }

    const u = used(p);
    $('pTokens').innerHTML = `<b>${p.tokens - u}</b> free of ${p.tokens} trait tokens <span class="muted">(max ${MAX_TOKENS})</span>`;
    $('tokenBar').innerHTML = Array.from({ length: MAX_TOKENS }, (_, i) => `<span class="tok ${i < u ? 'used' : i < p.tokens ? 'free' : ''}"></span>`).join('');
    const freeToday = S.freeTrainDay !== today(), full = p.tokens >= MAX_TOKENS;
    $('trainBtn').disabled = full || (!freeToday && S.coins < TRAIN_COST);
    $('trainBtn').innerHTML = full ? 'Fully trained (10/10)' : freeToday ? '🎁 Free daily training (+1 token)' : `Train (+1 token) · 🪙 ${TRAIN_COST}`;

    const tl = $('traitList');
    tl.innerHTML = '';
    for (const kind of ['bat', 'bowl']) {
      const h = document.createElement('h3');
      h.textContent = kind === 'bat' ? 'Batting traits' : 'Bowling traits';
      tl.appendChild(h);
      for (const [k, t] of Object.entries(E.TRAITS)) {
        if (t.kind !== kind) continue;
        const level = p.traits[k] || 0;
        const row = document.createElement('div');
        row.className = 'trait';
        row.innerHTML = `<span class="ticon">${t.icon}</span>
          <div class="tinfo"><b>${t.name}</b><small>${t.desc}</small>
            <div class="pips">${Array.from({ length: MAX_LEVEL }, (_, i) => `<span class="${i < level ? 'on' : ''}"></span>`).join('')}</div></div>
          <div class="tbtns"><button class="icon" ${level === 0 ? 'disabled' : ''} aria-label="Remove token">−</button>
            <button class="icon plus" ${level >= MAX_LEVEL || u >= p.tokens ? 'disabled' : ''} aria-label="Add token">+</button></div>`;
        const [minus, plus] = row.querySelectorAll('button');
        minus.onclick = () => { p.traits[k] = level - 1; if (!p.traits[k]) delete p.traits[k]; persist(); renderPlayer(id); };
        plus.onclick = () => { p.traits[k] = level + 1; persist(); renderPlayer(id); };
        tl.appendChild(row);
      }
    }
    show('player');
  }
  function train() {
    const p = player(viewing);
    if (p.tokens >= MAX_TOKENS) return;
    if (S.freeTrainDay !== today()) S.freeTrainDay = today();
    else if (S.coins >= TRAIN_COST) S.coins -= TRAIN_COST;
    else return;
    p.tokens++; persist(); renderPlayer(viewing);
    toast(`${p.name} trained! +1 trait token`);
  }

  // ---------- League ----------
  function renderLeague() {
    const sn = S.season;
    $('lgTitle').textContent = `${DIVISIONS[sn.div].name} · Season ${sn.no}`;
    $('lgInfo').textContent = sn.over ? 'Season over.' : `Round ${sn.round + 1} of ${sn.rounds.length}. Top ${PROMOTE} go up${sn.div < 5 ? ', bottom team goes down' : ''}.`;
    const rows = standings();
    $('lgTable').innerHTML = `<tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>NRR</th><th>Pts</th></tr>` +
      rows.map((r, i) => `<tr class="${r.id === 'me' ? 'me' : ''} ${i < PROMOTE && sn.div > 1 ? 'up' : ''}"><td>${i + 1}</td><td><span class="dot" style="background:${r.color}"></span>${r.name}</td>
        <td>${r.p}</td><td>${r.w}</td><td>${r.l}</td><td>${nrr(r).toFixed(2)}</td><td><b>${r.pts}</b></td></tr>`).join('');
    $('lgResults').innerHTML = sn.results.slice().reverse().map(r => `<div class="res">${r}</div>`).join('') || '<p class="muted small">No matches yet.</p>';
    $('newSeasonBtn').hidden = !sn.over;
    show('league');
  }
  function teamInfo(id) {
    if (id === 'me') return { id, name: S.club.name, color: S.club.color };
    const t = S.season.teams.find(x => x.id === id);
    return { id, name: t.name, color: t.color };
  }
  function standings() {
    const t = S.season.table;
    return Object.keys(t).map(id => Object.assign({}, t[id], teamInfo(id)))
      .sort((a, b) => b.pts - a.pts || nrr(b) - nrr(a));
  }
  function recordResult(aId, bId, st) {
    const t = S.season.table, inn = st.innings;
    const idOf = idx => (idx === 0 ? aId : bId);
    for (const i of inn) {
      const bat = t[idOf(i.bat)], bowl = t[idOf(1 - i.bat)];
      // NRR rule: all out counts as the full quota of overs.
      const balls = i.wkts >= E.wktLimit({ ...st, inn: st.innings.indexOf(i) }) ? st.format.overs * 6 : i.balls;
      bat.rf += i.runs; bat.bf += balls; bowl.ra += i.runs; bowl.ba += balls;
    }
    for (const id of [aId, bId]) t[id].p++;
    if (st.result.winner === null) { t[aId].t++; t[bId].t++; t[aId].pts++; t[bId].pts++; }
    else { const w = idOf(st.result.winner), l = w === aId ? bId : aId; t[w].w++; t[w].pts += 2; t[l].l++; }
    S.season.results.push(`R${S.season.round + 1}: ${st.result.text} (${teamInfo(aId).name} v ${teamInfo(bId).name})`);
  }
  function simOtherFixtures() {
    const sn = S.season;
    for (const [a, b] of sn.rounds[sn.round]) {
      if (a === 'me' || b === 'me') continue;
      const ta = sn.teams.find(t => t.id === a), tb = sn.teams.find(t => t.id === b);
      const st = E.createMatch({ seed: (sn.no * 1000 + sn.round * 10 + ta.seed) >>> 0, format: S.settings.format, pitch: 'balanced',
        teams: [genTeam(ta.seed, ta.name, ta.color, ta.strength), genTeam(tb.seed, tb.name, tb.color, tb.strength)], firstBat: (ta.seed + sn.round) % 2 });
      E.simulate(st);
      recordResult(a, b, st);
    }
  }
  function endSeasonIfDone() {
    const sn = S.season;
    sn.round++;
    if (sn.round < sn.rounds.length) return;
    sn.over = true;
    const pos = standings().findIndex(r => r.id === 'me');
    sn.finish = pos + 1;
    const prize = [400, 250, 150, 100, 60, 40][pos] || 40;
    S.coins += prize; S.tp += 6 - pos;
    sn.note = pos < PROMOTE && sn.div > 1 ? 'promoted' : pos === LEAGUE_TEAMS - 1 && sn.div < 5 ? 'relegated' : 'stayed';
    S.season.results.push(`Season finished: you came ${ordinal(pos + 1)} (+${prize} coins). ${sn.note === 'promoted' ? 'PROMOTED!' : sn.note === 'relegated' ? 'Relegated.' : ''}`);
  }
  function startNextSeason() {
    const sn = S.season;
    const div = sn.note === 'promoted' ? sn.div - 1 : sn.note === 'relegated' ? sn.div + 1 : sn.div;
    S.season = newSeason(div, sn.no + 1, (Date.now() + sn.no) % 100000);
    persist(); renderHome();
  }
  const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

  // ---------- History & scorecard ----------
  function renderHistory() {
    $('histList').innerHTML = S.history.slice().reverse().map((h, i) => `
      <button class="hrow" data-i="${S.history.length - 1 - i}"><b class="${h.won ? 'won' : 'lost'}">${h.won ? 'W' : h.tied ? 'T' : 'L'}</b>
        <span>${h.title}<br><small class="muted">${h.result} · ${h.date}</small></span></button>`).join('') || '<p class="muted">No matches yet.</p>';
    $('histList').querySelectorAll('.hrow').forEach(b => b.onclick = () => openCard(S.history[+b.dataset.i].card));
    show('history');
  }
  function scorecard(st) {
    return st.innings.map(inn => {
      const bt = st.teams[inn.bat], bw = st.teams[1 - inn.bat];
      return {
        team: bt.name, runs: inn.runs, wkts: inn.wkts, balls: inn.balls, extras: inn.extras,
        bat: bt.order.filter(id => inn.batStats[id].batted).map(id => { const p = bt.players.find(x => x.id === id), s = inn.batStats[id]; return [p.name, s.out || 'not out', s.r, s.b, s.f, s.s]; }),
        bowl: bw.players.filter(p => inn.bowlStats[p.id].balls).map(p => { const s = inn.bowlStats[p.id]; return [p.name, `${Math.floor(s.balls / 6)}.${s.balls % 6}`, s.r, s.w]; }),
      };
    });
  }
  function openCard(card) {
    $('cardBody').innerHTML = card.map(c => `
      <h3>${c.team} ${c.runs}/${c.wkts} <small class="muted">(${Math.floor(c.balls / 6)}.${c.balls % 6} ov, extras ${c.extras})</small></h3>
      <table class="table sc"><tr><th>Batter</th><th></th><th>R</th><th>B</th><th>4s</th><th>6s</th></tr>
        ${c.bat.map(b => `<tr><td>${b[0]}</td><td class="muted small">${b[1]}</td><td><b>${b[2]}</b></td><td>${b[3]}</td><td>${b[4]}</td><td>${b[5]}</td></tr>`).join('')}</table>
      <table class="table sc"><tr><th>Bowler</th><th>O</th><th>R</th><th>W</th></tr>
        ${c.bowl.map(b => `<tr><td>${b[0]}</td><td>${b[1]}</td><td>${b[2]}</td><td><b>${b[3]}</b></td></tr>`).join('')}</table>`).join('');
    $('cardModal').hidden = false;
  }

  // ---------- Pre-match ----------
  let pending = null; // { opp, league, pitch, seed, firstBat }
  function prepareMatch(league) {
    const warn = xiWarning();
    if (warn && !warn.startsWith('Tip')) { toast(warn); renderSquad(); return; }
    let opp;
    if (league) {
      if (S.season.over) return renderLeague();
      opp = nextOpponent();
    } else {
      const [name, color] = CLUBS[Math.floor(Math.random() * CLUBS.length)];
      opp = { id: 'friendly', name, color, strength: DIVISIONS[S.season.div].strength, seed: Math.floor(Math.random() * 1e6) };
    }
    const pitches = Object.keys(E.PITCHES);
    pending = { opp, league, seed: Math.floor(Math.random() * 2 ** 31), pitch: pitches[Math.floor(Math.random() * pitches.length)], firstBat: null };
    const P = E.PITCHES[pending.pitch];
    $('pmTeams').innerHTML = `<b style="color:${S.club.color}">${S.club.name}</b> vs <b style="color:${opp.color}">${opp.name}</b>`;
    $('pmInfo').innerHTML = `${E.FORMATS[S.settings.format].name} · ${league ? 'League match' : 'Friendly'} · Opponent rating ${opp.strength}<br>Pitch: ${P.icon} <b>${P.name}</b> — ${P.desc}`;
    $('tossText').textContent = 'Call it in the air!';
    $('tossCall').hidden = false; $('tossChoice').hidden = true; $('tossGo').hidden = true;
    show('prematch');
    ensureScene();
  }
  function toss(call) {
    const side = Math.random() < 0.5 ? 'heads' : 'tails';
    $('tossCall').hidden = true;
    if (side === call) { $('tossText').textContent = `It's ${side}! You won the toss. What will you do?`; $('tossChoice').hidden = false; }
    else {
      const aiBat = Math.random() < 0.5;
      pending.firstBat = aiBat ? 1 : 0;
      $('tossText').textContent = `It's ${side}. ${pending.opp.name} won the toss and chose to ${aiBat ? 'bat' : 'bowl'} first.`;
      $('tossGo').hidden = false;
    }
  }

  // ---------- Match ----------
  let M = null; // { st, auto: null|'over'|'innings', ... }
  let cancelPanel = null; // rejects whichever panel is waiting, used by Quit
  async function ensureScene() {
    if (!sceneReady) sceneReady = (async () => {
      Scene = await import('./scene3d.js');
      await Scene.init($('stage'), { quality: S.settings.hq ? 'high' : 'low' });
      $('loading').hidden = true;
    })();
    return sceneReady;
  }

  async function startMatch() {
    const opp = pending.opp;
    const mine = { id: 'me', name: S.club.name, color: S.club.color, xi: xi(), user: true };
    const theirs = genTeam(opp.seed, opp.name, opp.color, opp.strength);
    const cfg = { seed: pending.seed, format: S.settings.format, pitch: pending.pitch, teams: [mine, theirs], firstBat: pending.firstBat };
    M = { st: E.createMatch(cfg), cfg, auto: null, autoOverEnd: -1, quit: false, league: pending.league, opp, inn: -1 };
    show('match');
    $('comm').textContent = '';
    await ensureScene();
    Scene.resize();
    Scene.resume();
    try { await matchLoop(); }
    catch (e) { if (e.message !== 'quit') { console.error(e); toast('Something went wrong: ' + e.message); } }
    Scene.pause();
    hidePanels();
    if (M && !M.quit && M.st.result) finishMatch();
    else renderHome();
  }

  const userBats = st => st.teams[E.cur(st).bat].user;
  const autoOn = () => M.auto === 'innings' || (M.auto === 'over' && E.cur(M.st).balls < M.autoOverEnd);

  async function matchLoop() {
    const st = M.st;
    while (!st.result) {
      if (M.quit) throw new Error('quit');
      const inn = E.cur(st);
      if (M.inn !== st.inn) { // new innings
        if (M.inn !== -1) await inningsBreak();
        M.inn = st.inn; M.auto = null;
        Scene.setTeams(st.teams[inn.bat].color, st.teams[1 - inn.bat].color);
      }
      if (M.auto === 'over' && inn.balls >= M.autoOverEnd) M.auto = null;
      updateHud();
      Scene.setFast(M.auto === 'innings');

      if (E.needBowler(st)) {
        if (!userBats(st) && !autoOn()) await pickBowler();
        else { E.setBowler(st, E.aiBowler(st)); if (!userBats(st)) E.setField(st, inn.field); else E.setField(st, E.bestField(st)); }
        if (!userBats(st) && autoOn()) E.setField(st, E.bestField(st));
      }
      Scene.setField(inn.field);
      updateHud();

      // Delivery.
      let aim;
      if (!userBats(st) && !autoOn()) aim = await pickDelivery();
      else aim = E.bestDelivery(st);
      const bowler = E.player(st, inn.bowler);
      const d = E.deliver(st, aim);
      if (d.wide) {
        await Scene.bowlDelivery({ line: aim.line, length: aim.length, fullToss: false }, { kind: bowler.kind });
        await Scene.playWide(aim);
        say(d.event.text); updateHud(); continue;
      }
      if (d.missed && !userBats(st) && !autoOn()) say(`Missed the mark: it lands ${E.delText(d)}.`);

      // Shot.
      let shot;
      if (userBats(st) && !autoOn()) {
        await Scene.bowlDelivery(d, { pauseAtBat: true, kind: bowler.kind });
        shot = await pickShot(d);
      } else {
        await Scene.bowlDelivery(d, { kind: bowler.kind });
        shot = E.bestShot(st, d, 1).shot;
      }
      const ev = E.play(st, shot);
      await Scene.playShot(ev);
      onEvent(ev);
    }
  }

  function onEvent(ev) {
    say(ev.text);
    updateHud();
    if (M.auto === 'innings') return;
    const o = ev.outcome === 'NB' ? ev.hit : ev.outcome;
    if (o === '6') { flash('SIX!', 'six'); snd(660, 0.3); buzz(60); }
    else if (o === '4') { flash('FOUR!', 'four'); snd(520, 0.25); buzz(40); }
    else if (o === 'W') { flash('OUT!', 'out'); snd(140, 0.4, 'sawtooth'); buzz([30, 40, 30]); }
    else if (ev.outcome === 'NB') flash('FREE HIT', 'four');
  }

  function updateHud() {
    const st = M.st, inn = E.cur(st), bt = st.teams[inn.bat];
    $('hudBat').textContent = bt.name;
    $('hudBat').style.color = bt.color;
    $('hudScore').textContent = `${inn.runs}/${inn.wkts}`;
    $('hudOvers').textContent = `(${Math.floor(inn.balls / 6)}.${inn.balls % 6}/${st.format.overs})`;
    if (st.target) {
      const need = st.target - inn.runs, left = E.ballsLeft(st);
      $('hudNeed').textContent = need > 0 ? `Need ${need} off ${left}` : '';
    } else $('hudNeed').textContent = st.inn === 0 ? E.PITCHES[st.pitch].icon + ' ' + E.PITCHES[st.pitch].name : '';
    const s = inn.striker && E.player(st, inn.striker), sb = s && inn.batStats[inn.striker];
    $('hudStriker').textContent = s ? `🏏 ${s.name} ${sb.r}(${sb.b})${inn.freeHit ? ' · FREE HIT' : ''}` : '';
    const b = inn.bowler && E.player(st, inn.bowler);
    if (b) { const bs = inn.bowlStats[b.id]; $('hudBowler').textContent = `🎳 ${b.name} ${bs.w}-${bs.r}`; }
    else $('hudBowler').textContent = '';
  }
  let sayTimer;
  function say(t) { const c = $('comm'); c.textContent = t; c.classList.add('show'); clearTimeout(sayTimer); sayTimer = setTimeout(() => c.classList.remove('show'), 3200); }
  function flash(t, cls) { const f = $('flash'); f.textContent = t; f.className = 'flash show ' + cls; setTimeout(() => f.className = 'flash', 1300); }
  function hidePanels() { for (const id of ['batPanel', 'bowlPanel', 'bowlerPick', 'breakCard']) $(id).hidden = true; }

  function inningsBreak() {
    return new Promise((res, rej) => {
      cancelPanel = () => rej(new Error('quit'));
      const st = M.st, first = st.innings[0], bt = st.teams[first.bat];
      $('breakTitle').textContent = `${bt.name} ${first.runs}/${first.wkts}`;
      const chasing = st.teams[1 - first.bat].user;
      $('breakText').innerHTML = chasing ? `You need <b>${st.target}</b> to win off ${st.format.overs * 6} balls.` : `Defend <b>${st.target - 1}</b>. Set your fields and bowl to them.`;
      $('breakCard').hidden = false;
      $('breakBtn').onclick = () => { $('breakCard').hidden = true; res(); };
    });
  }

  function pickBowler() {
    return new Promise((res, rej) => {
      cancelPanel = () => rej(new Error('quit'));
      const st = M.st, list = $('bowlerList'), inn = E.cur(st);
      list.innerHTML = '';
      const el = E.eligibleBowlers(st);
      for (const p of el.filter(p => p.kind !== 'none').concat(el.filter(p => p.kind === 'none'))) {
        const sig = E.SIGNATURES[p.sig], bs = inn.bowlStats[p.id];
        const b = document.createElement('button');
        b.className = 'pick';
        b.innerHTML = `<b>${p.name}</b><span class="rating">${E.bowlOverall(p)}</span>
          <small>${p.kind === 'none' ? 'part-timer' : p.kind} · ${sig.kind === 'bowl' ? sig.icon + ' ' + sig.name + ' · ' : ''}${inn.overs[p.id] || 0}/${st.format.maxOvers} overs · ${bs.w}-${bs.r}</small>`;
        b.onclick = () => { $('bowlerPick').hidden = true; E.setBowler(st, p.id); res(); };
        list.appendChild(b);
      }
      $('bowlerPick').hidden = false;
    });
  }

  // ---------- Field map (SVG) ----------
  const NS = 'http://www.w3.org/2000/svg';
  const C = 150, R_IN = 66, R_OUT = 138;
  const EDGES = { fine: [-180, -122.5], square: [-122.5, -75], midwkt: [-75, -35], longon: [-35, 0], longoff: [0, 35], cover: [35, 75], point: [75, 122.5], third: [122.5, 180] };
  // Matches the broadcast camera: batter at the top end, straight down the screen, off side on the left.
  const pt = (ang, r) => [C - Math.sin(ang * Math.PI / 180) * r, C + Math.cos(ang * Math.PI / 180) * r];
  function wedge(a0, a1, r0, r1) {
    const [x0, y0] = pt(a0, r1), [x1, y1] = pt(a1, r1), [x2, y2] = pt(a1, r0), [x3, y3] = pt(a0, r0);
    return `M${x0},${y0} A${r1},${r1} 0 0 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 0 0 ${x3},${y3} Z`;
  }
  function el(tag, attrs, parent) { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent && parent.appendChild(e); return e; }

  function drawMap(svg, field, opts = {}) {
    svg.innerHTML = '';
    el('circle', { cx: C, cy: C, r: R_OUT + 8, class: 'fm-ground' }, svg);
    for (const z of E.ZONES) {
      const [a0, a1] = EDGES[z.k];
      const heat = opts.heat ? opts.heat[z.k] : null;
      const g = el('g', { class: 'fm-zone' + (opts.selected === z.k ? ' sel' : ''), 'data-zone': z.k }, svg);
      el('path', { d: wedge(a0, a1, 10, R_OUT), fill: heat != null ? heatColor(heat) : 'transparent', class: 'fm-wedge' }, g);
      const [lx, ly] = pt((a0 + a1) / 2, R_OUT - 20);
      const t = el('text', { x: lx, y: ly, class: 'fm-label' }, g);
      t.textContent = z.name.replace(' ', ' ');
      if (opts.labels && opts.labels[z.k]) { const t2 = el('text', { x: lx, y: ly + 11, class: 'fm-sub' }, g); t2.textContent = opts.labels[z.k]; }
      if (opts.fav && opts.fav.includes(z.k)) { const [sx, sy] = pt((a0 + a1) / 2, R_IN - 22); const s = el('text', { x: sx, y: sy, class: 'fm-star' }, g); s.textContent = '★'; }
    }
    el('circle', { cx: C, cy: C, r: R_IN, class: 'fm-ring' }, svg);
    el('rect', { x: C - 5, y: C - 4, width: 10, height: 52, class: 'fm-pitch' }, svg);
    el('circle', { cx: C, cy: C, r: 4, class: 'fm-bat' }, svg);
    // Fielders.
    const dotAt = (ang, r, cls) => { const [x, y] = pt(ang, r); el('circle', { cx: x, cy: y, r: 6.5, class: 'fm-f ' + cls }, svg); };
    for (const z of field.inner) dotAt(E.ZONE[z].ang, R_IN - 8, 'in');
    for (const z of field.deep) dotAt(E.ZONE[z].ang, R_OUT - 4, 'deep');
    if (field.slip) dotAt(150, 22, 'in');
    dotAt(180, 18, 'wk');
    if (opts.onZone) svg.querySelectorAll('.fm-zone').forEach(g => g.onclick = () => opts.onZone(g.dataset.zone));
  }
  function heatColor(v) { // v: -1 (bad) .. +1 (good)
    const t = Math.max(-1, Math.min(1, v));
    const r = t < 0 ? 220 : Math.round(220 - t * 170), g = t > 0 ? 200 : Math.round(200 + t * 140);
    return `rgba(${r},${g},70,0.55)`;
  }

  // ---------- Batting panel ----------
  function pickShot(del) {
    return new Promise((res, rej) => {
      cancelPanel = () => rej(new Error('quit'));
      const st = M.st, inn = E.cur(st), bat = E.player(st, inn.striker);
      let type = 'ground', zone = null;
      const bp = $('batPanel');
      $('delInfo').innerHTML = `${del.noBall ? '<b class="nb">NO-BALL</b> ' : ''}${del.fullToss ? '<b>Full toss!</b>' : `<b>${E.LENGTH_NAMES[del.length]}</b> ${E.LINE_NAMES[del.line]}`}`;
      $('whyBox').hidden = true;
      const cost = wicketCostForUi();
      const render = () => {
        const heat = {}, labels = {};
        for (const z of E.ZONES) {
          const o = E.shotOdds(st, { zone: z.k, type }, del);
          heat[z.k] = (o.ev - o.risk * cost) / 2.2;
          labels[z.k] = o.ev.toFixed(1) + (o.risk > 0.08 ? ' ⚠' : '');
        }
        drawMap($('batMap'), inn.field, { heat, labels, selected: zone, fav: bat.fav, onZone: z => { zone = z; render(); } });
        if (zone) {
          const o = E.shotOdds(st, { zone, type }, del), P = o.P;
          const pc = v => Math.round(v * 100) + '%';
          $('shotInfo').innerHTML = `<b>${E.ZONE[zone].name}</b> · ${type}: ` +
            (type === 'lofted' ? `6s ${pc(P[6])} · 4s ${pc(P[4])}` : `4s ${pc(P[4])} · 2-3s ${pc(P[2] + P[3])}`) +
            ` · 1s ${pc(P[1])} · <span class="risk">out ${pc(P.W)}</span>`;
          $('whyBox').innerHTML = o.why.map(([t, v]) => `<div class="${v > 0 ? 'pos' : v < 0 ? 'neg' : ''}">${v > 0 ? '▲' : v < 0 ? '▼' : '•'} ${t}</div>`).join('');
        } else $('shotInfo').textContent = 'Tap a zone to aim your shot. ★ = favourite zone';
        $('shotBtn').disabled = !zone;
        bp.querySelectorAll('[data-type]').forEach(b => b.classList.toggle('on', b.dataset.type === type));
      };
      bp.querySelectorAll('[data-type]').forEach(b => b.onclick = () => { type = b.dataset.type; render(); });
      $('whyBtn').onclick = () => { $('whyBox').hidden = !$('whyBox').hidden; };
      const done = shot => { bp.hidden = true; res(shot); };
      $('shotBtn').onclick = () => zone && done({ zone, type });
      $('defendBtn').onclick = () => done({ type: 'defend' });
      bp.querySelectorAll('[data-auto]').forEach(b => b.onclick = () => { setAuto(b.dataset.auto); done(E.bestShot(st, del, 1).shot); });
      render();
      bp.hidden = false;
    });
  }
  function wicketCostForUi() {
    const st = M.st, inn = E.cur(st), left = E.ballsLeft(st), wl = E.wktLimit(st) - inn.wkts;
    return Math.max(1.5, Math.min(25, left / Math.max(wl, 1) * 1.1));
  }

  // ---------- Bowling panel ----------
  function pickDelivery() {
    return new Promise((res, rej) => {
      cancelPanel = () => rej(new Error('quit'));
      const st = M.st, inn = E.cur(st), bat = E.player(st, inn.striker);
      const bp = $('bowlPanel');
      let field = JSON.parse(JSON.stringify(inn.field));
      $('scoutInfo').innerHTML = `<b>${bat.name}</b> ${E.batOverall(bat)} · ★ likes ${bat.fav.map(z => E.ZONE[z].name).join(', ')}`;
      const pr = $('presets');
      pr.innerHTML = Object.entries(E.FIELD_PRESETS).map(([k, p]) => `<button data-preset="${k}">${p.name}</button>`).join('') +
        `<button data-slip class="${field.slip ? 'on' : ''}">Slip</button>`;
      const apply = () => {
        const err = E.fieldError(E.normField(field));
        const n = field.inner.length + field.deep.length + (field.slip ? 1 : 0);
        $('fieldCount').textContent = err ? `${n}/9 · ${field.deep.length}/5 deep` : 'Field set ✓';
        $('fieldCount').className = 'badge' + (err ? ' bad' : '');
        if (!err) { E.setField(st, field); Scene.setField(field); }
        drawMap($('bowlMap'), field, { fav: bat.fav, onZone: cycleZone });
        drawGrid(!err);
        pr.querySelector('[data-slip]').classList.toggle('on', field.slip);
      };
      const cycleZone = z => { // empty → ring → deep → both → empty
        const i = field.inner.includes(z), d = field.deep.includes(z);
        const next = !i && !d ? [1, 0] : i && !d ? [0, 1] : !i && d ? [1, 1] : [0, 0];
        field.inner = field.inner.filter(x => x !== z); field.deep = field.deep.filter(x => x !== z);
        if (next[0]) field.inner.push(z); if (next[1]) field.deep.push(z);
        apply();
      };
      pr.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => { field = JSON.parse(JSON.stringify(E.FIELD_PRESETS[b.dataset.preset])); apply(); });
      pr.querySelector('[data-slip]').onclick = () => { field.slip = !field.slip; apply(); };

      const drawGrid = ok => {
        const g = $('delGrid');
        const cells = [`<span></span>`, ...E.LINES.map(l => `<span class="gh">${l === 'off' ? 'Off' : l === 'stumps' ? 'Stumps' : 'Leg'}</span>`)];
        for (const length of E.LENGTHS) {
          cells.push(`<span class="gh">${E.LENGTH_NAMES[length]}</span>`);
          for (const line of E.LINES) {
            const v = E.bestShot(st, { line, length, fullToss: false }).value;
            cells.push(`<button data-line="${line}" data-length="${length}" style="background:${heatColor(-(v - 0.9) / 1.2)}" ${ok ? '' : 'disabled'}>${v.toFixed(1)}</button>`);
          }
        }
        g.innerHTML = cells.join('') + '<small class="glegend">Numbers: batter\'s expected runs off that ball with this field. Lower and greener is better for you.</small>';
        g.querySelectorAll('button').forEach(b => b.onclick = () => { bp.hidden = true; res({ line: b.dataset.line, length: b.dataset.length }); });
      };
      bp.querySelectorAll('[data-auto]').forEach(b => b.onclick = () => { setAuto(b.dataset.auto); bp.hidden = true; res(E.bestDelivery(st)); });
      apply();
      bp.hidden = false;
    });
  }

  function setAuto(kind) {
    const inn = E.cur(M.st);
    M.auto = kind;
    M.autoOverEnd = (Math.floor(inn.balls / 6) + 1) * 6;
  }

  // ---------- Results ----------
  function finishMatch() {
    const st = M.st, meIdx = 0, won = st.result.winner === meIdx, tied = st.result.winner === null;
    const myInn = st.innings.find(i => i.bat === meIdx), theirInn = st.innings.find(i => i.bat !== meIdx);
    let fours = 0, sixes = 0;
    for (const s of Object.values(myInn.batStats)) { fours += s.f; sixes += s.s; }
    const hit = myInn.runs + fours * 2 + sixes * 4, wk = theirInn.wkts * 5;
    const bonus = won ? 80 + (6 - S.season.div) * 25 : tied ? 30 : 0;
    const coins = hit + wk + bonus, tp = won ? 4 : 2;
    S.coins += coins; S.tp += tp; S.played++; if (won) S.wins++;

    // XP and stats per player.
    const levelUps = [];
    for (const p of xi()) {
      const b = myInn.batStats[p.id], w = theirInn.bowlStats[p.id];
      const xp = 10 + (b ? b.r : 0) + (w ? w.w * 15 : 0) + (won ? 10 : 0);
      p.xp += xp; p.stats.m++; p.stats.r += b ? b.r : 0; p.stats.w += w ? w.w : 0; if (b && b.r > p.stats.hs) p.stats.hs = b.r;
      while (p.xp >= p.level * 100) { p.xp -= p.level * 100; p.level++; S.tp += 2; levelUps.push(`${p.name} → Lv ${p.level}`); }
    }

    const card = scorecard(st);
    if (M.league) { recordResult('me', M.opp.id, st); simOtherFixtures(); endSeasonIfDone(); }
    S.history.push({ title: `${S.club.name} v ${M.opp.name}`, result: st.result.text, won, tied, date: today(), card,
                     seed: st.seed, engine: st.engine, decisions: st.decisions.length });
    if (S.history.length > 20) S.history.shift();
    persist();

    $('resTitle').textContent = won ? 'YOU WON!' : tied ? 'MATCH TIED' : 'LOST';
    $('resTitle').className = won ? 'won' : tied ? '' : 'lost';
    $('resText').innerHTML = `${st.result.text}<br><span class="muted">${card.map(c => `${c.team} ${c.runs}/${c.wkts}`).join(' · ')}</span>`;
    $('resCoins').innerHTML = `
      <div><span>Hit coins (${myInn.runs} runs, ${fours}×4, ${sixes}×6)</span><b>+${hit}</b></div>
      <div><span>Wickets taken (${theirInn.wkts})</span><b>+${wk}</b></div>
      <div><span>Match bonus</span><b>+${bonus}</b></div>
      <div class="total"><span>Total</span><b>🪙 +${coins} · 🏋️ +${tp}</b></div>
      ${levelUps.length ? `<div><span>Level up! ${levelUps.join(', ')}</span><b>+${levelUps.length * 2} 🏋️</b></div>` : ''}`;
    $('cardBtn').onclick = () => openCard(card);
    show('result');
  }

  // ---------- Misc ----------
  let toastTimer;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2400); }
  function renderSettings() {
    $('setSound').checked = S.settings.sound; $('setHq').checked = S.settings.hq; $('setFormat').value = S.settings.format;
    $('version').textContent = `Version ${APP_VERSION} · engine ${E.ENGINE_VERSION}`;
    show('settings');
  }

  function init() {
    load();
    $('playBtn').onclick = () => S.season.over ? renderLeague() : prepareMatch(true);
    $('friendlyBtn').onclick = () => prepareMatch(false);
    $('squadBtn').onclick = renderSquad;
    $('leagueBtn').onclick = renderLeague;
    $('historyBtn').onclick = renderHistory;
    $('settingsBtn').onclick = renderSettings;
    for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => b.dataset.back === 'squad' ? renderSquad() : renderHome();
    $('trainBtn').onclick = train;
    $('resetBtn').onclick = () => { player(viewing).traits = {}; persist(); renderPlayer(viewing); };
    $('newSeasonBtn').onclick = startNextSeason;
    document.querySelectorAll('[data-call]').forEach(b => b.onclick = () => toss(b.dataset.call));
    document.querySelectorAll('[data-choose]').forEach(b => b.onclick = () => { pending.firstBat = b.dataset.choose === 'bat' ? 0 : 1; startMatch(); });
    $('tossGo').onclick = startMatch;
    $('quitBtn').onclick = () => {
      if (!confirm('Quit this match? It will not count.')) return;
      M.quit = true; hidePanels(); Scene.setFast(true);
      if (cancelPanel) { const c = cancelPanel; cancelPanel = null; c(); }
    };
    $('homeBtn').onclick = renderHome;
    $('cardClose').onclick = () => { $('cardModal').hidden = true; };
    $('setSound').onchange = e => { S.settings.sound = e.target.checked; persist(); };
    $('setHq').onchange = e => { S.settings.hq = e.target.checked; persist(); toast('Restart the app to apply graphics quality.'); };
    $('setFormat').onchange = e => { S.settings.format = e.target.value; persist(); };
    $('wipeBtn').onclick = () => { if (confirm('Delete all progress and start over?')) { S = fresh(); persist(); renderHome(); } };
    renderHome();
    Updater.check();
    // Warm up the 3D scene in the background so the first match starts fast.
    setTimeout(() => ensureScene().then(() => Scene.pause()).catch(e => console.error(e)), 300);
  }

  // Quitting needs to break out of a pending panel promise; the loop checks M.quit after each ball.
  window.addEventListener('DOMContentLoaded', init);
  window.Game = { get state() { return S; }, get match() { return M; } };
})();
