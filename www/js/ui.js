// Menus, squad management, trait tokens, training, saving.

const UI = (() => {
  const $ = id => document.getElementById(id);
  const SAVE_KEY = 'gullyLegends.v1';
  let S = null;            // save data
  let viewing = null;      // player id on the player screen

  // ---------- Save ----------
  function fresh() {
    return {
      v: 1, coins: 300, nextOpp: 0, wins: 0, played: 0, sixes: 0, freeTrainDay: '',
      settings: { sound: true, ring: true },
      players: STARTER_SQUAD.map(([name, role, bat, bowl, sig], i) => ({
        id: 'p' + i, name, role, bat, bowl, sig, order: i, tokens: 2, traits: {},
      })),
    };
  }
  function load() {
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) { S = JSON.parse(raw); return; } } catch (e) {}
    S = fresh();
  }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }
  const today = () => new Date().toISOString().slice(0, 10);
  const used = p => Object.values(p.traits).reduce((a, b) => a + b, 0);
  const player = id => S.players.find(p => p.id === id);

  // ---------- Navigation ----------
  function show(id) {
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
    window.scrollTo(0, 0);
  }

  // ---------- Home ----------
  function renderHome() {
    const tier = tierFor(S.wins);
    $('coins').textContent = S.coins;
    $('tier').textContent = tier.name;
    $('tier').style.color = tier.color;
    $('record').textContent = `${S.wins} wins · ${S.played} played · ${S.sixes} sixes`;
    const idx = Math.min(S.nextOpp, LEAGUE.length - 1);
    const opp = LEAGUE[idx];
    const done = S.nextOpp >= LEAGUE.length;
    $('nextOpp').innerHTML = done
      ? `<span class="badge">Champion!</span> Replay the final vs <b>${opp.name}</b>`
      : `Match ${idx + 1}/${LEAGUE.length} vs <b style="color:${opp.color}">${opp.name}</b> <span class="rating">${opp.rating}</span>`;
    const ladder = $('ladder');
    ladder.innerHTML = '';
    LEAGUE.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = i < S.nextOpp ? 'beaten' : i === idx ? 'current' : '';
      li.innerHTML = `<span class="dot" style="background:${t.color}"></span>${t.name}<span class="rating">${t.rating}</span>`;
      ladder.appendChild(li);
    });
    const free = S.freeTrainDay !== today();
    $('freeHint').hidden = !free;
    show('home');
  }

  // ---------- Squad ----------
  function renderSquad() {
    const list = $('squadList');
    list.innerHTML = '';
    const ordered = S.players.slice().sort((a, b) => a.order - b.order);
    ordered.forEach((p, i) => {
      const sig = SIGNATURES[p.sig];
      const card = document.createElement('div');
      card.className = 'pcard';
      const traitIcons = Object.entries(p.traits).filter(([, v]) => v).map(([k, v]) => `<span class="tchip">${TRAITS[k].icon}${v}</span>`).join('');
      card.innerHTML = `
        <div class="order">${i < WKTS ? '<span class="badge bat">BAT ' + (i + 1) + '</span>' : '<span class="num">' + (i + 1) + '</span>'}</div>
        <div class="pinfo">
          <div class="pname">${p.name} <span class="role">${p.role}</span></div>
          <div class="pstats">🏏 ${p.bat} · 🎳 ${p.bowl} · <span title="${sig.desc}">${sig.icon} ${sig.name}</span></div>
          <div class="ptraits">${traitIcons || '<span class="muted">No traits yet</span>'} <span class="muted">${used(p)}/${p.tokens} tokens</span></div>
        </div>
        <div class="pmove">
          <button class="icon" data-up="${p.id}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">▲</button>
          <button class="icon" data-down="${p.id}" ${i === ordered.length - 1 ? 'disabled' : ''} aria-label="Move down">▼</button>
        </div>`;
      card.querySelector('.pinfo').onclick = () => renderPlayer(p.id);
      list.appendChild(card);
    });
    list.querySelectorAll('[data-up],[data-down]').forEach(b => b.onclick = e => {
      e.stopPropagation();
      const id = b.dataset.up || b.dataset.down, dir = b.dataset.up ? -1 : 1;
      const arr = S.players.slice().sort((a, b2) => a.order - b2.order);
      const i = arr.findIndex(p => p.id === id), j = i + dir;
      [arr[i].order, arr[j].order] = [arr[j].order, arr[i].order];
      persist(); renderSquad();
    });
    show('squad');
  }

  // ---------- Player / traits ----------
  function renderPlayer(id) {
    viewing = id;
    const p = player(id), sig = SIGNATURES[p.sig];
    $('pTitle').textContent = p.name;
    $('pMeta').innerHTML = `${p.role} · 🏏 Batting ${p.bat} · 🎳 Bowling ${p.bowl}`;
    $('pSig').innerHTML = `<span class="sigicon">${sig.icon}</span><div><b>${sig.name}</b> <span class="badge">Signature</span><br><small>${sig.desc}</small></div>`;
    const u = used(p);
    $('pTokens').innerHTML = `<b>${p.tokens - u}</b> free of ${p.tokens} tokens <span class="muted">(max ${MAX_TOKENS})</span>`;
    $('tokenBar').innerHTML = Array.from({ length: MAX_TOKENS }, (_, i) =>
      `<span class="tok ${i < u ? 'used' : i < p.tokens ? 'free' : ''}"></span>`).join('');

    const freeToday = S.freeTrainDay !== today();
    const full = p.tokens >= MAX_TOKENS;
    $('trainBtn').disabled = full || (!freeToday && S.coins < TRAIN_COST);
    $('trainBtn').innerHTML = full ? 'Fully trained (10/10)' : freeToday ? '🎁 Free daily training (+1 token)' : `Train (+1 token) · 🪙 ${TRAIN_COST}`;

    const tl = $('traitList');
    tl.innerHTML = '';
    for (const kind of ['bat', 'bowl']) {
      const h = document.createElement('h3');
      h.textContent = kind === 'bat' ? 'Batting traits' : 'Bowling traits';
      tl.appendChild(h);
      for (const [k, t] of Object.entries(TRAITS)) {
        if (t.kind !== kind) continue;
        const level = p.traits[k] || 0;
        const row = document.createElement('div');
        row.className = 'trait';
        row.innerHTML = `
          <span class="ticon">${t.icon}</span>
          <div class="tinfo"><b>${t.name}</b><small>${t.desc}</small>
            <div class="pips">${Array.from({ length: MAX_LEVEL }, (_, i) => `<span class="${i < level ? 'on' : ''}"></span>`).join('')}</div></div>
          <div class="tbtns">
            <button class="icon" ${level === 0 ? 'disabled' : ''} aria-label="Remove token">−</button>
            <button class="icon plus" ${level >= MAX_LEVEL || u >= p.tokens ? 'disabled' : ''} aria-label="Add token">+</button>
          </div>`;
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
    p.tokens++;
    persist(); renderPlayer(viewing);
    toast(`${p.name} trained! +1 trait token`);
  }
  function resetTraits() {
    const p = player(viewing);
    p.traits = {};
    persist(); renderPlayer(viewing);
  }

  // ---------- Match ----------
  function play() {
    const idx = Math.min(S.nextOpp, LEAGUE.length - 1);
    show('match');
    Match.start(makeOpponent(idx), S.players, onMatchEnd);
  }

  function onMatchEnd(sum) {
    const m = sum.mine;
    const hitCoins = m.runs + m.fours * 2 + m.sixes * 4;
    const wktCoins = sum.wickets * 5;
    const winCoins = sum.result === 'won' ? 80 + sum.opp.idx * 20 : sum.result === 'tied' ? 30 : 0;
    const total = hitCoins + wktCoins + winCoins;
    S.coins += total; S.played++; S.sixes += m.sixes;
    if (sum.result === 'won') { S.wins++; if (S.nextOpp === sum.opp.idx) S.nextOpp++; }
    persist();

    const t = $('resTitle');
    t.textContent = sum.result === 'won' ? 'YOU WON!' : sum.result === 'tied' ? 'MATCH TIED' : 'LOST';
    t.className = sum.result;
    const how = sum.result === 'won'
      ? `Won by ${WKTS - m.wk} wicket${WKTS - m.wk === 1 ? '' : 's'} with ${sum.ballsLeft} ball${sum.ballsLeft === 1 ? '' : 's'} left`
      : sum.result === 'tied' ? 'Scores level' : `Lost by ${sum.target - 1 - m.runs} run${sum.target - 1 - m.runs === 1 ? '' : 's'}`;
    $('resText').innerHTML = `${how}<br><span class="muted">${sum.opp.name} ${sum.theirs.runs}/${sum.theirs.wk} · You ${m.runs}/${m.wk}</span>`;
    $('resCoins').innerHTML = `
      <div><span>Hit coins (${m.runs} runs, ${m.fours}×4, ${m.sixes}×6)</span><b>+${hitCoins}</b></div>
      <div><span>Wickets taken (${sum.wickets})</span><b>+${wktCoins}</b></div>
      <div><span>Match bonus</span><b>+${winCoins}</b></div>
      <div class="total"><span>Total</span><b>🪙 +${total}</b></div>`;
    show('result');
  }

  // ---------- Misc ----------
  let toastTimer;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.hidden = true, 2200);
  }
  const settings = () => (S && S.settings) || { sound: true, ring: true };

  function renderSettings() {
    $('setSound').checked = S.settings.sound;
    $('setRing').checked = S.settings.ring;
    $('version').textContent = 'Version ' + APP_VERSION;
    show('settings');
  }

  function init() {
    load();
    Match.init();
    $('playBtn').onclick = play;
    $('squadBtn').onclick = renderSquad;
    $('settingsBtn').onclick = renderSettings;
    for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => {
      if (b.dataset.back === 'squad') renderSquad(); else renderHome();
    };
    $('trainBtn').onclick = train;
    $('resetBtn').onclick = resetTraits;
    $('quitBtn').onclick = () => { if (confirm('Quit this match? It will not count.')) { Match.stop(); renderHome(); } };
    $('chaseBtn').onclick = () => Match.startChase();
    for (const b of document.querySelectorAll('[data-delivery]')) b.onclick = () => Match.chooseDelivery(b.dataset.delivery);
    $('againBtn').onclick = play;
    $('homeBtn').onclick = renderHome;
    $('setSound').onchange = e => { S.settings.sound = e.target.checked; persist(); };
    $('setRing').onchange = e => { S.settings.ring = e.target.checked; persist(); };
    $('wipeBtn').onclick = () => { if (confirm('Delete all progress and start over?')) { S = fresh(); persist(); renderHome(); } };
    renderHome();
    Updater.check();
  }

  return { init, settings, toast };
})();

addEventListener('DOMContentLoaded', UI.init);
