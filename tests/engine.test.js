const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../www/js/engine.js');

function mkPlayer(id, bat, bowl, kind) {
  return { id, name: id + ' Test', tech: bat, power: bat, place: bat, temper: bat, kind: kind || 'none', acc: bowl, move: bowl, traits: {}, fav: [] };
}
function mkTeam(id, bat = 60, bowl = 60) {
  const xi = [];
  for (let i = 0; i < 6; i++) xi.push(mkPlayer(id + i, bat, 25));
  for (let i = 6; i < 11; i++) xi.push(mkPlayer(id + i, 30, bowl, 'pace'));
  return { id, name: id, xi };
}
const cfg = (seed, format = 't5', a = mkTeam('A'), b = mkTeam('B')) => ({ seed, format, teams: [a, b], firstBat: 0 });

test('shot probabilities form a valid distribution', () => {
  const st = E.createMatch(cfg(1));
  E.setBowler(st, E.eligibleBowlers(st)[0].id);
  for (const length of E.LENGTHS) for (const line of E.LINES) {
    const del = { line, length, fullToss: false };
    for (const z of E.ZONES) for (const type of ['ground', 'lofted']) {
      const { P } = E.shotOdds(st, { zone: z.k, type }, del);
      const sum = Object.values(P).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - 1) < 1e-9, `sum ${sum} for ${line}/${length}/${z.k}/${type}`);
      for (const v of Object.values(P)) assert.ok(v >= 0);
    }
    const d = E.shotOdds(st, { type: 'defend' }, del).P;
    assert.ok(Math.abs(Object.values(d).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  }
});

test('a fielder in the zone cuts boundary odds', () => {
  const st = E.createMatch(cfg(2));
  E.setBowler(st, E.eligibleBowlers(st)[0].id);
  const del = { line: 'off', length: 'full', fullToss: false };
  E.setField(st, { slip: false, inner: ['point', 'longoff', 'longon', 'midwkt', 'square'], deep: ['fine', 'third', 'square', 'midwkt'] });
  const open = E.shotOdds(st, { zone: 'cover', type: 'ground' }, del).P[4];
  E.setField(st, { slip: false, inner: ['point', 'cover', 'longon', 'midwkt', 'square'], deep: ['fine', 'third', 'square', 'midwkt'] });
  const blocked = E.shotOdds(st, { zone: 'cover', type: 'ground' }, del).P[4];
  assert.ok(open > 0.2 && blocked === 0, `open ${open} blocked ${blocked}`);
});

test('better batters score more against the same attack', () => {
  let weak = 0, strong = 0;
  for (let s = 1; s <= 60; s++) {
    weak += E.simulate(E.createMatch(cfg(s, 't5', mkTeam('A', 45), mkTeam('B')))).innings[0].runs;
    strong += E.simulate(E.createMatch(cfg(s, 't5', mkTeam('A', 85), mkTeam('B')))).innings[0].runs;
  }
  assert.ok(strong > weak * 1.2, `strong ${strong} weak ${weak}`);
});

test('same seed and decisions replay the exact same match', () => {
  const a = E.simulate(E.createMatch(cfg(42)));
  const b = E.replay(cfg(42), a.decisions);
  assert.deepEqual(b.events.map(e => e.text), a.events.map(e => e.text));
  assert.equal(b.result.text, a.result.text);
});

test('cricket rules hold for many simulated matches', () => {
  for (let s = 1; s <= 80; s++) {
    const st = E.simulate(E.createMatch(cfg(s, ['blitz', 't5', 't10'][s % 3])));
    const f = st.format;
    assert.ok(st.result, 'match finished');
    for (const inn of st.innings) {
      assert.ok(inn.balls <= f.overs * 6, 'never more than the overs');
      assert.ok(inn.wkts <= f.wickets, 'never more than the wickets');
      for (const [id, n] of Object.entries(inn.overs)) assert.ok(n <= f.maxOvers, `bowler ${id} over limit`);
      const batRuns = Object.values(inn.batStats).reduce((s, b) => s + b.r, 0);
      assert.equal(batRuns + inn.extras, inn.runs, 'runs add up');
    }
    // No bowler bowls two overs in a row.
    const overBowler = st.events.filter(e => e.outcome !== 'WD' && e.outcome !== 'NB')
      .reduce((m, e) => (m[e.inn + ':' + e.over] = e.bowler, m), {});
    for (const [k, b] of Object.entries(overBowler)) {
      const [i, o] = k.split(':').map(Number);
      if (overBowler[i + ':' + (o + 1)]) assert.notEqual(overBowler[i + ':' + (o + 1)], b);
    }
    // A chase stops the moment the target is reached.
    const second = st.innings[1];
    if (second && second.runs >= st.target) assert.equal(st.result.winner, second.bat);
  }
});

test('field rules are enforced', () => {
  const st = E.createMatch(cfg(3));
  assert.throws(() => E.setField(st, { slip: false, inner: ['point'], deep: ['fine'] }), /exactly 9/);
  assert.throws(() => E.setField(st, { slip: false, inner: ['point', 'cover', 'longoff'], deep: ['fine', 'square', 'midwkt', 'longon', 'third', 'cover'] }), /At most 5/);
  for (const p of Object.values(E.FIELD_PRESETS)) assert.equal(E.fieldError(E.normField(p)), null, p.name);
});

test('free hit cannot produce a dismissal', () => {
  const st = E.createMatch(cfg(9));
  E.setBowler(st, E.eligibleBowlers(st)[0].id);
  E.cur(st).freeHit = true;
  const { P } = E.shotOdds(st, { zone: 'longon', type: 'lofted' }, { line: 'stumps', length: 'good', fullToss: false });
  assert.equal(P.W, 0);
});

test('a no-ball shows and produces zero dismissal risk', () => {
  const st = E.createMatch(cfg(11));
  E.setBowler(st, E.eligibleBowlers(st)[0].id);
  const { P } = E.shotOdds(st, { zone: 'cover', type: 'lofted' }, { line: 'leg', length: 'yorker', fullToss: false, noBall: true });
  assert.equal(P.W, 0);
});
