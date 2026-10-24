// Balance report: plays thousands of AI-vs-AI matches with the real engine.
//   node tools/simulate.js [matches] [format]
const E = require('../www/js/engine.js');

function mkPlayer(id, bat, bowl, kind) {
  return { id, name: 'P' + id + ' X', tech: bat, power: bat, place: bat, temper: bat,
           kind: kind || (bowl > 50 ? 'pace' : 'none'), acc: bowl, move: bowl, traits: {}, fav: [] };
}
function mkTeam(id, bat, bowl) {
  const xi = [];
  for (let i = 0; i < 6; i++) xi.push(mkPlayer(id + i, bat, 25));
  for (let i = 6; i < 11; i++) xi.push(mkPlayer(id + i, 30, bowl, i % 2 ? 'pace' : 'spin'));
  return { id, name: 'Team ' + id, xi };
}
function run(n, format, a, b) {
  let runs = 0, wk = 0, balls = 0, fours = 0, sixes = 0, dots = 0, wins = 0, ties = 0;
  for (let s = 1; s <= n; s++) {
    const st = E.createMatch({ seed: s * 7919, format, teams: [mkTeam('A', ...a), mkTeam('B', ...b)], firstBat: s % 2 });
    E.simulate(st);
    for (const inn of st.innings) { runs += inn.runs; wk += inn.wkts; balls += inn.balls; }
    for (const ev of st.events) { if (ev.outcome === '4') fours++; if (ev.outcome === '6') sixes++; if (ev.outcome === '0') dots++; }
    if (st.result.winner === 0) wins++; if (st.result.winner === null) ties++;
  }
  const inns = n * 2;
  return { 'runs/inn': (runs / inns).toFixed(1), 'wkts/inn': (wk / inns).toFixed(2), rpo: (runs / balls * 6).toFixed(2),
           '4s%': (fours / balls * 100).toFixed(1), '6s%': (sixes / balls * 100).toFixed(1), 'dot%': (dots / balls * 100).toFixed(1),
           'A win%': (wins / n * 100).toFixed(1), 'tie%': (ties / n * 100).toFixed(1) };
}
const n = +process.argv[2] || 300, fmt = process.argv[3] || 't5';
console.log(`format=${fmt} matches=${n}`);
console.table({
  'even 60v60':        run(n, fmt, [60, 60], [60, 60]),
  'A strong bat 80':   run(n, fmt, [80, 60], [60, 60]),
  'A strong bowl 80':  run(n, fmt, [60, 80], [60, 60]),
  'A elite 85/85':     run(n, fmt, [85, 85], [55, 55]),
});
