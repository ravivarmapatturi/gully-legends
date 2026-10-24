// Game content: starter squad, generated opponents, league, economy constants.
// All names here are fictional and original to Gully Legends.

const MAX_TOKENS = 10, MAX_LEVEL = 5, TRAIN_COST = 150;
const SQUAD_MAX = 18, XI_SIZE = 11;
const ZONE_KEYS = ['fine', 'square', 'midwkt', 'longon', 'longoff', 'cover', 'point', 'third'];

// name, role, tech, power, place, temper, kind, acc, move, signature, fav zones, potential
const STARTER_SQUAD = [
  ['Arjun Rao',       'BAT',  76, 80, 66, 62, 'none', 20, 15, 'helicopter', ['longon', 'midwkt'], 92],
  ['Kabir Shetty',    'BAT',  78, 62, 80, 70, 'none', 25, 20, 'ramp',       ['third', 'cover'], 90],
  ['Rohan Pillai',    'WK',   72, 58, 74, 76, 'none', 10, 10, 'coolhead',   ['cover', 'point'], 86],
  ['Vikram Naidu',    'AR',   66, 70, 60, 64, 'pace', 62, 64, 'wristy',     ['midwkt', 'square'], 88],
  ['Dev Malhotra',    'AR',   60, 64, 58, 60, 'pace', 66, 70, 'express',    ['longoff', 'cover'], 87],
  ['Sameer Khan',     'BAT',  64, 74, 52, 58, 'none', 30, 25, 'helicopter', ['longon', 'longoff'], 84],
  ['Nikhil Joshi',    'AR',   58, 52, 64, 66, 'spin', 64, 66, 'wristy',     ['square', 'fine'], 85],
  ['Imran Qureshi',   'BOWL', 32, 40, 30, 50, 'pace', 78, 74, 'toecrusher', ['midwkt'], 90],
  ['Siddharth Iyer',  'BOWL', 28, 30, 34, 55, 'spin', 72, 78, 'mystery',    ['cover'], 89],
  ['Farhan Ali',      'BOWL', 34, 44, 30, 48, 'pace', 70, 70, 'golden',     ['longon'], 86],
  ['Tarun Bhat',      'BOWL', 30, 36, 32, 52, 'spin', 68, 66, 'mystery',    ['square'], 84],
  ['Aditya Menon',    'BAT',  62, 56, 66, 60, 'none', 22, 20, 'coolhead',   ['cover', 'longoff'], 83],
  ['Yusuf Patel',     'AR',   54, 60, 50, 56, 'pace', 60, 62, 'express',    ['midwkt', 'longon'], 82],
  ['Harsh Kulkarni',  'BOWL', 26, 30, 28, 50, 'pace', 66, 64, 'golden',     ['fine'], 82],
];

const BAT_SIGS = ['helicopter', 'ramp', 'coolhead', 'wristy'];
const BOWL_SIGS = ['toecrusher', 'mystery', 'express', 'golden'];
const FIRST = ['Ravi', 'Sunny', 'Ajay', 'Manoj', 'Kiran', 'Pranav', 'Varun', 'Aman', 'Gopal', 'Naveen', 'Rahul', 'Irfan', 'Karthik', 'Mohit', 'Sanjay', 'Deepak', 'Faisal', 'Ankit', 'Rohit', 'Vivek', 'Zubin', 'Akash', 'Jatin', 'Lokesh'];
const LAST = ['Reddy', 'Sharma', 'Das', 'Nair', 'Gill', 'Bose', 'Kapoor', 'Verma', 'Hegde', 'Pawar', 'Sinha', 'Chopra', 'Mehta', 'Rana', 'Sethi', 'Kamath', 'Desai', 'Ghosh'];
const CLUBS = [
  ['Lane 7 Lions', '#e67e22'], ['Chowk Chargers', '#16a085'], ['Railway Rockets', '#c0392b'], ['Market Mavericks', '#8e44ad'],
  ['Terrace Titans', '#2980b9'], ['Lakeside Legends', '#27ae60'], ['Metro Monarchs', '#d35400'], ['Harbour Hurricanes', '#34495e'],
  ['Fort Falcons', '#b7950b'], ['Temple Tuskers', '#a04000'], ['Canal Cobras', '#117a65'], ['Bazaar Blasters', '#943126'],
  ['Hilltop Hawks', '#5b2c6f'], ['Station Strikers', '#1f618d'], ['Garden Gladiators', '#196f3d'], ['Junction Jaguars', '#7e5109'],
  ['Pier Panthers', '#212f3d'], ['Mill Mustangs', '#6e2c00'], ['Bridge Bulls', '#78281f'], ['Colony Kings', '#4a235a'],
];

// Divisions: 5 (start) up to 1. Team strength rises as you climb.
const DIVISIONS = [
  null,
  { name: 'Premier Division', strength: 86 },
  { name: 'Division 2', strength: 79 },
  { name: 'Division 3', strength: 72 },
  { name: 'Division 4', strength: 65 },
  { name: 'Division 5', strength: 58 },
];
const LEAGUE_TEAMS = 6, PROMOTE = 2;

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function starterPlayer(row, i) {
  const [name, role, tech, power, place, temper, kind, acc, move, sig, fav, potential] = row;
  return { id: 'p' + i, name, role, tech, power, place, temper, kind, acc, move, sig, fav, potential,
           traits: {}, tokens: 2, xp: 0, level: 1, inXI: i < XI_SIZE, order: i, stats: { m: 0, r: 0, w: 0, hs: 0 } };
}

// Generates a believable player around a target rating. role: BAT, BOWL, AR, WK.
function genPlayer(r, role, strength, id) {
  const around = (base, spread) => Math.round(Math.max(15, Math.min(95, base + (r() - 0.5) * spread)));
  const batBase = role === 'BOWL' ? strength - 30 : role === 'AR' ? strength - 6 : strength;
  const bowlBase = role === 'BAT' || role === 'WK' ? 22 : role === 'AR' ? strength - 6 : strength;
  const kind = role === 'BAT' || role === 'WK' ? 'none' : r() < 0.55 ? 'pace' : 'spin';
  const sigs = role === 'BAT' || role === 'WK' ? BAT_SIGS : role === 'BOWL' ? BOWL_SIGS : (r() < 0.5 ? BAT_SIGS : BOWL_SIGS);
  const z1 = ZONE_KEYS[Math.floor(r() * 8)];
  let z2 = ZONE_KEYS[Math.floor(r() * 8)]; if (z2 === z1) z2 = ZONE_KEYS[(ZONE_KEYS.indexOf(z1) + 3) % 8];
  return {
    id, role, kind,
    name: FIRST[Math.floor(r() * FIRST.length)] + ' ' + LAST[Math.floor(r() * LAST.length)],
    tech: around(batBase, 16), power: around(batBase, 20), place: around(batBase, 16), temper: around(batBase, 16),
    acc: around(bowlBase, 14), move: around(bowlBase, 14),
    sig: sigs[Math.floor(r() * sigs.length)], fav: role === 'BOWL' ? [z1] : [z1, z2],
    potential: Math.min(95, Math.round(strength + 8 + r() * 12)),
    traits: genTraits(r, role, strength), tokens: 0, xp: 0, level: 1, stats: { m: 0, r: 0, w: 0, hs: 0 },
  };
}
function genTraits(r, role, strength) {
  const n = Math.max(0, Math.round((strength - 50) / 8 + r() * 2));
  const pool = role === 'BOWL' ? ['yorker', 'bouncer', 'slower', 'swing', 'death'] : role === 'AR' ? ['power', 'timing', 'swing', 'death', 'anchor'] : ['power', 'timing', 'finisher', 'anchor', 'pace'];
  const t = {};
  for (let i = 0; i < n; i++) { const k = pool[Math.floor(r() * pool.length)]; t[k] = Math.min(MAX_LEVEL, (t[k] || 0) + 1); }
  return t;
}

function genTeam(seed, name, color, strength) {
  const r = seeded(seed);
  const roles = ['BAT', 'BAT', 'WK', 'BAT', 'AR', 'AR', 'BAT', 'BOWL', 'BOWL', 'BOWL', 'BOWL'];
  const xi = roles.map((role, i) => genPlayer(r, role, strength, `t${seed}_${i}`));
  return { id: 't' + seed, name, color, xi, strength };
}

function newSeason(div, seasonNo, seed) {
  const r = seeded(seed);
  const pool = CLUBS.slice();
  const teams = [];
  for (let i = 0; i < LEAGUE_TEAMS - 1; i++) {
    const [name, color] = pool.splice(Math.floor(r() * pool.length), 1)[0];
    const strength = DIVISIONS[div].strength + Math.round((r() - 0.5) * 10);
    teams.push({ id: 'ai' + i, name, color, strength, seed: seed * 31 + i });
  }
  // Single round robin; the user plays one fixture per round.
  const ids = ['me', ...teams.map(t => t.id)];
  const rounds = [];
  const arr = ids.slice();
  for (let rd = 0; rd < arr.length - 1; rd++) {
    const pairs = [];
    for (let i = 0; i < arr.length / 2; i++) pairs.push([arr[i], arr[arr.length - 1 - i]]);
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop());
  }
  const table = {};
  for (const id of ids) table[id] = { p: 0, w: 0, l: 0, t: 0, pts: 0, rf: 0, bf: 0, ra: 0, ba: 0 };
  return { div, no: seasonNo, teams, rounds, round: 0, table, results: [], over: false };
}

function nrr(row) {
  const forRate = row.bf ? row.rf / (row.bf / 6) : 0, agRate = row.ba ? row.ra / (row.ba / 6) : 0;
  return forRate - agRate;
}
