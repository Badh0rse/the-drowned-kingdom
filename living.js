// The Drowned Kingdom - living world.
// A persistent ledger of every household on the Isle of Carrow. Each island day it simulates aging,
// romance, marriage, pregnancy, births, schooling, careers, businesses, the Adventurers' Guild,
// cults, gossip, deaths, disappearances and inheritance, and writes the Chronicle.
// Ledger residents walk the streets as real NPCs by day and go home at night.
// Hooks (from DrownedKingdom.html): LW.begin(continued), LW.minute(), LW.save(), LW.open().
(() => {
'use strict';
const KEY = 'drownedKingdom.living.v1';
const R = Math.random, pick = a => a[Math.floor(R() * a.length)], chance = p => R() < p;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const G = () => window.SW;
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let W = null, lastDay = -1, lastHour = -1, ui = {tab: 'houses', house: null, filter: 'all'};

// ---------------- personality ----------------
// adv: volunteers for danger · love: romance drive · kids: wants children · cult: drawn to the Choir
// work: pay multiplier · gos: spreads gossip · fight: picks quarrels · san: steadiness
const TRAITS = {
 brave:        ['🦁','Brave',        {adv:.5,fight:.1}],
 cowardly:     ['🐇','Cowardly',     {adv:-.8,san:-.1}],
 ambitious:    ['📈','Ambitious',    {adv:.2,work:.15}],
 lazy:         ['🛌','Lazy',         {work:-.2}],
 loyal:        ['🤝','Loyal',        {love:.05}],
 fickle:       ['🎭','Fickle',       {love:.2,fight:.1}],
 jealous:      ['💢','Jealous',      {fight:.25}],
 romantic:     ['🌹','Romantic',     {love:.45}],
 greedy:       ['💰','Greedy',       {work:.1,cult:.15,fight:.1}],
 generous:     ['🎁','Generous',     {}],
 curious:      ['🔍','Curious',      {adv:.25,cult:.1}],
 superstitious:['🧂','Superstitious',{cult:.2,san:-.05}],
 compassionate:['💗','Compassionate',{}],
 ruthless:     ['🗡️','Ruthless',     {adv:.2,cult:.2,fight:.2}],
 cheerful:     ['🌞','Cheerful',     {san:.15}],
 gloomy:       ['🌧️','Gloomy',       {san:-.15,cult:.1}],
 pious:        ['🕯️','Pious',        {cult:-.3,san:.1}],
 skeptic:      ['🧐','Skeptic',      {cult:-.2}],
 hotheaded:    ['🔥','Hot-headed',   {fight:.35,adv:.15}],
 calm:         ['🌊','Calm',         {fight:-.2,san:.1}],
 gossip:       ['🗣️','Gossip',       {gos:.6}],
 secretive:    ['🤐','Secretive',    {gos:-.4,cult:.1}],
 familyminded: ['🏡','Family-minded',{kids:.6,adv:-.3}],
 reckless:     ['🎲','Reckless',     {adv:.4,san:-.05}],
 cautious:     ['🛡️','Cautious',     {adv:-.3}],
 proud:        ['👑','Proud',        {fight:.15}],
 humble:       ['🌾','Humble',       {fight:-.1}],
 scholarly:    ['📚','Scholarly',    {work:.1,cult:.05}],
 drunkard:     ['🍺','Drunkard',     {work:-.15,fight:.15,san:-.05}],
 hardworking:  ['⚒️','Hardworking',  {work:.25}],
 seaborn:      ['🐚','Sea-born',     {adv:.1,cult:.1}],
 haunted:      ['👁️','Haunted',      {san:-.2}],
};
const OPP = [['brave','cowardly'],['ambitious','lazy'],['loyal','fickle'],['greedy','generous'],['compassionate','ruthless'],['cheerful','gloomy'],['pious','skeptic'],['hotheaded','calm'],['gossip','secretive'],['reckless','cautious'],['proud','humble'],['hardworking','lazy']];
const CLASH = [['pious','ruthless'],['jealous','fickle'],['proud','proud'],['hotheaded','hotheaded'],['greedy','greedy'],['skeptic','superstitious'],['gossip','secretive'],['drunkard','pious']];
const BOND = [['romantic','romantic'],['curious','scholarly'],['cheerful','cheerful'],['brave','brave'],['familyminded','familyminded'],['generous','compassionate'],['loyal','loyal'],['seaborn','seaborn'],['gossip','gossip'],['calm','calm'],['pious','pious'],['drunkard','drunkard']];
const isOpp = (a, b) => OPP.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
const tsum = (per, k) => per.traits.reduce((s, t) => s + ((TRAITS[t] || [0,0,{}])[2][k] || 0), 0);
const has = (per, t) => per.traits.includes(t);
function rollTraits(n, from) {
 const out = [];
 for (const t of (from || [])) if (out.length < n && !out.includes(t) && !out.some(o => isOpp(o, t))) out.push(t);
 let guard = 0;
 while (out.length < n && guard++ < 50) { const t = pick(Object.keys(TRAITS)); if (!out.includes(t) && !out.some(o => isOpp(o, t))) out.push(t); }
 return out;
}
function compat(a, b) {
 let s = 0;
 for (const x of a.traits) for (const y of b.traits) {
  if (x === y) s += 8;
  if (isOpp(x, y)) s -= 10;
  if (CLASH.some(([p, q]) => (p === x && q === y) || (p === y && q === x))) s -= 12;
  if (BOND.some(([p, q]) => (p === x && q === y) || (p === y && q === x))) s += 12;
 }
 return s;
}
// What a personality "is", in a phrase: shown on cards
function archetype(per) {
 const t = per.traits, A = (x, y) => t.includes(x) && (!y || t.includes(y));
 if (A('brave','reckless')) return 'Glory-seeker'; if (A('greedy','ruthless')) return 'Shark';
 if (A('romantic','fickle')) return 'Heartbreaker'; if (A('familyminded','compassionate')) return 'Hearth-keeper';
 if (A('scholarly','curious')) return 'Seeker of Lore'; if (A('superstitious','gloomy')) return 'Doom-watcher';
 if (A('gossip')) return 'Town Crier'; if (A('pious')) return 'Faithful'; if (A('drunkard')) return 'Tavern Regular';
 if (A('hardworking','ambitious')) return 'Climber'; if (A('cowardly')) return 'Survivor'; if (A('secretive')) return 'Closed Book';
 if (A('cheerful')) return 'Bright Spark'; if (A('haunted')) return 'Haunted Soul'; if (A('seaborn')) return 'Child of the Tide';
 return 'Islander';
}

// ---------------- names, jobs ----------------
const FN_F = ['Morwenna','Elowen','Demelza','Tamsin','Isolde','Wren','Briony','Nell','Hedra','Kerra','Lowenna','Senara','Jenna','Merryn','Ysella','Bryluen','Rosen','Tressa','Agnes','Maud','Edith','Sybil','Hester','Orla','Ada','Clemency','Lark','Mirren','Perpetua','Rhoswen','Ottilie','Grisel','Annick','Bettany','Coral','Delphine','Ebba','Fen','Gwenna','Iona'];
const FN_M = ['Corwen','Jory','Lowen','Bram','Tobin','Silas','Ansel','Cael','Ewan','Kit','Merrick','Piran','Tristan','Jago','Austol','Hal','Ned','Amos','Ezra','Gideon','Barnaby','Cuthbert','Elias','Fennick','Garth','Hob','Ivo','Josiah','Lorcan','Mabon','Obed','Percival','Quillon','Rook','Thaddeus','Ulric','Wystan','Zebedee','Aldous','Crispin'];
const SURN = ['Pellow','Tregarth','Hask','Mowbray','Penhallow','Ashgrove','Vosper','Kittow','Trelawne','Blackmore','Saltash','Gullick','Rowse','Jago','Chenoweth','Marsh','Hollins','Crane','Whitlock','Dunmore','Tresize','Pascoe','Nankervis','Rudd','Gloom','Fathom','Brinecombe','Wetherell','Lantry','Moyle','Skewes','Odgers','Polgrain','Carne','Treloar','Varcoe','Hendy','Cowling','Bray','Eddy'];
// [name, pay/day, model, icon]
const JOBS = {
 fisher:['Fisher',14,'Rogue','🎣'], netmender:['Net-mender',10,'Rogue','🪢'], dockhand:['Dockhand',12,'Barbarian','⚓'],
 fishmonger:['Fishmonger',15,'Rogue','🐟'], baker:['Baker',13,'Mage','🍞'], brewer:['Brewer',14,'Barbarian','🍺'],
 innkeeper:['Innkeeper',16,'Barbarian','🛏️'], smith:['Blacksmith',18,'Barbarian','⚒️'], carpenter:['Carpenter',15,'Barbarian','🪚'],
 farmer:['Farmer',11,'Rogue','🌾'], shepherd:['Shepherd',9,'Rogue','🐑'], apothecary:['Apothecary',20,'Mage','⚗️'],
 scholar:['Scholar',17,'Mage','📜'], teacher:['Teacher',13,'Mage','🍎'], priest:['Priest',12,'Mage','🕯️'],
 lamplighter:['Lamplighter',9,'Rogue','🏮'], guard:['Watchman',15,'Knight','🛡️'], merchant:['Merchant',22,'Mage','⚖️'],
 shipwright:['Shipwright',19,'Barbarian','🚢'], gravedigger:['Gravedigger',10,'Barbarian','⚰️'], midwife:['Midwife',14,'Mage','👶'],
 bellringer:['Bell-ringer',8,'Rogue','🔔'], saltboiler:['Salt-boiler',11,'Barbarian','🧂'], adventurer:['Adventurer',0,'Knight','⚔️'],
};
const RANKS = ['Apprentice','Journeyman','Master','Guildmaster'];
const BUSINESS = {
 fisher:['Fishing Boat','{n} & Daughters Fishing Co.','The {n} Boat'], fishmonger:['Seafood Market','{n}\'s Catch','The Briny Barrow'],
 baker:['Bakery','{n}\'s Ovens','The Salted Loaf'], brewer:['Brewery','{n} Brewhouse','The Black Tide Brewery'],
 innkeeper:['Inn','The Drowned Lantern','The Gull & Anchor','The {n} Arms'], smith:['Smithy','{n} Ironworks','The Rusted Hook'],
 farmer:['Farm','{n} Farm','Cliffside Croft'], apothecary:['Apothecary','{n}\'s Remedies','The Green Bottle'],
 merchant:['General Store','{n} & Co.','The Tidewrack Emporium'], scholar:['Library','The {n} Collection','The Sunken Shelf'],
 shipwright:['Shipyard','{n} Yards','Keel & Rib'], adventurer:['Relic Trading House','{n} Curios','The Barnacled Idol'],
 teacher:['School','The {n} School','Saltmere Dame School'],
};
const RACES = [['human',.8],['dwarf',.07],['gnome',.06],['nelf',.04],['draenei',.03]];
const pickRace = () => { let r = R(); for (const [k, w] of RACES) { if ((r -= w) < 0) return k; } return 'human'; };
const HCOLORS = ['#6b4a3a','#3a5a6b','#4a6b3a','#5a3a6b','#6b6b3a','#3a6b62','#7a3a3a','#3a3a7a','#555555','#6b553a','#2e5a4a','#5a2e4a'];

// ---------------- settings (Neighborhood > Settings) ----------------
const CFG_DEF = {yearDays: 6, houseMax: 8, autonomy: 1, drama: 1, births: 1, finance: 1, danger: 1, cosmic: 1, sanity: 1, permadeath: true, popCap: 180, walkers: 14};
const CFG_UI = [
 ['yearDays','Island days per year (aging speed)',[3,6,10,20]], ['houseMax','Household size limit',[4,6,8,12]],
 ['autonomy','Neighbor autonomy',[[.5,'Low'],[1,'Normal'],[1.5,'High']]], ['drama','Relationships & drama',[[.4,'Gentle'],[1,'Normal'],[1.8,'Soap opera']]],
 ['births','Pregnancy & births',[[.4,'Rare'],[1,'Normal'],[2,'Many']]], ['finance','Household money difficulty',[[.7,'Easy'],[1,'Normal'],[1.4,'Hard']]],
 ['danger','Dungeon danger',[[.5,'Low'],[1,'Normal'],[1.6,'Deadly']]], ['cosmic','Cosmic attack frequency',[[.5,'Rare'],[1,'Normal'],[1.6,'Often']]],
 ['sanity','Sanity difficulty',[[.6,'Gentle'],[1,'Normal'],[1.5,'Harsh']]], ['permadeath','Permanent death',[[true,'On'],[false,'Off (they recover)']]],
 ['popCap','Neighborhood population limit',[100,180,260]], ['walkers','Residents out walking at once',[6,14,22,30]],
];

// ---------------- core ledger ----------------
const P = id => W.people[id], H = id => W.houses[id];
const alive = per => per && !per.dead && !per.gone;
const age = per => W.yr - per.born;
const stage = per => { const a = age(per); return a < 1 ? 'Baby' : a < 3 ? 'Toddler' : a < 13 ? 'Child' : a < 18 ? 'Teen' : a < 60 ? 'Adult' : 'Elder'; };
const adult = per => age(per) >= 18;
const fullName = per => per.npc || (per.first + ' ' + per.last);
const yearOf = y => 'Year ' + (Math.floor(y) + 1);
function newPerson(o) {
 const id = 'q' + (W.nid++);
 const per = Object.assign({id, first: '', last: '', sex: chance(.5) ? 'f' : 'm', born: W.yr - 25, traits: rollTraits(3), job: null, rank: 0,
  house: null, mom: null, dad: null, spouse: null, ex: [], kids: [], adv: 0, xp: 0, mem: [], rel: {}, race: 'human', san: 80 + Math.floor(R() * 20)}, o);
 if (!per.first) per.first = pick(per.sex === 'f' ? FN_F : FN_M);
 W.people[id] = per; return per;
}
function newHouse(name, o) {
 const id = 'h' + (W.nid++);
 W.houses[id] = Object.assign({id, name, members: [], wealth: 60 + Math.floor(R() * 160), rep: 50, color: pick(HCOLORS), biz: null, relics: [], debt: 0, founded: W.yr, prep: 0}, o);
 return W.houses[id];
}
function moveIn(per, h) {
 if (per.house && H(per.house)) H(per.house).members = H(per.house).members.filter(x => x !== per.id);
 per.house = h.id; if (!h.members.includes(per.id)) h.members.push(per.id);
}
const living = h => h.members.map(P).filter(alive);
function remember(per, t, w = 1, k = '') {
 if (!per) return; per.mem.push({y: W.yr, t, w, k});
 if (per.mem.length > 12) { per.mem.sort((a, b) => (b.w * 3 + b.y) - (a.w * 3 + a.y)); per.mem.length = 10; per.mem.sort((a, b) => a.y - b.y); }
}
function relAdd(a, b, d) { if (!a || !b || a === b) return; a.rel[b.id] = clamp((a.rel[b.id] || 0) + d, -100, 100); b.rel[a.id] = clamp((b.rel[a.id] || 0) + d * .8, -100, 100); }
const relOf = (a, b) => a.rel[b.id] || 0;
const kin = (a, b) => a === b || a.mom === b.id || a.dad === b.id || b.mom === a.id || b.dad === a.id || (a.mom && a.mom === b.mom) || (a.dad && a.dad === b.dad)
 || [a.mom, a.dad].some(x => x && P(x) && (P(x).mom === b.mom && b.mom || P(x).dad === b.dad && b.dad));
// Chronicle: k = birth|death|marriage|adventure|scandal|business|disaster|gossip|family|guild|politics
// secret entries only appear to the player once gossip carries them to the player's household
function chron(k, t, ids = [], o = {}) {
 const e = Object.assign({y: W.yr, d: W.day, k, t, ids, secret: 0, known: 0}, o);
 W.chron.push(e); if (W.chron.length > 2500) W.chron.splice(0, W.chron.length - 2500);
 if (!e.secret && o.loud && G().chat) G().chat('📰 ' + t, 'sys');
 return e;
}
const plainName = per => esc(fullName(per));

// ---------------- seeding ----------------
function seed() {
 W = {v: 1, nid: 1, yr: 0, day: 0, people: {}, houses: {}, chron: [], cfg: Object.assign({}, CFG_DEF), contracts: [], parties: [], market: {fish: 1, arms: 1, grain: 1}, rumors: [], playerHouse: null, walking: []};
 const S = G().S; W.day = Math.floor(S.time / 1440);
 // 1) the island's existing townsfolk become ledger residents (never killed at random: the town needs them)
 const usedLast = new Set();
 const phys = G().npcs.filter(n => !n.beast && n.race !== 'gillkin' && !n.child && !n.kid && !n.isPet);
 const byName = {};
 for (const n of phys) {
  const parts = n.name.split(' '), title = /^(Guard|Sister|Brother|Magister|Captain|Old|Lady|Sir|Deckhand|Sailor|Apprentice|Doomsayer|Banker|Father|Mother|Master|Madame|Professor|Trainer|Innkeeper|Scout|Sergeant|Lieutenant|Commander|Priest|Priestess|Archmage|Chef|Mayor|Harbormaster|Grandma|Grandpa)$/.test(parts[0]);
  const last = parts.length > 1 && !title ? parts[parts.length - 1] : pick(SURN.filter(s => !usedLast.has(s))) || pick(SURN);
  const per = newPerson({npc: n.name, first: parts.length === 2 && !title ? parts[0] : n.name, last, sex: /Sister|Lady|Madame|Mother|Grandma|Priestess|Mira|Hilda|Marla|Amelia|Prudence|Elarae|Lumina|Nell|Ysolde|Brindle/.test(n.name) ? 'f' : chance(.5) ? 'f' : 'm',
   born: W.yr - (n.name.startsWith('Old') ? 70 : 20 + Math.floor(R() * 35)), race: n.race || 'human', protect: 1, job: n.guard ? 'guard' : null, rank: 1 + Math.floor(R() * 2)});
  usedLast.add(last); byName[n.name] = per;
 }
 for (const per of Object.values(W.people)) {
  if (per.house) continue;
  const n = G().npcs.find(x => x.name === per.npc), mate = n && n.partner && byName[n.partner];
  const h = newHouse(per.last); moveIn(per, h);
  if (mate && !mate.house) { moveIn(mate, h); marry(per, mate, true); }
 }
 // 2) many ordinary island families, generated with history (parents, grandparents, kids, some already gone)
 const target = 28;
 for (let i = 0; i < target; i++) genFamily(SURN.filter(s => !usedLast.has(s))[0] || pick(SURN) + (i % 3 ? '' : '-' + pick(SURN)), usedLast);
 // fill jobs
 for (const per of Object.values(W.people)) if (!per.job && age(per) >= 16) assignJob(per);
 // starting friendships and rivalries from compatibility
 const adults = Object.values(W.people).filter(x => adult(x));
 for (let i = 0; i < adults.length * 3; i++) { const a = pick(adults), b = pick(adults); if (a !== b) relAdd(a, b, compat(a, b) * (1 + R())); }
 // a few adventurers already registered, a secret or two already buried
 for (const per of adults.filter(x => tsum(x, 'adv') > .3 && age(x) < 45 && !x.protect).slice(0, 10)) { per.job = 'adventurer'; per.adv = 1 + Math.floor(R() * 5); }
 for (const per of adults.filter(x => tsum(x, 'cult') > .25).slice(0, 3)) joinCult(per, true);
 chron('politics', 'The Saltmere Tidings prints its first issue of the new year. The editor promises "only the truth, and the tide tables."');
}
function genFamily(last, used) {
 used.add(last);
 const h = newHouse(last);
 const cls = R();
 h.wealth = Math.round(cls < .15 ? 20 + R() * 40 : cls < .75 ? 100 + R() * 250 : cls < .95 ? 400 + R() * 600 : 1200 + R() * 1500);
 const race = pickRace(), pa = 26 + Math.floor(R() * 30);
 const a = newPerson({last, sex: 'm', born: W.yr - pa, race}), b = newPerson({last, sex: 'f', born: W.yr - pa + Math.floor(R() * 8 - 4), race: chance(.85) ? race : pickRace()});
 if (chance(.08)) b.sex = 'm'; else if (chance(.08)) a.sex = 'f';
 if (a.sex === b.sex) { a.first = pick(a.sex === 'f' ? FN_F : FN_M); b.first = pick(b.sex === 'f' ? FN_F : FN_M); }
 const single = chance(.18);
 moveIn(a, h); if (!single) { moveIn(b, h); marry(a, b, true); } else delete W.people[b.id];
 // grandparent living with them, or remembered
 if (chance(.4)) {
  const g = newPerson({last, sex: chance(.5) ? 'f' : 'm', born: W.yr - pa - 25 - Math.floor(R() * 8), race});
  a.mom = g.sex === 'f' ? g.id : null; a.dad = g.sex === 'm' ? g.id : null; g.kids.push(a.id);
  if (chance(.6)) moveIn(g, h); else { g.dead = 1; g.died = W.yr - R() * 8; g.cause = pick(['the fever winter','old age','the sea','a fall from the cliffs','unknown causes']); g.house = h.id; h.members.push(g.id); }
 }
 const nk = single ? Math.floor(R() * 2) : Math.floor(R() * 5);
 for (let k = 0; k < nk; k++) {
  const ka = Math.max(0, pa - 20 - Math.floor(R() * 4) - k * 3 + Math.floor(R() * 3));
  if (ka < 0) continue;
  const mom = a.sex === 'f' ? a : b, dad = a.sex === 'm' ? a : b;
  const c = newPerson({last, born: W.yr - ka - R(), race: chance(.5) ? a.race : b.race, mom: single ? null : mom.id, dad: dad.id, traits: rollTraits(3, [pick(a.traits), pick((single ? a : b).traits)])});
  a.kids.push(c.id); if (!single) b.kids.push(c.id); moveIn(c, h);
 }
 if (chance(.12) && !single) { // a household already marked by loss
  const lost = h.members.map(P).filter(x => adult(x) && !x.dead)[0];
  if (lost && lost !== a) { lost.gone = 1; lost.goneY = W.yr - R() * 2; lost.cause = 'vanished in the sea caves'; for (const m of living(h)) remember(m, `${fullName(lost)} went into the sea caves and never came back.`, 4, 'loss'); }
 }
 return h;
}
function assignJob(per) {
 const h = H(per.house), parent = [per.mom, per.dad].map(x => x && P(x)).find(x => x && x.job && x.job !== 'adventurer');
 if (parent && chance(.45)) { per.job = parent.job; per.rank = 0; remember(per, `Learned the ${JOBS[parent.job][0].toLowerCase()}'s trade from ${parent.first}.`, 2, 'family'); return; }
 const pool = Object.keys(JOBS).filter(j => j !== 'adventurer');
 per.job = has(per, 'scholarly') && chance(.5) ? pick(['scholar','teacher','apothecary']) : has(per, 'pious') && chance(.4) ? 'priest' : has(per, 'seaborn') && chance(.6) ? pick(['fisher','shipwright','dockhand']) : pick(pool.concat(['fisher','fisher','fishmonger','dockhand']));
 per.rank = h && h.wealth > 800 ? 1 : 0;
}

// ---------------- life events ----------------
function marry(a, b, quiet) {
 a.spouse = b.id; b.spouse = a.id; relAdd(a, b, 60);
 if (quiet) return;
 const ha = H(a.house), hb = H(b.house);
 let to = living(ha).length <= living(hb).length ? ha : hb;
 const max = W.cfg.houseMax;
 if (living(to).length + 1 > max || (a.protect && b.protect)) to = null;
 if (to) { const mover = to === ha ? b : a; moveIn(mover, to); } else if (!a.protect || !b.protect) { const nh = newHouse(a.protect ? a.last : b.last); if (!a.protect) moveIn(a, nh); if (!b.protect) moveIn(b, nh); }
 remember(a, `Married ${fullName(b)}.`, 5, 'love'); remember(b, `Married ${fullName(a)}.`, 5, 'love');
 const e = chron('marriage', `${plainName(a)} and ${plainName(b)} were married at the chapel on the cliff. ${pick(['The bells rang twelve times. Everyone counted.','It rained, which is lucky. It always rains.','The bride\'s grandmother salted the doorway, just in case.','Half the harbor came. The other half sent fish.'])}`, [a.id, b.id]);
 for (const per of [a, b]) for (const k of per.kids.map(P).filter(alive)) remember(k, `${fullName(per)} remarried.`, 3, 'family');
 return e;
}
function birth(mom, dad) {
 const h = H(mom.house), last = dad ? dad.last : mom.last;
 const c = newPerson({last, born: W.yr, race: chance(.5) || !dad ? mom.race : dad.race, mom: mom.id, dad: dad ? dad.id : null, traits: rollTraits(3, [pick(mom.traits), dad ? pick(dad.traits) : null].filter(Boolean)), san: 90});
 mom.kids.push(c.id); if (dad) dad.kids.push(c.id); moveIn(c, h);
 if (chance(.04)) { c.traits[2] = 'seaborn'; c.marked = 1; }
 remember(mom, `Gave birth to ${c.first}.`, 5, 'family'); if (dad) remember(dad, `${c.first} was born.`, 5, 'family');
 for (const s of mom.kids.map(P).filter(x => x && x !== c && alive(x))) remember(s, `A new ${c.sex === 'f' ? 'sister' : 'brother'}, ${c.first}.`, 3, 'family');
 chron('birth', `A ${c.sex === 'f' ? 'daughter' : 'son'}, ${esc(c.first)}, was born to ${plainName(mom)}${dad ? ' and ' + plainName(dad) : ''}.${c.marked ? ' The midwife says the child was born with the caul, and did not cry. The tide came in early that night.' : ''}`, [c.id, mom.id]);
 return c;
}
function die(per, cause, o = {}) {
 if (per.dead) return;
 per.dead = 1; per.died = W.yr; per.cause = cause;
 if (per.npc) G().removeCitizen(per.npc);
 const sp = per.spouse && P(per.spouse);
 if (sp) { remember(sp, `${fullName(per)} died (${cause}). The bed is cold.`, 6, 'grief'); sp.widowed = 1; sp.spouse = null; sp.san = clamp(sp.san - 20, 0, 100); }
 for (const k of per.kids.map(P).filter(alive)) { remember(k, `${fullName(per)} died: ${cause}.`, 6, 'grief'); k.san = clamp(k.san - 15, 0, 100); }
 for (const q of [per.mom, per.dad].map(x => x && P(x)).filter(alive)) remember(q, `Buried ${per.first}. No parent should.`, 6, 'grief');
 for (const [id, v] of Object.entries(per.rel)) if (v > 40 && P(id) && alive(P(id))) remember(P(id), `Lost my friend ${fullName(per)}.`, 3, 'grief');
 { const me = W.me && P(W.me); if (me && per !== me && G().feel) { const close = (per.rel[me.id] || 0) > 40 || per.id === me.spouse; if (close) G().feel(per.id === me.spouse ? 'heartbroken' : 'grieving', 1440, `${fullName(per)} is gone.`); } }
 chron('death', o.text || `${plainName(per)} died at ${Math.floor(age(per))}: ${esc(cause)}. ${pick(['The bell tolled once.','Salt was laid on the threshold.','The family asks for quiet.','The gulls were silent at the burial.'])}`, [per.id], {loud: per.protect || per.house === W.playerHouse});
 inherit(per);
}
function vanish(per, where) {
 per.gone = 1; per.goneY = W.yr; per.cause = where;
 if (per.npc) G().removeCitizen(per.npc);
 const sp = per.spouse && P(per.spouse);
 if (sp) remember(sp, `${fullName(per)} went into ${where} and has not come home. I still set a place at the table.`, 6, 'loss');
 for (const k of per.kids.map(P).filter(alive)) remember(k, `${fullName(per)} disappeared in ${where}.`, 6, 'loss');
 for (const q of [per.mom, per.dad].map(x => x && P(x)).filter(alive)) remember(q, `${per.first} is missing. I keep the lamp lit.`, 6, 'loss');
 chron('death', `${plainName(per)} has gone missing in ${esc(where)}. Search parties found only a lantern, still burning.`, [per.id], {missing: 1});
 // a missing person is a contract for the guild
 W.contracts.push({id: W.nid++, type: 'missing', tier: 2 + Math.floor(R() * 2), target: per.id, title: `Find ${fullName(per)}`, giver: sp ? sp.id : null, posted: W.yr});
}
// Wills follow island custom: the house keeps the home; personal relics go to the eldest child;
// savings split between the spouse and the children; a household left empty passes to the nearest kin.
function inherit(per) {
 const h = H(per.house); if (!h) return;
 const heirs = per.kids.map(P).filter(alive).sort((a, b) => b.born - a.born).reverse();
 if (per.relics && per.relics.length) {
  const to = heirs[0] || (per.spouse && P(per.spouse)) || living(h)[0];
  if (to) { to.relics = (to.relics || []).concat(per.relics); for (const r of per.relics) remember(to, `Inherited ${r.name} from ${per.first}.${r.cursed ? ' It hums at night.' : ''}`, 4, 'family'); per.relics = []; }
 }
 if (living(h).length === 0) {
  const heir = heirs[0] || [per.mom, per.dad].map(x => x && P(x)).find(alive);
  if (heir && H(heir.house) && heir.house !== h.id) {
   const hh = H(heir.house); hh.wealth += Math.max(0, h.wealth); hh.debt += h.debt; if (h.biz && !hh.biz) { hh.biz = h.biz; }
   chron('family', `The ${esc(h.name)} house stands empty. ${plainName(heir)} inherits ${h.wealth > 0 ? Math.round(h.wealth) + ' gold' : 'only debts'}${h.biz ? ' and ' + esc(h.biz.name) : ''}.`, [heir.id]);
   h.wealth = 0; h.biz = null; h.empty = 1;
   if (heirs.length > 1 && heirs.some(x => has(x, 'greedy'))) { const g = heirs.find(x => has(x, 'greedy')); for (const o of heirs) if (o !== g) relAdd(g, o, -40); chron('scandal', `Bitter words between the ${esc(h.name)} siblings over the will. ${plainName(g)} says ${heir.first} "always got everything."`, [g.id, heir.id]); }
  } else { h.empty = 1; chron('family', `The ${esc(h.name)} house stands empty. Its windows are already salted over.`); }
 } else if (heirs.length > 1 && h.wealth > 300 && heirs.some(x => has(x, 'greedy') && adult(x))) {
  const g = heirs.find(x => has(x, 'greedy')); for (const o of heirs) if (o !== g && adult(o)) relAdd(g, o, -30);
  chron('scandal', `The ${esc(h.name)} will is contested. ${plainName(g)} has hired a notary. Dinners at the ${esc(h.name)} house are very quiet.`, [g.id]);
 }
}
function joinCult(per, quiet) {
 per.cult = 1; remember(per, 'Heard the singing under the harbor, and answered it. The Choir of the Tide Below meets on the dark of the moon.', 5, 'cult');
 const h = H(per.house);
 const e = chron('scandal', `${plainName(per)} of the ${esc(h ? h.name : '?')} house has joined the Choir of the Tide Below.`, [per.id], {secret: 1, spread: quiet ? 2 : 1});
 return e;
}

// ---------------- the Adventurers' Guild (off-screen expeditions) ----------------
const CONTRACT_T = {
 dungeon: ['Clear the {p}', ['Catacombs under the chapel','flooded mine at Hammerdeep','drowned crypt at Gull Point','sea caves past the reef']],
 hunt: ['Hunt the {p}', ['thing taking sheep on the moor','gillkin raiders on the north shore','pale eel in the reservoir','bone-crab under the pier']],
 relic: ['Recover the {p}', ['bell of the sunken chapel','idol-eye from the trench','drowned king\'s ring','lantern of the first keeper']],
 escort: ['Escort {p}', ['a salt caravan to Port Wick','the Archivist to the cliff library','a pilgrim to the standing stones']],
};
function postContracts() {
 while (W.contracts.filter(c => !c.taken).length < 5) {
  const type = pick(Object.keys(CONTRACT_T)), [fmt, places] = CONTRACT_T[type];
  const rich = pick(Object.values(W.houses).filter(h => h.wealth > 600 && !h.empty)) ;
  W.contracts.push({id: W.nid++, type, tier: 1 + Math.floor(R() * 4), title: fmt.replace('{p}', pick(places)), patron: rich && chance(.4) ? rich.id : null, posted: W.yr});
 }
 if (W.contracts.length > 30) W.contracts = W.contracts.filter(c => !c.done).slice(-30);
}
function formParties() {
 const free = Object.values(W.people).filter(per => alive(per) && per.job === 'adventurer' && !per.away && !per.injured && !per.player && !per.pkid && adult(per));
 for (const c of W.contracts.filter(c => !c.taken && !c.done)) {
  if (free.length < 2 || !chance(.22 * W.cfg.autonomy)) continue;
  free.sort(() => R() - .5);
  const lead = free.shift();
  // protective parents with babies and the cowardly turn it down; friends join friends
  const pool = free.filter(x => !(x.kids.some(k => P(k) && age(P(k)) < 3 && has(x, 'familyminded'))) && !has(x, 'cowardly')).sort((a, b) => relOf(lead, b) - relOf(lead, a));
  const size = 1 + Math.floor(R() * 3), mem = [lead].concat(pool.slice(0, size));
  for (const m of mem) { const i = free.indexOf(m); if (i >= 0) free.splice(i, 1); m.away = c.id; }
  c.taken = 1;
  W.parties.push({c: c.id, ids: mem.map(m => m.id), back: W.yr + (1 + Math.floor(R() * 3)) / W.cfg.yearDays});
  for (const m of mem) for (const f of living(H(m.house)).filter(x => x !== m)) remember(f, `${m.first} left to ${c.title.toLowerCase()}. Said not to wait up.`, 1, 'worry');
 }
}
function resolveParties() {
 for (const pt of W.parties.slice()) {
  if (W.yr < pt.back) continue;
  W.parties.splice(W.parties.indexOf(pt), 1);
  const c = W.contracts.find(x => x.id === pt.c) || {title: 'an expedition', tier: 2, type: 'dungeon'};
  c.done = 1;
  const mem = pt.ids.map(P).filter(alive);
  if (!mem.length) continue;
  const pow = mem.reduce((s, m) => s + m.adv + 1 + tsum(m, 'adv'), 0) / Math.max(1, mem.length) * (1 + .25 * (mem.length - 1));
  const risk = c.tier * 1.4 * W.cfg.danger;
  const roll = pow - risk + (R() * 4 - 2);
  const names = mem.map(plainName).join(', ');
  for (const m of mem) m.away = null;
  if (roll > 0) {
   const gold = Math.round(30 * c.tier * (1 + R()));
   for (const m of mem) { m.xp += c.tier * 3; if (m.xp >= 10 + m.adv * 5) { m.xp = 0; m.adv++; } H(m.house).wealth += Math.round(gold / mem.length); relAdd(m, pick(mem), 10); remember(m, `${c.title}: we came home. All of us.`, 2, 'adventure'); }
   let txt = `${names} returned from "${esc(c.title)}" with ${gold} gold.`;
   if (c.type === 'missing' && c.target && P(c.target)) {
    const t = P(c.target);
    if (chance(.45)) { t.gone = 0; t.san = clamp(t.san - 30, 0, 100); if (!t.traits.includes('haunted')) t.traits[2] = 'haunted'; remember(t, 'Rescued from the dark by ' + names.replace(/<[^>]+>/g, '') + '. I do not talk about what I saw.', 6, 'rescue'); for (const m of mem) relAdd(t, m, 50);
      txt = `${names} found ${plainName(t)} alive in the dark and carried them home. They have not spoken of it since.`; }
    else txt = `${names} searched for ${plainName(t)} and came home with only a boot and a wet lantern.`;
   }
   if (c.type === 'relic' || chance(.18)) {
    const cursed = chance(.25), rel = {name: pick(['a black pearl the size of an eye','a bronze idol with too many arms','a drowned king\'s ring','a lantern that burns cold','a bell that rings under water','a coral crown']), cursed};
    const holder = pick(mem); holder.relics = (holder.relics || []).concat([rel]);
    txt += ` ${plainName(holder)} brought back ${rel.name}.`;
    if (cursed) { holder.san = clamp(holder.san - 25, 0, 100); remember(holder, `Since I touched ${rel.name}, I dream of a door under the sea.`, 5, 'curse'); chron('scandal', `${plainName(holder)} has not slept since the last expedition. Neighbors hear humming from the ${esc(H(holder.house).name)} house at night.`, [holder.id], {secret: 1, spread: 1}); }
    W.market.arms = clamp(W.market.arms + .05, .6, 1.8);
   }
   if (c.patron && H(c.patron)) { H(c.patron).wealth += gold; txt += ` The ${esc(H(c.patron).name)} family funded the trip and will sell what was found.`; }
   chron('adventure', txt, pt.ids);
  } else {
   const bad = roll < -3 ? 2 : 1;
   const out = [];
   for (const m of mem) {
    const r = R() * (bad + 1);
    if (r > 2.2 && W.cfg.permadeath) { die(m, `killed during "${c.title}"`, {text: `${plainName(m)} fell during "${esc(c.title)}". Their name is cut into the Guild\'s memorial stone.`}); W.fallen = (W.fallen || []).concat([{id: m.id, y: W.yr, c: c.title}]); out.push(m.first + ' fell'); }
    else if (r > 1.9 && W.cfg.permadeath) { vanish(m, c.title.replace(/^\w+ (the )?/, 'the ').toLowerCase()); out.push(m.first + ' is missing'); }
    else if (r > .9) { m.injured = W.yr + 1 / W.cfg.yearDays * 3; remember(m, `Came back from "${c.title}" on a stretcher.`, 3, 'adventure'); out.push(m.first + ' was hurt'); }
    else remember(m, `"${c.title}" went wrong. We ran.`, 2, 'adventure');
   }
   chron('adventure', `"${esc(c.title)}" went badly for ${names}. ${esc(out.join(', ') || 'Everyone ran')}.`, pt.ids);
   W.market.arms = clamp(W.market.arms + .1, .6, 1.8);
  }
 }
}

// ---------------- one island day ----------------
function simDay() {
 W.day++; W.yr += 1 / W.cfg.yearDays;
 const cfg = W.cfg, people = Object.values(W.people), live = people.filter(alive);
 const houses = Object.values(W.houses).filter(h => !h.empty);
 // market drifts back toward normal
 for (const k in W.market) W.market[k] += (1 - W.market[k]) * .1 + (R() - .5) * .04;

 for (const per of live) {
  const a = age(per), prevA = a - 1 / cfg.yearDays;
  // coming of age
  if (prevA < 3 && a >= 3) remember(per, 'Took my first steps out to the harbor wall.', 1, 'child');
  if (prevA < 6 && a >= 6) { per.school = 1; remember(per, 'Started at the dame school. The teacher keeps salt in her pocket.', 2, 'child'); }
  if (prevA < 13 && a >= 13 && !per.job) { const par = [per.mom, per.dad].map(x => x && P(x)).find(x => x && x.job && x.job !== 'adventurer'); if (par) { per.apprentice = par.job; remember(per, `Apprenticed to ${par.first} as a ${JOBS[par.job][0].toLowerCase()}.`, 2, 'family'); } }
  if (prevA < 18 && a >= 18) { if (!per.job) assignJob(per); per.school = 0; if (tsum(per, 'adv') > .4 && chance(.4)) { per.job = 'adventurer'; per.adv = 1; chron('guild', `${plainName(per)} turned eighteen and signed the Adventurers' Guild ledger the same morning. ${pick(['Their mother has not stopped crying.','Their father bought them a sword. It is too big.','Nobody was surprised.'])}`, [per.id]); } }
  // old age and illness (the town's named folk are spared random death)
  if (!per.protect) {
   const dRate = a > 62 ? .035 * Math.pow(1.11, a - 62) : a < 1 ? .01 : .0015;
   if (chance(dRate / cfg.yearDays * (cfg.permadeath ? 1 : .2))) { die(per, a > 62 ? pick(['old age, in their sleep','a long illness','a cold that settled in the chest','old age, by the window, watching the sea']) : pick(['the wasting fever','a fall on the wet cliff path','the sea, on a calm day','a winter cough'])); continue; }
  }
  if (per.injured && W.yr > per.injured) per.injured = 0;
  // careers: promotions and laziness
  if (per.job && per.job !== 'adventurer' && adult(per) && chance(.012 * (1 + tsum(per, 'work') * 2)) && per.rank < 3) { per.rank++; remember(per, `Made ${RANKS[per.rank]} ${JOBS[per.job][0]}.`, 2, 'work'); if (per.rank === 3) chron('business', `${plainName(per)} is now Guildmaster of the island\'s ${JOBS[per.job][0].toLowerCase()}s.`, [per.id]); }
  // sanity: the haunted and cursed slip; time heals the rest
  per.san = clamp(per.san + (per.cult ? -.6 : .4 + tsum(per, 'san') * 2) - (per.relics || []).filter(r => r.cursed).length * 1.5 * cfg.sanity, 0, 100);
  if (per.san < 15 && !per.protect && chance(.02 * cfg.sanity)) { vanish(per, 'the sea, walking in at low tide'); continue; }
  if (!per.cult && adult(per) && per.san < 50 && chance(.004 * (1 + tsum(per, 'cult') * 4) * cfg.drama)) joinCult(per);
 }

 // household money: wages in, upkeep out; businesses; debt and arguments
 for (const h of houses) {
  const ms = living(h); if (!ms.length || h.player) continue;
  let inc = 0;
  for (const m of ms) if (m.job && m.job !== 'adventurer' && adult(m) && !m.injured && !m.away) inc += JOBS[m.job][1] * (1 + m.rank * .25) * (1 + tsum(m, 'work')) * (m.job === 'fisher' || m.job === 'fishmonger' ? W.market.fish : m.job === 'smith' ? W.market.arms : 1);
  if (h.biz) inc += h.biz.income * (h.biz.job === 'fisher' ? W.market.fish : 1);
  const cost = ms.reduce((s, m) => s + (adult(m) ? 9 : 4), 0) * cfg.finance;
  h.wealth += inc - cost;
  if (h.wealth < 0) { h.debt += -h.wealth; h.wealth = 0; }
  if (h.debt > 0 && h.wealth > 0) { const pay = Math.min(h.debt, h.wealth * .5); h.debt -= pay; h.wealth -= pay; }
  // a business opens when an ambitious household has the savings
  if (!h.biz && h.wealth > 700) {
   const owner = ms.find(m => adult(m) && BUSINESS[m.job] && (has(m, 'ambitious') || has(m, 'hardworking') || m.rank >= 2));
   if (owner && chance(.05 * cfg.autonomy)) {
    const b = BUSINESS[owner.job]; h.biz = {job: owner.job, type: b[0], name: pick(b.slice(1)).replace('{n}', h.name), income: 18 + Math.floor(R() * 20), owner: owner.id, opened: W.yr};
    h.wealth -= 450; remember(owner, `Opened ${h.biz.name}.`, 4, 'work');
    chron('business', `${esc(h.biz.name)} (${h.biz.type.toLowerCase()}) opened its doors on the harbor road, run by ${plainName(owner)}.`, [owner.id], {loud: 0});
   }
  }
  if (h.biz && h.debt > 400 && chance(.08)) { chron('business', `${esc(h.biz.name)} has closed. The ${esc(h.name)} family could not pay its debts.`, ms.map(m => m.id)); h.biz = null; h.rep -= 5; }
  // money troubles become marriage troubles
  if (h.debt > 150 && chance(.08 * cfg.drama)) {
   const m = ms.find(x => x.spouse && P(x.spouse) && alive(P(x.spouse)));
   if (m) { const s = P(m.spouse); relAdd(m, s, -8); remember(m, `Argued with ${s.first} about money again.`, 2, 'quarrel'); remember(s, `Argued with ${m.first} about money again.`, 2, 'quarrel');
    if (chance(.3)) chron('gossip', `Shouting from the ${esc(h.name)} house again. Something about the rent, and "your mother\'s ring."`, [m.id, s.id], {secret: 1, spread: 2}); }
  }
  h.cls = h.wealth + (h.biz ? 600 : 0) - h.debt;
 }

 // romance, marriage, affairs, divorce
 const singles = live.filter(x => adult(x) && age(x) < 60 && !x.spouse && !x.away);
 for (const a of singles) {
  if (!chance(.14 * cfg.drama * (1 + tsum(a, 'love')))) continue;
  const cands = singles.filter(b => b !== a && !b.spouse && !kin(a, b) && Math.abs(age(a) - age(b)) < 14 && (a.sex !== b.sex || chance(.15)));
  if (!cands.length) continue;
  const b = cands.sort((x, y) => (compat(a, y) + relOf(a, y)) - (compat(a, x) + relOf(a, x)))[Math.floor(R() * Math.min(3, cands.length))];
  const c = compat(a, b);
  relAdd(a, b, 6 + c * .5 + tsum(a, 'love') * 10);
  if (relOf(a, b) > 25 && !a.court) { a.court = b.id; b.court = a.id; remember(a, `Walked ${b.first} home along the harbor wall.`, 2, 'love'); remember(b, `${a.first} walked me home.`, 2, 'love');
   if (chance(.4)) chron('gossip', `${plainName(a)} and ${plainName(b)} have been seen walking the harbor wall together. Twice.`, [a.id, b.id], {secret: 1, spread: 3}); }
  if (relOf(a, b) > 55 && a.court === b.id && chance(.35)) { a.court = b.court = null; marry(a, b); }
 }
 for (const a of live.filter(x => x.spouse && P(x.spouse) && alive(P(x.spouse)) && adult(x))) {
  const s = P(a.spouse);
  relAdd(a, s, compat(a, s) > 0 ? .5 : -.5);
  if ((has(a, 'fickle') || has(a, 'romantic') && relOf(a, s) < 0) && chance(.006 * cfg.drama)) {
   const lover = pick(live.filter(x => adult(x) && x !== a && x !== s && !kin(a, x) && Math.abs(age(a) - age(x)) < 15));
   if (lover) { relAdd(a, lover, 30); a.affair = lover.id; remember(a, `Met ${lover.first} in the net-loft. Nobody can know.`, 4, 'secret');
    chron('scandal', `${plainName(a)} has been meeting ${plainName(lover)} in the net-loft after dark. ${esc(s.first)} does not know.`, [a.id, lover.id, s.id], {secret: 1, spread: 1, affair: [a.id, s.id]}); }
  }
  if (relOf(a, s) < -60 && chance(.02 * cfg.drama)) {
   a.spouse = s.spouse = null; a.ex.push(s.id); s.ex.push(a.id);
   const leaver = a.protect ? s : a; if (!leaver.protect) { const nh = newHouse(leaver.last); moveIn(leaver, nh); for (const k of leaver.kids.map(P).filter(k => alive(k) && !adult(k) && chance(.4))) moveIn(k, nh); }
   for (const k of a.kids.map(P).filter(alive)) remember(k, `${a.first} and ${s.first} separated. I heard everything through the wall.`, 5, 'family');
   chron('family', `${plainName(a)} and ${plainName(s)} have separated. ${esc(leaver.first)} has taken rooms elsewhere.`, [a.id, s.id]);
  }
  // children: pregnancy for couples who can, adoption for couples who can't
  const mom = a.sex === 'f' ? a : s.sex === 'f' ? s : null, dad = mom === a ? s : a;
  if (a.id < s.id) {
   const h = H(a.house), want = 1 + tsum(a, 'kids') + tsum(s, 'kids');
   const room = h && living(h).length < cfg.houseMax && Object.values(W.people).filter(alive).length < cfg.popCap;
   if (room && mom && dad.sex === 'm' && !mom.preg && age(mom) < 44 && mom.kids.filter(k => P(k) && alive(P(k))).length < 5 && chance(.06 * cfg.births * want)) {
    mom.preg = {due: W.yr + 4 / cfg.yearDays, dad: dad.id}; remember(mom, 'I\'m expecting.', 3, 'family'); remember(dad, `${mom.first} is expecting.`, 3, 'family');
   } else if (room && (!mom || dad.sex !== 'm') && chance(.004 * cfg.births * want)) {
    const orphan = live.find(x => !adult(x) && ![x.mom, x.dad].some(y => y && alive(P(y))) && x.house !== a.house);
    const c = orphan || newPerson({last: a.last, born: W.yr - Math.floor(R() * 6), traits: rollTraits(3)});
    c.last = a.last; moveIn(c, h); a.kids.push(c.id); s.kids.push(c.id); c.adoptedBy = [a.id, s.id];
    remember(c, `${a.first} and ${s.first} took me home.`, 6, 'family'); remember(a, `We adopted ${c.first}.`, 5, 'family'); remember(s, `We adopted ${c.first}.`, 5, 'family');
    chron('birth', `${plainName(a)} and ${plainName(s)} have adopted ${esc(c.first)}${orphan ? ', orphaned last year' : ''}.`, [c.id, a.id, s.id]);
   }
  }
 }
 for (const m of live.filter(x => x.preg && W.yr >= x.preg.due)) { const d = P(m.preg.dad); m.preg = null; birth(m, d); }

 // friendships and rivalries ripple outward; children befriend across feuds
 for (let i = 0; i < 40 * cfg.autonomy; i++) {
  const a = pick(live), b = pick(live); if (!a || !b || a === b) continue;
  const c = compat(a, b) + (tsum(a, 'fight') + tsum(b, 'fight')) * -20;
  relAdd(a, b, c > 0 ? 2 : -2);
  if (relOf(a, b) < -50 && !a.rival && chance(.2 * cfg.drama)) { a.rival = b.id; b.rival = a.id; remember(a, `${fullName(b)} and I will never be friends.`, 3, 'quarrel'); chron('gossip', `${plainName(a)} and ${plainName(b)} came to blows outside the Drowned Rat. ${pick(['Over a dog.','Over a woman.','Over a net.','Over nothing at all, witnesses say.','Over the price of herring.'])}`, [a.id, b.id], {secret: 0}); }
  if (!adult(a) && !adult(b) && age(a) > 5 && age(b) > 5 && H(a.house) && H(b.house) && living(H(a.house)).some(x => living(H(b.house)).some(y => relOf(x, y) < -40)) && chance(.15)) {
   relAdd(a, b, 30); remember(a, `${b.first} is my best friend. We are not supposed to talk.`, 4, 'friend'); remember(b, `${a.first} is my best friend. We are not supposed to talk.`, 4, 'friend');
   chron('gossip', `The ${esc(H(a.house).name)} and ${esc(H(b.house).name)} children have been seen fishing off the same rock. Their parents have not spoken in years.`, [a.id, b.id], {secret: 1, spread: 2});
  }
 }

 // emergent island stories drawn from what people actually are and do
 for (const per of live) {
  if (per.job === 'fisher' && chance(.003)) {
   const rel = {name: pick(['a green-bronze statuette','a skull with a pearl for an eye','a stone tablet covered in wet writing','a fish with a human hand']), cursed: chance(.4)};
   per.relics = (per.relics || []).concat([rel]); remember(per, `Pulled ${rel.name} up in my nets.`, 4, 'find');
   chron('disaster', `${plainName(per)} pulled ${rel.name} up in the nets off Gull Point. ${rel.cursed ? 'Their catches have been strange ever since.' : 'Collectors are already knocking.'}`, [per.id]);
  }
  if (per.cult && H(per.house) && H(per.house).wealth > 600 && has(per, 'greedy') && chance(.01)) {
   H(per.house).wealth -= 200;
   chron('scandal', `The ${esc(H(per.house).name)} family has been quietly paying for the Choir\'s new meeting hall in the old salt store.`, [per.id], {secret: 1, spread: 1});
  }
 }
 if (chance(.02 * cfg.drama)) {
  const h = pick(houses.filter(h => living(h).length)), m = h && pick(living(h).filter(adult));
  if (m) { h.wealth += 300; chron('family', `A solicitor from the mainland arrived for ${plainName(m)}: a great-aunt nobody remembers has left them Wrackwood House on the north cliff. Nobody has lived there for forty years. The lamps are lit at night anyway.`, [m.id]); remember(m, 'Inherited Wrackwood House from a great-aunt I never met.', 4, 'family'); }
 }
 // cosmic trouble at sea: the deep stirs (more often as the Tide nears)
 const tide = G().S.tideEnd ? (G().S.tideEnd - G().S.time) / 1440 : 30;
 if (chance((.02 + (tide < 7 ? .05 : 0)) * cfg.cosmic)) {
  const kind = pick(['A black swell rose in the bay without wind','Something large passed under the fishing fleet','The tide went out a mile and came back singing','Every lantern on the north shore went out at once']);
  W.market.fish = clamp(W.market.fish + .3, .6, 2);
  const fishers = live.filter(x => x.job === 'fisher' && !x.protect);
  let lost = null; if (fishers.length && chance(.35)) { lost = pick(fishers); vanish(lost, 'the bay, with their boat'); }
  chron('disaster', `${kind}. ${lost ? plainName(lost) + '\'s boat did not come back.' : 'No boats were lost, this time.'} Fish prices have risen.`, lost ? [lost.id] : [], {loud: 1});
  for (const per of live) per.san = clamp(per.san - (5 + (has(per, 'superstitious') ? 5 : 0)) * cfg.sanity, 0, 100);
 }
 // newcomers by boat keep the island alive
 if (live.length < cfg.popCap * .55 && chance(.25)) { const h = genFamily(pick(SURN) + (chance(.5) ? '' : '-' + pick(SURN)), new Set()); for (const m of living(h)) if (!m.job && age(m) >= 16) assignJob(m); chron('family', `A family off the mainland boat has taken a house on the harbor road: the ${esc(h.name)}s, ${living(h).length} of them.`, h.members); }

 // guild
 postContracts(); formParties(); resolveParties(); choirRite();
 gossipSpread(); syncPlayer();
 W.lastSim = W.day;
}

// Secrets travel person to person. Gossips speed it up, the secretive slow it. Once enough people
// know, the player's household hears it too, and reputations change.
function gossipSpread() {
 const live = Object.values(W.people).filter(alive), gos = live.filter(x => has(x, 'gossip')).length;
 for (const e of W.chron) {
  if (!e.secret || e.known) continue;
  e.spread = (e.spread || 1) + R() * (1 + gos * .15) * W.cfg.drama;
  if (e.spread > 9 && chance(.2)) {
   e.known = 1; e.knownY = W.yr;
   if (G().chat) G().chat('🗣️ <b>Gossip:</b> ' + e.t, 'sys');
   for (const id of e.ids) { const per = P(id); if (per && per.house && H(per.house)) H(per.house).rep = clamp(H(per.house).rep - (e.k === 'scandal' ? 12 : 3), 0, 100); }
   if (e.affair) { const [a, s] = e.affair.map(P); if (a && s) { relAdd(a, s, -60); remember(s, `Found out about ${a.first} and the net-loft. Everyone knew before I did.`, 6, 'betrayal'); } }
   if (e.sacrificer) sacrificeKnown(e);
   for (const id of e.ids) { const per = P(id); if (per && per.cult) for (const n of living(H(per.house))) if (n !== per) remember(n, `Everyone knows ${per.first} sings with the Choir now.`, 4, 'secret'); }
  }
 }
 // and sometimes the harbor simply makes things up
 if (chance(.1 * W.cfg.drama)) {
  const a = pick(live.filter(adult));
  if (a) chron('gossip', pick([`Word on the docks is that ${plainName(a)} has a second family on the mainland.`,`They say ${plainName(a)} was seen talking to a gillkin. In its language.`,`Rumor has it ${plainName(a)} buried something in the churchyard at midnight.`,`Folk swear ${plainName(a)}'s reflection doesn't match.`]) + ' (Unconfirmed.)', [a.id], {secret: 1, spread: 4, rumor: 1});
 }
}

// The player's own household lives in the ledger too
function syncPlayer() {
 const p = G().p; if (!p) return;
 let me = W.me && P(W.me);
 if (!me) {
  me = newPerson({first: p.name, last: '', born: W.yr - 24, traits: rollTraits(3), race: p.race || 'human', player: 1, protect: 1, job: 'adventurer', adv: p.level || 1});
  const h = newHouse(p.name + "'s", {wealth: 0, rep: 50, color: '#2e5a4a', player: 1}); moveIn(me, h); W.me = me.id; W.playerHouse = h.id;
  chron('family', `${esc(p.name)} has taken a rented room in Old Town. The landlady says they "look like trouble, or a sailor."`, [me.id]);
 }
 me.first = p.name; me.adv = p.level || me.adv; H(me.house).wealth = p.gold || 0;
 const sp = p.spouse && Object.values(W.people).find(x => x.npc === p.spouse);
 if (sp && me.spouse !== sp.id) { marry(me, sp, true); moveIn(sp, H(me.house)); chron('marriage', `${esc(p.name)} and ${plainName(sp)} were married. The whole harbor turned out.`, [me.id, sp.id], {loud: 0}); }
 for (const c of (p.children || [])) {
  if (Object.values(W.people).some(x => x.pkid === c.name)) continue;
  const k = newPerson({first: c.name, last: '', born: W.yr - 2, pkid: c.name, dad: me.id, mom: sp ? sp.id : null, race: c.race || me.race, protect: 1});
  me.kids.push(k.id); if (sp) sp.kids.push(k.id); moveIn(k, H(me.house));
  chron('birth', `${esc(c.name)} was born to ${esc(p.name)}${sp ? ' and ' + plainName(sp) : ''}.`, [k.id, me.id]);
 }
}

// ---------------- residents out on the streets ----------------
// By day a rotating handful of ledger residents walk Saltmere as real NPCs; they go home at dusk.
// What they say comes from who they are and what has happened to them.
function linesFor(per) {
 const out = [], h = H(per.house), A = archetype(per);
 const m = per.mem.slice(-4);
 for (const x of m) out.push(x.k === 'grief' || x.k === 'loss' ? x.t + ' ...Sorry. I don\'t know why I told you that.' : x.t);
 if (has(per, 'gossip')) { const e = W.chron.filter(e => e.secret && e.spread > 3).slice(-3); for (const x of e) out.push('Between us? ' + x.t.replace(/<[^>]+>/g, '')); }
 if (has(per, 'superstitious')) out.push('Salt your doorstep tonight. I\'m serious.');
 if (has(per, 'greedy')) out.push(`Fish is ${W.market.fish > 1.15 ? 'dear' : 'cheap'} this week. I know who\'s hoarding it.`);
 if (has(per, 'brave')) out.push('If the Guild posts anything worth doing, I\'m going.');
 if (has(per, 'cowardly')) out.push('I don\'t go past the lamp posts after dark. Nobody sensible does.');
 if (has(per, 'familyminded') && per.kids.length) out.push(`My ${P(per.kids[0]) ? P(per.kids[0]).first : 'little one'} is the only reason I get up in the morning.`);
 if (has(per, 'pious')) out.push('The chapel bell keeps the deep things down. That\'s why it never stops.');
 if (has(per, 'drunkard')) out.push('First round\'s on you, right? The Drowned Rat. Say yes.');
 if (per.cult && per.san < 50) out.push('Can you hear it? Under the harbor. It sings the same song every night. ...Never mind.');
 if (per.job) out.push(`${RANKS[per.rank]} ${JOBS[per.job][0].toLowerCase()}, me. ${pick(['Honest work.','It pays the rent. Mostly.','Been at it since I was small.','Wouldn\'t do anything else.'])}`);
 if (h && h.biz) out.push(`Come by ${h.biz.name} sometime.`);
 if (per.job === 'adventurer') out.push(`Guild rank ${per.adv}. ${per.adv > 6 ? 'You\'ve heard of me.' : 'Getting there.'}`);
 out.push(`(${A}.)`);
 return out;
}
function streetsTick() {
 const h = G().hour(), cfg = W.cfg;
 const out = (h >= 7 && h < 21);
 // send everyone home at dusk
 if (!out) { for (const id of W.walking) { const per = P(id); if (per) G().removeCitizen(fullName(per)); } W.walking = []; return; }
 W.walking = W.walking.filter(id => { const per = P(id); if (!alive(per) || per.away) { if (per) G().removeCitizen(fullName(per)); return false; } return true; });
 // shift change: a few go home, a few come out
 if (W.walking.length && chance(.35)) { const i = W.walking.findIndex(id => !P(id).favor); if (i >= 0) { const id = W.walking.splice(i, 1)[0]; G().removeCitizen(fullName(P(id))); } }
 const pool = Object.values(W.people).filter(per => alive(per) && !per.npc && !per.player && !per.pkid && !per.away && !per.injured && age(per) >= 7 && !W.walking.includes(per.id));
 pool.sort((a, b) => (b.favor ? 1 : 0) - (a.favor ? 1 : 0) || R() - .5);
 while ((W.walking.length < cfg.walkers || (pool[0] && pool[0].favor)) && pool.length) {
  const per = pool.shift(), house = H(per.house);
  const job = per.job && JOBS[per.job];
  const n = G().addCitizen(Object.assign({}, per.prl || {}, {name: fullName(per), race: per.race, model: job ? job[2] : 'Rogue', gear: per.job === 'adventurer' ? ['1H_Sword'] : [], armor: house ? house.color : '#555', kid: age(per) < 13, lines: linesFor(per), ledger: per.id,
   kind: `${stage(per)} · ${job ? job[0] : stage(per) === 'Child' ? 'Schoolchild' : 'Islander'} · ${archetype(per)}`, san: per.san}));
  if (n) W.walking.push(per.id);
 }
}


// ---------------- the Harbor Idol: villager sacrifice ----------------
// Only adults outside the player's own household, and never the town's named folk. The Tide sleeps
// longer, but the family grieves, the player's mind frays, and if the truth gets out, the island remembers.
const sacrificeable = per => alive(per) && adult(per) && !per.protect && !per.player && !per.pkid && per.house !== W.playerHouse && !per.away;
function tideValue(per) { const loved = Object.values(per.rel).filter(v => v > 40).length; return 2880 + Math.min(3, loved) * 480 + (per.kids.some(k => P(k) && alive(P(k)) && !adult(P(k))) ? 480 : 0); }
function altar() {
 const list = Object.values(W.people).filter(sacrificeable).sort((a, b) => (G().npcs.some(n => n.ledger === b.id) - G().npcs.some(n => n.ledger === a.id)) || a.last.localeCompare(b.last)).slice(0, 60);
 const days = x => (x / 1440).toFixed(1);
 G().openPanel('🗿 The Idol of the Tide Below', CSS + `<p class="lw-red"><i>The stone is warm. It wants one of the island's own. Whoever you bring will not come back, and their family will never stop looking.</i></p>
  <p class="lw-dim">Walking the streets now are marked 🚶. More loved souls, and parents of young children, buy more time.</p>
  ${list.map(per => `<div class="lw-p"><b>${esc(fullName(per))}</b> · ${Math.floor(age(per))} · ${per.job ? JOBS[per.job][0] : 'Islander'} · <i>${archetype(per)}</i>${G().npcs.some(n => n.ledger === per.id) ? ' 🚶' : ''}${per.kids.some(k => P(k) && alive(P(k)) && !adult(P(k))) ? ' · <span class="lw-red">has young children</span>' : ''}
   <button style="float:right" onclick="LW.sacrifice('${per.id}')">Give to the Tide (+${days(tideValue(per))} days)</button></div>`).join('') || '<p>No one you could bring here.</p>'}`);
}
function sacrifice(id) {
 const per = P(id); if (!per || !sacrificeable(per)) return;
 const me = W.me && P(W.me), pl = G().p, mins = tideValue(per);
 G().closePanel && G().closePanel();
 die(per, 'given to the Tide Below at the Harbor Idol', {text: `${plainName(per)} walked down to the harbor at dusk and did not come home. A shawl was found folded on the idol\'s step, dry.`});
 per.sacrificed = 1;
 for (const k of per.kids.map(P).filter(alive)) remember(k, `Someone took ${per.first} to the idol. I will find out who.`, 6, 'grief');
 if (me) {
  remember(me, `I gave ${fullName(per)} to the Tide Below.`, 6, 'secret');
  chron('scandal', `${esc(pl.name)} led ${plainName(per)} down to the Harbor Idol and came back alone.`, [per.id, me.id], {secret: 1, spread: 1 + R() * 3, sacrificer: me.id, victim: per.id});
  for (const c of Object.values(W.people).filter(x => alive(x) && x.cult)) relAdd(c, me, 20);
 }
 pl.needs.sanity = clamp(pl.needs.sanity - 25 * W.cfg.sanity, 0, 100); if (G().feel) G().feel('grieving', 1440, 'You can still feel the stone, warm under your hands.'); pl.flags.sacrifices = (pl.flags.sacrifices || 0) + 1;
 W.sacrifices = (W.sacrifices || 0) + 1;
 G().pushTide(mins, `You bring ${esc(fullName(per))} to the idol. You do not look at what happens. When you open your eyes the tide has pulled far, far out.`);
 save();
}
// when the truth about a sacrifice reaches the player's household, the island turns on them
function sacrificeKnown(e) {
 const me = P(e.sacrificer), v = P(e.victim); if (!me || !v) return;
 for (const x of [v.spouse && P(v.spouse)].concat(v.kids.map(P), [v.mom, v.dad].map(y => y && P(y))).filter(alive)) { relAdd(x, me, -100); x.rival = me.id; remember(x, `${me.first} killed ${v.first}. Everyone knows it now.`, 6, 'betrayal'); }
 if (H(me.house)) H(me.house).rep = clamp(H(me.house).rep - 35, 0, 100);
 for (const x of Object.values(W.people).filter(y => alive(y) && has(y, 'pious'))) relAdd(x, me, -30);
 G().chat(`⚠️ <b>The island knows what you did to ${esc(fullName(v))}.</b> Doors close as you pass.`, 'err');
}
// the Choir does its own work when the Tide draws near
function choirRite() {
 const cult = Object.values(W.people).filter(x => alive(x) && x.cult), tide = G().S.tideEnd ? (G().S.tideEnd - G().S.time) / 1440 : 30;
 if (cult.length < 2 || tide > 12 || !chance(.05 * W.cfg.cosmic * (1 + cult.length * .2))) return;
 const v = pick(Object.values(W.people).filter(x => sacrificeable(x) && !x.cult)); if (!v) return;
 die(v, 'taken by the Choir of the Tide Below', {text: `${plainName(v)} is missing. Their door was found open and the floor wet to the knee.`});
 chron('scandal', `The Choir of the Tide Below gave ${plainName(v)} to the idol on the dark of the moon. ${plainName(pick(cult))} held the lantern.`, [v.id].concat(cult.map(c => c.id)), {secret: 1, spread: 2});
 G().pushTide(1440, 'The sea pulls back in the night, further than it should. Somewhere on the island, someone was given to the Tide.');
}


// ---------------- the player's relationships with residents (used by the social system) ----------------
function personFor(n) { if (!W || !n) return null; if (n.ledger) return P(n.ledger) || null; for (const id in W.people) { const x = W.people[id]; if (x.npc === n.name) return x; } return null; }
const causeLine = x => x.gone ? `${x.first} went into ${x.cause} and never came home.` : x.cause ? `${x.cause[0].toUpperCase() + x.cause.slice(1)}.` : '';
function familyLine(per) {
 const h = H(per.house), sp = per.spouse && P(per.spouse), kids = per.kids.map(P).filter(Boolean), lost = kids.concat([sp].filter(Boolean)).filter(x => !alive(x));
 const bits = [];
 if (sp && alive(sp)) bits.push(`I'm married to ${sp.first}${has(per, 'jealous') ? ', and I\'d thank you to remember it' : ''}.`); else if (per.widowed) bits.push('I was married once. The sea keeps what it takes.'); else bits.push(has(per, 'romantic') ? 'No one waiting at home. Not yet.' : 'Just me, mostly.');
 const lk = kids.filter(alive); if (lk.length) bits.push(`${lk.length === 1 ? 'One child' : lk.length + ' children'}: ${lk.map(k => k.first + ' (' + Math.floor(age(k)) + ')').join(', ')}.`);
 if (lost.length) bits.push(`We lost ${lost.map(x => x.first).join(' and ')}. ${causeLine(lost[0])}`);
 if (h && h.biz) bits.push(`The family runs ${h.biz.name}.`);
 if (h && h.debt > 150) bits.push('Money\'s tight. Don\'t tell anyone.');
 return bits.join(' ');
}
// A deep conversation: they share a memory; close friends share a secret, which the player now knows.
function confide(per, close) {
 if (close) {
  const e = W.chron.find(e => e.secret && !e.known && e.ids[0] === per.id && !e.rumor);
  if (e) { e.known = 1; e.knownY = W.yr; return {secret: 1, t: 'They lower their voice. "' + e.t.replace(/<[^>]+>/g, '') + '" They hold your eyes. "You won\'t tell."'}; }
 }
 const m = per.mem.filter(m => m.k !== 'secret' && m.k !== 'cult').sort((a, b) => b.w - a.w)[0];
 return {t: m ? `"${m.t}"` : '"Nothing much ever happens to me. That\'s how I like it."'};
}
function knownGossip(exceptId) { return W.chron.filter(e => e.secret && e.known && !e.ids.includes(exceptId)).slice(-12); }
function tellGossip(per) { const all = knownGossip(per.id); if (!all.length) return null; const g = pick(all); g.spread = (g.spread || 1) + 3; remember(per, 'Heard it from the newcomer: ' + g.t.replace(/<[^>]+>/g, ''), 1, 'gossip'); return g; }
function rumor(per, byName) {
 const t = pick([`They say ${plainName(per)} has been stealing from the collection plate.`, `Word is ${plainName(per)} talks to the idol at night.`, `Folk whisper that ${plainName(per)}'s last sweetheart didn't drown by accident.`, `Somebody saw ${plainName(per)} buying salt by the barrel. What do they know?`]);
 chron('gossip', t + ' (Unconfirmed.)', [per.id], {secret: 1, spread: 6, rumor: 1, by: byName});
 const h = H(per.house); if (h) h.rep = clamp(h.rep - 6, 0, 100);
 remember(per, 'Someone is spreading lies about me. I will find out who.', 4, 'quarrel');
}
function noteRel(per, n, event) {
 if (!per) return; per.prl = {rel: n.rel || 0, love: n.love || 0, grudge: n.grudge || 0, met: n.met ? 1 : 0};
 const me = W.me && P(W.me); if (me) { per.rel[me.id] = clamp((n.rel || 0) - (n.grudge || 0), -100, 100); me.rel[per.id] = per.rel[me.id]; }
 if (event) remember(per, event, 2, 'player');
}
// What a resident might ask of the player, drawn from their actual life
function favorFor(per, n) {
 const g = per.mem.slice().reverse().find(m => (m.k === 'grief' || m.k === 'loss') && W.yr - m.y < 3);
 const missing = per.kids.concat([per.spouse, per.mom, per.dad]).map(x => x && P(x)).find(x => x && x.gone);
 const single = !per.spouse && adult(per) && age(per) < 50;
 const opts = [];
 if (missing) opts.push({type: 'chat', need: 3, title: `Ask After ${missing.first}`, text: `${fullName(per)} begs you to ask around town about ${fullName(missing)}, missing since ${yearOf(missing.goneY || W.yr)}. Chat with 3 different people.`, gold: 30});
 if (g) opts.push({type: 'deliver', item: 'flowers', target: n.name, title: 'Flowers for the Grave', text: `${fullName(per)} can't bear to go to the cemetery alone. Bring them a Gravebloom bouquet.`, gold: 25});
 if (per.job === 'fisher' || per.job === 'fishmonger') opts.push({type: 'deliver', item: 'fish', target: n.name, title: 'A Short Catch', text: `${fullName(per)}'s nets came up empty again. Bring them a fish so the family eats tonight.`, gold: 20});
 if (has(per, 'drunkard')) opts.push({type: 'deliver', item: 'ale', target: n.name, title: 'One for the Road', text: `${fullName(per)} would very much like an ale. Just one. For their nerves.`, gold: 12});
 if (H(per.house) && H(per.house).debt > 100) opts.push({type: 'deliver', item: 'bread', target: n.name, title: 'Bread on the Table', text: `The ${H(per.house).name} household is in debt. ${per.first} quietly asks if you could spare some bread.`, gold: 15});
 if (single) {
  const crush = G().npcs.find(x => x !== n && !x.child && !x.beast && x.race !== 'gillkin' && x.ledger !== per.id && (() => { const c = personFor(x); return c && c !== per && !c.spouse && adult(c) && Math.abs(age(c) - age(per)) < 15; })());
  if (crush) opts.push({type: 'social', match: crush.name, need: 1, title: 'A Good Word', text: `${fullName(per)} has noticed ${crush.name}. Find ${crush.name} and put in a good word (any friendly interaction).`, gold: 25});
 }
 if (has(per, 'curious') || has(per, 'scholarly')) opts.push({type: 'chat', need: 2, title: 'Collecting Stories', text: `${fullName(per)} is writing down the island's stories. Chat with two people and report back.`, gold: 20});
 if (!opts.length) opts.push({type: 'deliver', item: 'bread', target: n.name, title: 'A Neighborly Loaf', text: `${fullName(per)} hasn't eaten properly in days. Bring them bread.`, gold: 12});
 const q = Object.assign({}, pick(opts), {giver: n.name, favorOf: n.name, xp: ['charisma', 10]});
 per.favor = 1; per.favorT = W.yr; return q;
}
function favorDone(name) { const per = Object.values(W.people).find(x => fullName(x) === name || x.npc === name); if (per) { per.favor = 0; remember(per, 'The newcomer helped me when no one else would.', 4, 'player'); } }
function overhear(per) { const e = pick(W.chron.filter(e => e.secret && !e.known && e.spread > 2 && !(per && e.ids.includes(per.id)) && !(W.me && e.ids.includes(W.me))).slice(-20)); if (!e) return null; e.known = 1; e.knownY = W.yr; return e; }
function joinChoir() { const me = W.me && P(W.me); if (me && !me.cult) joinCult(me, true); }
// ---------------- the player's own children ----------------
const pk = name => Object.values(W.people).find(x => x.pkid === name);
function kidAge(name) { const x = pk(name); return x && alive(x) ? age(x) : null; }
function growUp(name, traits, job, bond) {
 const x = pk(name); if (!x) return; x.traits = traits; x.job = job; x.rank = 1; if (job === 'adventurer') x.adv = Math.max(1, x.adv || 0);
 const me = W.me && P(W.me);
 remember(x, bond >= 70 ? `My ${me ? me.first : 'parent'} was always there for me.` : bond < 40 ? 'I raised myself, mostly.' : 'I had a good enough childhood.', 5, 'family');
 chron('family', `${plainName(x)} came of age${me ? `, child of ${plainName(me)}` : ''}. They mean to be a ${JOBS[job] ? JOBS[job][0].toLowerCase() : job}.`, [x.id], {loud: 1});
}
function myAge() { const me = W.me && P(W.me); return me ? age(me) : 0; }
function sendExpedition(name) {
 const x = pk(name); if (!x || !alive(x) || x.away) return null; postContracts();
 const c = W.contracts.find(c => !c.taken && !c.done && c.type !== 'missing'); if (!c) return null; c.taken = 1;
 x.adv = Math.max(1, x.adv || 0);
 const mates = Object.values(W.people).filter(m => alive(m) && m.job === 'adventurer' && !m.away && !m.player && !m.pkid && adult(m)).sort(() => R() - .5).slice(0, 2);
 const ids = [x.id].concat(mates.map(m => m.id)); for (const id of ids) P(id).away = c.id;
 W.parties.push({c: c.id, ids, back: W.yr + 2 / W.cfg.yearDays});
 remember(x, `Left on "${c.title}". Promised to come home.`, 3, 'adventure');
 return c.title;
}
function expeditionState(name) { const x = pk(name); if (!x) return null; return x.dead ? 'dead' : x.gone ? 'gone' : x.away ? 'away' : null; }
function succeed(oldName, heirName, died) {
 const me = W.me && P(W.me), h = pk(heirName); if (!h) return {sex: 'm'};
 if (me) { me.player = 0; if (died) die(me, 'old age, with family close'); else { me.retired = 1; remember(me, `Handed the family to ${h.first}.`, 5, 'family'); chron('family', `${plainName(me)} has retired. ${plainName(h)} now heads the household.`, [me.id, h.id], {loud: 1}); } }
 h.player = 1; h.protect = 1; h.pkid = null; W.me = h.id; return {sex: h.sex};
}
function coworkers(job, k) { return Object.values(W.people).filter(x => alive(x) && x.job === job && !x.player).sort(() => R() - .5).slice(0, k); }

// ---------------- persistence ----------------
function save() { if (!W) return; try { localStorage.setItem(KEY, JSON.stringify(W)); } catch (e) {} }
function load() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }

// ---------------- UI: the Neighborhood panel ----------------
const CSS = `<style>
.lw-tabs{display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px}.lw-tabs button{flex:1;min-width:84px;padding:6px 4px;font-size:12px}
.lw-tabs button.on{outline:2px solid #6fd3b8}
.lw-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:6px}
.lw-card{border:1px solid #3c4a48;border-left:5px solid var(--hc);background:rgba(10,18,18,.6);padding:6px 8px;border-radius:4px;cursor:pointer;font-size:12px;line-height:1.35}
.lw-card:hover{background:rgba(40,70,64,.5)}.lw-card b{font-size:13px}.lw-dim{opacity:.55}.lw-red{color:#e07a6a}.lw-grn{color:#7fd3a6}.lw-gold{color:#e8c48a}
.lw-p{border-top:1px solid #2b3836;padding:6px 0;font-size:12px;line-height:1.4}.lw-p:first-child{border-top:0}
.lw-chip{display:inline-block;padding:0 5px;margin:1px 2px 1px 0;border-radius:8px;background:#22302e;font-size:11px}
.lw-mem{margin:2px 0 0 10px;opacity:.85;font-style:italic}
.lw-tree ul{list-style:none;margin:0;padding-left:18px;border-left:1px dashed #4a5a58}.lw-tree>ul{border-left:0;padding-left:0}
.lw-tree li{margin:4px 0;font-size:12px}.lw-node{display:inline-block;padding:2px 6px;border:1px solid #3c4a48;border-radius:4px;background:rgba(10,18,18,.6)}
.lw-news{font-family:Georgia,serif;font-size:13px;line-height:1.45}.lw-news h3{margin:10px 0 4px;border-bottom:1px solid #4a5a58;font-size:14px;letter-spacing:1px}
.lw-news .e{margin:3px 0}.lw-set label{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:5px 0;font-size:12px}
.lw-set select{max-width:50%}
</style>`;
function wealthWord(h) { const v = h.cls != null ? h.cls : h.wealth; return v < 40 ? 'Destitute' : v < 150 ? 'Poor' : v < 450 ? 'Common' : v < 1000 ? 'Comfortable' : v < 2200 ? 'Wealthy' : 'Gentry'; }
function personRow(per, mine) {
 const h = H(per.house), a = Math.floor(age(per)), job = per.job && JOBS[per.job];
 const st = per.dead ? `<span class="lw-red">✝ died ${yearOf(per.died)} (${esc(per.cause)})</span>` : per.gone ? `<span class="lw-red">❓ missing since ${yearOf(per.goneY)}: ${esc(per.cause)}</span>` : per.away ? '<span class="lw-gold">⚔️ away on an expedition</span>' : per.injured ? '<span class="lw-red">🩹 recovering</span>' : per.preg ? '🤰 expecting' : '';
 const tr = per.traits.map(t => `<span class="lw-chip">${TRAITS[t][0]} ${TRAITS[t][1]}</span>`).join('');
 const sp = per.spouse && P(per.spouse), best = Object.entries(per.rel).filter(([id, v]) => v > 35 && P(id) && P(id).id !== per.spouse).sort((x, y) => y[1] - x[1])[0];
 const riv = Object.entries(per.rel).filter(([id, v]) => v < -35 && P(id)).sort((x, y) => x[1] - y[1])[0];
 const lover = per.affair && W.chron.some(e => e.affair && e.affair[0] === per.id && e.known) ? P(per.affair) : null;
 const cult = per.cult && (mine || W.chron.some(e => e.secret && e.known && e.ids.includes(per.id) && /Choir/.test(e.t)));
 const rels = [sp ? `💍 ${esc(fullName(sp))}` : '', best ? `🤝 ${esc(fullName(P(best[0])))}` : '', riv ? `⚡ ${esc(fullName(P(riv[0])))}` : '', lover ? `<span class="lw-red">💋 ${esc(fullName(lover))}</span>` : ''].filter(Boolean).join(' · ');
 const mem = per.mem.slice(-3).filter(m => mine || m.k !== 'secret' && m.k !== 'cult').map(m => `<div class="lw-mem">“${esc(m.t)}”</div>`).join('');
 return `<div class="lw-p ${alive(per) ? '' : 'lw-dim'}"><b>${esc(fullName(per))}</b> · ${a} · ${stage(per)}${per.marked ? ' · <span class="lw-red">born with the caul</span>' : ''}
  ${job ? ` · ${job[3]} ${per.job === 'adventurer' ? 'Adventurer, Guild rank ' + per.adv : RANKS[per.rank] + ' ' + job[0]}` : per.school ? ' · 🍎 at school' : per.apprentice ? ` · apprentice ${JOBS[per.apprentice][0].toLowerCase()}` : ''}
  ${cult ? ' · <span class="lw-red">🕯️ Choir of the Tide Below</span>' : ''} ${st}
  <div><i class="lw-gold">${archetype(per)}</i> ${tr}</div>${rels ? `<div>${rels}</div>` : ''}${(per.relics || []).length ? `<div>🏺 ${per.relics.map(r => esc(r.name) + (r.cursed && mine ? ' <span class="lw-red">(cursed)</span>' : '')).join(', ')}</div>` : ''}${mem}</div>`;
}
function houseCard(h) {
 const ms = living(h), lost = h.members.map(P).filter(x => x && !alive(x));
 const adv = ms.filter(m => m.job === 'adventurer').length, known = W.chron.filter(e => e.known && e.secret && e.ids.some(id => h.members.includes(id))).length;
 return `<div class="lw-card" style="--hc:${h.color}" onclick="LW.ui('house','${h.id}')"><b>${h.player ? '⭐ ' : ''}The ${esc(h.name)} House</b><br>
  👪 ${ms.length} living${lost.length ? ` · <span class="lw-dim">${lost.length} lost</span>` : ''} · ${h.player ? '🪙 ' + Math.round(h.wealth) + 'g' : wealthWord(h)}<br>
  ${h.biz ? '🏪 ' + esc(h.biz.name) + '<br>' : ''}⭐ Standing ${Math.round(h.rep)}${adv ? ' · ⚔️' + adv : ''}${known ? ` · <span class="lw-red">🗣️${known}</span>` : ''}${h.debt > 100 ? ' · <span class="lw-red">in debt</span>' : ''}</div>`;
}
function treeHTML(h) {
 const seen = new Set();
 const roots = new Set();
 for (const id of h.members) { let x = P(id), g = 0; while (x && g++ < 4) { const up = (x.dad && P(x.dad)) || (x.mom && P(x.mom)); if (!up) break; x = up; } if (x) roots.add(x.id); }
 const node = per => { if (!per || seen.has(per.id)) return ''; seen.add(per.id); const sp = per.spouse && P(per.spouse) || per.ex.map(P).find(Boolean) || (per.kids.length && P(per.kids[0]) && [P(per.kids[0]).mom, P(per.kids[0]).dad].map(x => x && P(x)).find(x => x && x !== per));
  if (sp) seen.add(sp.id);
  const lab = x => `<span class="lw-node ${alive(x) ? '' : 'lw-dim'}">${x.sex === 'f' ? '♀' : '♂'} ${esc(fullName(x))} <small>${alive(x) ? Math.floor(age(x)) : x.dead ? '✝' : '❓'}</small></span>`;
  const kids = Array.from(new Set(per.kids.concat(sp ? sp.kids : []))).map(P).filter(Boolean).sort((a, b) => a.born - b.born);
  return `<li>${lab(per)}${sp ? ' ⚭ ' + lab(sp) : ''}${kids.length ? '<ul>' + kids.map(node).join('') + '</ul>' : ''}</li>`; };
 return `<div class="lw-tree"><ul>${Array.from(roots).map(id => node(P(id))).join('')}</ul></div>`;
}
const KICON = {birth: '👶', death: '⚰️', marriage: '💍', adventure: '⚔️', scandal: '🗣️', business: '🏪', disaster: '🌊', gossip: '💬', family: '🏠', guild: '📜', politics: '🏛️'};
function render() {
 const tabs = [['houses','🏘️ Households'],['tree','🌳 Family Tree'],['chron','📰 Chronicle'],['guild','⚔️ Guild'],['set','⚙️ Settings']];
 let body = `<div class="lw-tabs">${tabs.map(([k, l]) => `<button class="${ui.tab === k ? 'on' : ''}" onclick="LW.ui('tab','${k}')">${l}</button>`).join('')}</div>`;
 const hs = Object.values(W.houses).filter(h => h.members.some(id => alive(P(id))) || h.player).sort((a, b) => (b.player ? 1e9 : 0) - (a.player ? 1e9 : 0) || (b.cls || b.wealth) - (a.cls || a.wealth));
 const pop = Object.values(W.people).filter(alive).length;
 if (ui.tab === 'houses' && ui.house && H(ui.house)) {
  const h = H(ui.house), mine = h.player;
  body += `<p><button onclick="LW.ui('house',null)">◀ All households</button> <button onclick="LW.ui('treeof','${h.id}')">🌳 Family tree</button></p>
   <h3 style="margin:4px 0">The ${esc(h.name)} House</h3><p class="lw-dim">${mine ? '' : wealthWord(h) + ' · '}Standing ${Math.round(h.rep)}${h.biz ? ' · owns ' + esc(h.biz.name) : ''}${h.debt > 100 && mine ? ' · debt ' + Math.round(h.debt) + 'g' : ''}</p>
   ${h.members.map(P).filter(Boolean).sort((a, b) => (alive(b) - alive(a)) || a.born - b.born).map(x => personRow(x, mine)).join('')}`;
  const ev = W.chron.filter(e => (!e.secret || e.known) && e.ids.some(id => h.members.includes(id))).slice(-8).reverse();
  if (ev.length) body += `<h4>Family history</h4>${ev.map(e => `<div class="lw-p">${KICON[e.k] || '•'} <span class="lw-dim">${yearOf(e.y)}</span> ${e.t}</div>`).join('')}`;
 } else if (ui.tab === 'houses') {
  body += `<p class="lw-dim">${hs.length} households · ${pop} living souls on the Isle of Carrow · ${yearOf(W.yr)}. Fish ${W.market.fish > 1.1 ? '▲ dear' : W.market.fish < .9 ? '▼ cheap' : '● steady'} · Arms ${W.market.arms > 1.1 ? '▲ in demand' : '● steady'}</p><div class="lw-grid">${hs.map(houseCard).join('')}</div>`;
 } else if (ui.tab === 'tree') {
  const h = H(ui.house) || hs[0];
  body += `<p><select onchange="LW.ui('treeof',this.value)">${hs.map(x => `<option value="${x.id}" ${x === h ? 'selected' : ''}>The ${esc(x.name)} House</option>`).join('')}</select></p>${treeHTML(h)}`;
 } else if (ui.tab === 'chron') {
  const F = [['all','All'],['birth','Births'],['death','Deaths'],['marriage','Marriages'],['adventure','Adventures'],['scandal','Scandals'],['gossip','Gossip'],['business','Business'],['disaster','The Deep']];
  const list = W.chron.filter(e => (!e.secret || e.known) && (ui.filter === 'all' || e.k === ui.filter));
  const byY = {}; for (const e of list) (byY[Math.floor(e.y)] = byY[Math.floor(e.y)] || []).push(e);
  body += `<div class="lw-tabs">${F.map(([k, l]) => `<button class="${ui.filter === k ? 'on' : ''}" onclick="LW.ui('filter','${k}')">${l}</button>`).join('')}</div>
   <div class="lw-news"><div style="text-align:center;font-size:18px;letter-spacing:2px">THE SALTMERE TIDINGS</div><div class="lw-dim" style="text-align:center">Births · Deaths · Marriages · Adventures · Whatever the harbor is whispering</div>
   ${Object.keys(byY).sort((a, b) => b - a).map(y => `<h3>${yearOf(+y)}</h3>${byY[y].slice().reverse().slice(0, 120).map(e => `<div class="e">${KICON[e.k] || '•'} ${e.t}</div>`).join('')}`).join('') || '<p>No news yet. Give it a day.</p>'}</div>`;
 } else if (ui.tab === 'guild') {
  const advs = Object.values(W.people).filter(x => alive(x) && x.job === 'adventurer').sort((a, b) => b.adv - a.adv);
  body += `<h4>📜 Open contracts</h4>${W.contracts.filter(c => !c.taken && !c.done).map(c => `<div class="lw-p">${c.type === 'missing' ? '❓' : '⚔️'} <b>${esc(c.title)}</b> · danger ${'☠'.repeat(c.tier)}${c.patron && H(c.patron) ? ' · funded by the ' + esc(H(c.patron).name) + 's' : ''}</div>`).join('') || '<p class="lw-dim">None posted.</p>'}
   <h4>🧭 Parties in the field</h4>${W.parties.map(pt => { const c = W.contracts.find(x => x.id === pt.c); return `<div class="lw-p">${esc(c ? c.title : '?')}: ${pt.ids.map(P).filter(Boolean).map(x => esc(fullName(x))).join(', ')}</div>`; }).join('') || '<p class="lw-dim">Nobody is out right now.</p>'}
   <h4>🏆 Rankings</h4>${advs.slice(0, 15).map((x, i) => `<div class="lw-p">${i + 1}. <b>${esc(fullName(x))}</b>, rank ${x.adv} · ${archetype(x)}${x.away ? ' · away' : x.injured ? ' · injured' : ''}</div>`).join('')}
   <h4>🪦 Memorial stone</h4>${(W.fallen || []).slice().reverse().map(f => `<div class="lw-p lw-dim">✝ ${esc(P(f.id) ? fullName(P(f.id)) : '?')}, ${yearOf(f.y)}, on "${esc(f.c)}"</div>`).join('') || '<p class="lw-dim">No names yet. The mason has left room.</p>'}`;
 } else if (ui.tab === 'set') {
  body += `<div class="lw-set">${CFG_UI.map(([k, l, opts]) => `<label>${l}<select onchange="LW.ui('cfg','${k}',this.value)">${opts.map(o => { const [v, t] = Array.isArray(o) ? o : [o, String(o)]; return `<option value="${v}" ${String(W.cfg[k]) === String(v) ? 'selected' : ''}>${t}</option>`; }).join('')}</select></label>`).join('')}</div>
   <p class="lw-dim">These shape the whole island, from a slow family life to a deadly survival game. Changes apply from the next island day.</p>`;
 }
 G().openPanel('🏘️ The Neighborhood', CSS + body);
}

// ---------------- public hooks ----------------
window.LW = {
 begin(continued) {
  const sv = continued ? load() : null;
  if (sv && sv.v === 1) { W = sv; W.cfg = Object.assign({}, CFG_DEF, W.cfg); W.walking = []; }
  else { seed(); for (let i = 0; i < 3; i++) simDay(); }
  lastDay = Math.floor(G().S.time / 1440); lastHour = -1;
  syncPlayer(); save();
 },
 minute() {
  if (!W) return;
  const t = G().S.time, d = Math.floor(t / 1440), h = Math.floor((t % 1440) / 60);
  if (d !== lastDay) { const n = Math.min(30, Math.max(1, d - lastDay)); for (let i = 0; i < n; i++) simDay(); lastDay = d; save(); }
  if (h !== lastHour) { lastHour = h; streetsTick(); }
 },
 save,
 open() { if (!W) return; render(); },
 altar() { if (W) altar(); }, sacrifice, kidAge, growUp, myAge, sendExpedition, expeditionState, succeed, sexOf: name => { const x = pk(name); return x ? x.sex : 'm'; }, overhear, joinChoir, personFor, familyLine, confide, knownGossip, tellGossip, rumor, noteRel, favorFor, favorDone, coworkers, archetype,
 traitName: t => TRAITS[t] ? TRAITS[t][0] + ' ' + TRAITS[t][1] : t,
 note(k, t) { if (W) chron(k, t, W.me ? [W.me] : [], {loud: 1}); },
 ui(k, v, w) {
  if (k === 'tab') { ui.tab = v; if (v !== 'tree') ui.house = null; }
  else if (k === 'house') ui.house = v;
  else if (k === 'treeof') { ui.tab = 'tree'; ui.house = v; }
  else if (k === 'filter') ui.filter = v;
  else if (k === 'cfg') W.cfg[v] = w === 'true' ? true : w === 'false' ? false : +w;
  render();
 },
 // debug / tests
 get W() { return W; }, simDay, stats() { const ps = Object.values(W.people); return {houses: Object.values(W.houses).filter(h => living(h).length).length, alive: ps.filter(alive).length, dead: ps.filter(x => x.dead).length, missing: ps.filter(x => x.gone).length, chron: W.chron.length, known: W.chron.filter(e => !e.secret || e.known).length, walking: W.walking.length, adventurers: ps.filter(x => alive(x) && x.job === 'adventurer').length, cult: ps.filter(x => alive(x) && x.cult).length, biz: Object.values(W.houses).filter(h => h.biz).length, yr: W.yr.toFixed(2)}; },
};
})();
