// Static game data: traits, signature skills, starter squad, league.

const MAX_TOKENS = 10;     // trait tokens a player can ever own
const MAX_LEVEL = 5;       // max tokens in a single trait
const TRAIN_COST = 150;    // coins per training session (+1 token)
const OVERS = 2, BALLS = OVERS * 6, WKTS = 3;

// Customisable traits: players spend trait tokens on these, any mix up to 10.
const TRAITS = {
  power:    { name: 'Power Hitter',      icon: '💥', kind: 'bat',  desc: 'Clean hits fly for six more often' },
  timing:   { name: 'Timing Master',     icon: '🎯', kind: 'bat',  desc: 'Wider timing window on every ball' },
  finisher: { name: 'Finisher',          icon: '🔥', kind: 'bat',  desc: 'Last over: wider window, more sixes' },
  anchor:   { name: 'Anchor',            icon: '⚓', kind: 'bat',  desc: 'Mistimed shots get caught less' },
  pace:     { name: 'Pace Reader',       icon: '⚡', kind: 'bat',  desc: 'Fast bowling feels slower to you' },
  yorker:   { name: 'Yorker Specialist', icon: '🎳', kind: 'bowl', desc: 'Yorkers land more and take wickets' },
  bouncer:  { name: 'Bouncer Brute',     icon: '🪨', kind: 'bowl', desc: 'Bouncers are harder to score off' },
  slower:   { name: 'Slower Ball Magic', icon: '🐢', kind: 'bowl', desc: 'Slower balls fool batters more' },
  swing:    { name: 'Swing King',        icon: '🌀', kind: 'bowl', desc: 'Higher wicket chance every ball' },
  death:    { name: 'Death Bowler',      icon: '☠️', kind: 'bowl', desc: 'Concede fewer runs in the last over' },
};

// Signature skills: one per player, built in, never costs tokens.
const SIGNATURES = {
  helicopter: { name: 'Helicopter Shot', icon: '🚁', kind: 'bat',  desc: 'Perfect hits off yorkers always go for six' },
  ramp:       { name: 'Ramp Shot',       icon: '🛹', kind: 'bat',  desc: 'Well-timed bouncers always go to the rope' },
  coolhead:   { name: 'Cool Head',       icon: '🧊', kind: 'bat',  desc: 'Never caught off a well-timed shot' },
  wristy:     { name: 'Wristy Flicks',   icon: '🌊', kind: 'bat',  desc: 'No penalty for hitting against the line' },
  toecrusher: { name: 'Toe Crusher',     icon: '🦶', kind: 'bowl', desc: 'Yorkers never slip into full tosses' },
  mystery:    { name: 'Mystery Ball',    icon: '🎭', kind: 'bowl', desc: 'Batters can never read repeat deliveries' },
  express:    { name: 'Express Pace',    icon: '🚀', kind: 'bowl', desc: 'Batters find fewer boundaries off you' },
  golden:     { name: 'Golden Arm',      icon: '✨', kind: 'bowl', desc: 'Huge wicket chance on the last ball of an over' },
};

const STARTER_SQUAD = [
  // name, role, batting, bowling, signature
  ['Arjun Rao',      'BAT',  82, 20, 'helicopter'],
  ['Kabir Shetty',   'BAT',  78, 25, 'ramp'],
  ['Vikram Naidu',   'AR',   70, 66, 'wristy'],
  ['Rohan Pillai',   'WK',   72, 10, 'coolhead'],
  ['Dev Malhotra',   'AR',   62, 70, 'express'],
  ['Imran Qureshi',  'BOWL', 30, 80, 'toecrusher'],
  ['Siddharth Iyer', 'BOWL', 25, 76, 'mystery'],
  ['Farhan Ali',     'BOWL', 35, 72, 'golden'],
];

const LEAGUE = [
  { name: 'Lane 7 Lions',      rating: 44, color: '#e67e22' },
  { name: 'Chowk Chargers',    rating: 50, color: '#16a085' },
  { name: 'Railway Rockets',   rating: 55, color: '#c0392b' },
  { name: 'Market Mavericks',  rating: 60, color: '#8e44ad' },
  { name: 'Terrace Titans',    rating: 65, color: '#2980b9' },
  { name: 'Lakeside Legends',  rating: 70, color: '#27ae60' },
  { name: 'Metro Monarchs',    rating: 75, color: '#d35400' },
  { name: 'Harbour Hurricanes',rating: 80, color: '#2c3e50' },
  { name: 'Fort Falcons',      rating: 85, color: '#b7950b' },
  { name: 'Gully Gods',        rating: 90, color: '#7d3c98' },
];

const TIERS = [
  { min: 0, name: 'Bronze',   color: '#cd7f32' },
  { min: 2, name: 'Silver',   color: '#c0c7d0' },
  { min: 4, name: 'Gold',     color: '#f5c518' },
  { min: 6, name: 'Platinum', color: '#7fdbda' },
  { min: 8, name: 'Diamond',  color: '#9ad0ff' },
  { min: 10, name: 'Legend',  color: '#ff7ab6' },
];

const OPP_FIRST = ['Ravi', 'Sunny', 'Ajay', 'Manoj', 'Kiran', 'Nikhil', 'Pranav', 'Yusuf', 'Tarun', 'Harsh', 'Varun', 'Aman', 'Gopal', 'Sameer', 'Naveen'];
const OPP_LAST = ['K', 'M', 'S', 'R', 'P', 'D', 'T', 'V', 'B', 'N'];
const DELIVERY_KEYS = ['good', 'yorker', 'bouncer', 'slower'];
const DELIVERIES = {
  good:    { name: 'Good length', icon: '🎯', dB: 0.65, slow: 1 },
  yorker:  { name: 'Yorker',      icon: '🎳', dB: 0.96, slow: 1 },
  bouncer: { name: 'Bouncer',     icon: '🪨', dB: 0.45, slow: 1 },
  slower:  { name: 'Slower',      icon: '🐢', dB: 0.68, slow: 1.3 },
};

// Small seeded RNG so a league opponent's lineup is the same every visit.
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function makeOpponent(idx) {
  const t = LEAGUE[idx], r = seeded(idx * 977 + 13);
  const name = () => OPP_FIRST[Math.floor(r() * OPP_FIRST.length)] + ' ' + OPP_LAST[Math.floor(r() * OPP_LAST.length)] + '.';
  const batters = [0, 1, 2].map(i => {
    const weak = DELIVERY_KEYS[Math.floor(r() * 4)];
    let strong = DELIVERY_KEYS[Math.floor(r() * 4)];
    if (strong === weak) strong = DELIVERY_KEYS[(DELIVERY_KEYS.indexOf(weak) + 2) % 4];
    return { name: name(), rating: Math.round(t.rating + 6 - i * 4 + r() * 6), weak, strong };
  });
  const bowlers = [0, 1].map(() => ({ name: name(), rating: Math.round(t.rating + r() * 6 - 3) }));
  return { ...t, idx, batters, bowlers };
}

function tierFor(wins) {
  let tier = TIERS[0];
  for (const t of TIERS) if (wins >= t.min) tier = t;
  return tier;
}
