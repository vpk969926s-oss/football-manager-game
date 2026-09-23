const initialPlayers = [
  ['01', 'Luca Moretti', 29, 'GK', 78], ['13', 'Evan Cole', 23, 'GK', 69], ['02', 'Marcus Reed', 27, 'DEF', 76], ['03', 'Theo Laurent', 25, 'DEF', 74], ['04', 'Jonas Berg', 31, 'DEF', 77], ['05', 'Samir Khan', 22, 'DEF', 68], ['15', 'Nico Alvarez', 20, 'DEF', 66], ['18', 'Owen Price', 24, 'DEF', 71], ['06', 'Arthur Silva', 28, 'MID', 80], ['08', 'Milo Jensen', 26, 'MID', 78], ['10', 'Kenji Sato', 24, 'MID', 82], ['14', 'Rafael Costa', 21, 'MID', 72], ['16', 'Darius Okafor', 23, 'MID', 70], ['21', 'Finn Walsh', 19, 'MID', 65], ['07', 'Leo Grant', 27, 'FWD', 79], ['09', 'Mateo Rossi', 29, 'FWD', 84], ['11', 'Noah Williams', 22, 'FWD', 76], ['17', 'Callum Wright', 25, 'FWD', 73], ['19', 'Yuki Tanaka', 20, 'FWD', 71], ['20', 'Ibrahim Diallo', 23, 'FWD', 69]
];
const clubs = [
  { id: 'northbridge', name: 'Northbridge FC', short: 'NB', cpu: false, strength: 72 }, { id: 'redhaven', name: 'Redhaven United', short: 'RU', cpu: true, strength: 76 }, { id: 'oakvale', name: 'Oakvale City', short: 'OC', cpu: true, strength: 73 }, { id: 'kingston', name: 'Kingston Rovers', short: 'KR', cpu: true, strength: 70 }, { id: 'harbor', name: 'Harbor Athletic', short: 'HA', cpu: true, strength: 68 }, { id: 'meadow', name: 'Meadow Park', short: 'MP', cpu: true, strength: 66 }, { id: 'ironwood', name: 'Ironwood FC', short: 'IF', cpu: true, strength: 64 }, { id: 'crown', name: 'Crownfield', short: 'CF', cpu: true, strength: 61 }, { id: 'riverside', name: 'Riverside Town', short: 'RT', cpu: true, strength: 59 }, { id: 'lakeside', name: 'Lakeside Athletic', short: 'LA', cpu: true, strength: 56 }
];

'use strict';
const USER = 'northbridge';
const SAVE_KEY = 'northbridge.club-manager.v4';
const VERSION = 5;
const LEAGUE = { matchdays: (clubs.length - 1) * 2, winterAfter: clubs.length - 1 };
const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
const SLOTS = ['GK', ...Array(4).fill('DEF'), ...Array(3).fill('MID'), ...Array(3).fill('FWD')];
const $ = (selector) => document.querySelector(selector);
function formatMoney(value) {
  const num = Math.round(Number(value) || 0);
  if (num === 0) return '€0';
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  const oku = Math.floor(abs / 100000000);
  const man = Math.floor((abs % 100000000) / 10000);
  const rest = abs % 10000;
  let str = '';
  if (oku > 0) str += oku + '億';
  if (man > 0) str += man + '万';
  if (rest > 0) str += rest;
  return sign + '€' + str;
}
const money = formatMoney;
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clubById = (id) => clubs.find(c => c.id === id);
const ui = { screen: 'dashboard', squadFilter: 'all', transferFilter: 'all', sort: 'ovr', activeSlot: null, market: 'clubs', search: '', developmentSort: 'gain', reportSeason: null };
let confirmation = null;
let noticeTimer;

// Save only plain data. Players have globally unique IDs and exactly one owner.
function marketValue(age, position, ovr, pot = ovr) {
  const ageFactor = age <= 23 ? 1.3 : age <= 27 ? 1.1 : age <= 29 ? .9 : age <= 32 ? .65 : .45;
  const positionFactor = { GK: .8, DEF: .95, MID: 1.05, FWD: 1.15 }[position];
  return Math.round(Math.max(250000, Math.min(90000000,
    1500000 * Math.exp((ovr - 60) / 8) * ageFactor * positionFactor * (1 + (age <= 24 ? Math.max(0, pot - ovr) * .035 : 0)))) / 50000) * 50000;
}
function makePlayer(id, number, name, age, position, ovr) {
  const pot = initialPotential(age, ovr, id);
  const value = marketValue(age, position, ovr, pot);
  const p = { id, number, name, age, position, ovr, pot, previousOVR: ovr,
    contractYears: 1 + hashId(id) % 5, marketValue: value, transferFee: Math.round(value * 1.15 / 50000) * 50000 };
  p.wage = calculateWage(p);
  return p;
}
function createFixtures(season = 1) {
  const offset = (season - 1) % clubs.length;
  const teams = [...clubs.slice(offset), ...clubs.slice(0, offset)].map(c => c.id);
  let ring = teams.slice(1);
  const first = [];
  for (let day = 0; day < 9; day++) {
    const order = [teams[0], ...ring];
    const round = [];
    for (let i = 0; i < 5; i++) {
      const pair = [order[i], order[9 - i]];
      if ((day + i) % 2) pair.reverse();
      round.push({ id: day * 5 + i, home: pair[0], away: pair[1], played: false, homeScore: null, awayScore: null });
    }
    first.push(round);
    ring = [ring.at(-1), ...ring.slice(0, -1)];
  }
  return first.concat(first.map((round, day) => round.map((m, i) => ({
    ...m, id: (day + 9) * 5 + i, home: m.away, away: m.home
  }))));
}
function emptyStandings() {
  return clubs.map(c => ({ clubId: c.id, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }));
}
function newGame() {
  const squads = { [USER]: initialPlayers.map(p => makePlayer('nb-' + p[0], ...p)) };
  const firstNames = ['Adrian','Bruno','Ciro','Damon','Elias','Felix','Galen','Hugo','Ivo','Jules','Kai','Leon','Marek','Nolan','Otto','Pavel','Quinn','Ruben','Soren','Tomas'];
  const lastNames = ['Vale','Marlow','Voss','Arden','Keller','Rowan','Linden','Bell','Hale'];
  const roles = ['GK','GK', ...Array(6).fill('DEF'), ...Array(6).fill('MID'), ...Array(6).fill('FWD')];
  clubs.filter(c => c.cpu).forEach((club, ci) => {
    squads[club.id] = roles.map((position, i) => makePlayer(
      club.id + '-' + (i + 1), String(i + 1).padStart(2,'0'),
      firstNames[(i + ci * 3) % 20] + ' ' + lastNames[ci],
      19 + (i * 3 + ci) % 15, position, Math.max(50, Math.min(88, club.strength + (i * 7 + ci) % 15 - 6))
    ));
  });
  const state = { version: VERSION, season: 1, seasonHistory: [], playerDevelopmentHistory: [],
    freeAgents: [], nextPlayerId: 1, transferWindowState: 'summer', endOfSeasonRoster: [], retirementHistory: [],
    currentMatchday: 1, fixtures: createFixtures(), standings: emptyStandings(),
    results: [], squads, selectedStartingXI: [], lineup: Array(11).fill(null),
    clubFunds: 100000000, transfers: [], seasonComplete: false };
  ensureFreeAgentPool(state);
  return state;
}
function validateSave(s) {
  if (!s || s.version !== VERSION || !Number.isSafeInteger(s.clubFunds) || s.clubFunds < 0 ||
      !Number.isInteger(s.currentMatchday) || s.currentMatchday < 1 || s.currentMatchday > LEAGUE.matchdays ||
      !Array.isArray(s.results) || !Array.isArray(s.transfers) || typeof s.seasonComplete !== 'boolean') throw Error('Invalid save');
  const ids = new Set();
  if (!Number.isSafeInteger(s.season) || s.season < 1 ||
      !Array.isArray(s.seasonHistory) || !Array.isArray(s.playerDevelopmentHistory) ||
      !Array.isArray(s.freeAgents) || !Array.isArray(s.retirementHistory) || !Array.isArray(s.endOfSeasonRoster) ||
      !Number.isSafeInteger(s.nextPlayerId) || s.nextPlayerId < 1 ||
      !['summer','winter','closed'].includes(s.transferWindowState)) throw Error('Invalid season');
  for (const club of [...clubs, { id: 'free' }]) {
    const squad = club.id === 'free' ? s.freeAgents : s.squads?.[club.id];
    if (!Array.isArray(squad)) throw Error('Invalid squad');
    for (const p of squad) {
      if (!p || typeof p.id !== 'string' || !/^[a-z0-9-]+$/.test(p.id) || ids.has(p.id) || typeof p.name !== 'string' || typeof p.number !== 'string' || !/^[0-9]+$/.test(p.number) ||
          !POSITIONS.includes(p.position) || !Number.isInteger(p.age) || p.age < 16 || p.age > 120 ||
          !Number.isInteger(p.ovr) || p.ovr < 1 || p.ovr > 99 ||
          !Number.isInteger(p.pot) || p.pot < p.ovr || p.pot > 99 ||
          !Number.isInteger(p.previousOVR) || p.previousOVR < 1 || p.previousOVR > 99 ||
          !Number.isInteger(p.contractYears) || p.contractYears < (club.id === 'free' ? 0 : 1) || p.contractYears > 5 ||
          (club.id === 'free' && p.contractYears !== 0) ||
          !Number.isSafeInteger(p.wage) || p.wage < 0 ||
          !Number.isSafeInteger(p.marketValue) || p.marketValue <= 0 ||
          !Number.isSafeInteger(p.transferFee) || p.transferFee <= 0) throw Error('Invalid player');
      ids.add(p.id);
    }
  }
  const userIds = new Set(s.squads[USER].map(p => p.id));
  if (!Array.isArray(s.selectedStartingXI) || s.selectedStartingXI.length > 11 ||
      new Set(s.selectedStartingXI).size !== s.selectedStartingXI.length ||
      s.selectedStartingXI.some(id => !userIds.has(id)) || !Array.isArray(s.lineup) || s.lineup.length !== 11 ||
      s.lineup.filter(Boolean).length !== s.selectedStartingXI.length ||
      new Set(s.lineup.filter(Boolean)).size !== s.selectedStartingXI.length ||
      s.lineup.filter(Boolean).some(id => !s.selectedStartingXI.includes(id))) throw Error('Invalid XI');
  const expected = createFixtures(s.season);
  if (!Array.isArray(s.fixtures) || s.fixtures.length !== LEAGUE.matchdays) throw Error('Invalid fixtures');
  s.fixtures.forEach((round, day) => {
    if (!Array.isArray(round) || round.length !== 5 || round.some(m => m.played !== round[0].played)) throw Error('Invalid round');
    round.forEach((m, i) => {
      const e = expected[day][i];
      if (m.id !== e.id || m.home !== e.home || m.away !== e.away || typeof m.played !== 'boolean' ||
          (m.played && (!Number.isInteger(m.homeScore) || !Number.isInteger(m.awayScore) || m.homeScore < 0 || m.awayScore < 0 || m.homeScore > 8 || m.awayScore > 8)) ||
          (day < s.currentMatchday - 1 && !m.played) || (day >= s.currentMatchday && m.played)) throw Error('Invalid result');
      if (m.played) {
        m.homeGoals = Array.isArray(m.homeGoals) ? m.homeGoals : [];
        m.awayGoals = Array.isArray(m.awayGoals) ? m.awayGoals : [];
      }
    });
  });
  if (s.seasonComplete !== s.fixtures[LEAGUE.matchdays - 1][0].played) throw Error('Invalid completion');
  if (s.transferWindowState === 'summer' && (s.currentMatchday !== 1 || s.fixtures[0][0].played)) throw Error('Invalid summer window');
  if (s.transferWindowState === 'winter' && (s.currentMatchday !== LEAGUE.winterAfter || !s.fixtures[LEAGUE.winterAfter - 1][0].played)) throw Error('Invalid winter window');
  // Rebuild derived data from fixtures, rather than trusting inconsistent aggregates.
  s.standings = emptyStandings();
  s.results = [];
  s.fixtures.forEach((round, day) => round.filter(m => m.played).forEach(m => {
    applyResult(s.standings, m);
    s.results.push({ ...m, matchday: day + 1, season: s.season });
  }));
  return s;
}

function hashId(id) {
  return [...id].reduce((sum, c) => (sum * 31 + c.charCodeAt(0)) >>> 0, 0);
}
function initialPotential(age, ovr, id) {
  const room = age <= 20 ? 8 + hashId(id) % 9 : age <= 24 ? 4 + hashId(id) % 7 : age <= 28 ? hashId(id) % 4 : 0;
  return Math.min(99, ovr + room);
}
function calculateWage(p) {
  const talent = 1 + Math.max(0, p.pot - p.ovr) * (p.age <= 24 ? .012 : 0);
  const ageFactor = p.age >= 32 ? .8 : p.age <= 21 ? .9 : 1;
  return Math.round(Math.max(500, Math.min(250000, 2500 * Math.exp((p.ovr - 60) / 8) * talent * ageFactor)) / 100) * 100;
}
function validYears(years) { return Number.isInteger(years) && years >= 1 && years <= 5; }
function ensureFreeAgentPool(state) {
  // Unattached adult professionals, not a youth academy or transfer AI.
  for (const position of POSITIONS) {
    while (state.freeAgents.filter(p => p.position === position).length < 4) {
      const n = state.nextPlayerId++;
      const p = makePlayer('fa-' + n, String(n % 99 + 1), ['Alex','Ren','Liam','Nils','Enzo','Tariq'][n % 6] + ' ' +
        ['West','Dale','Mori','Falk','Reis','Neri'][Math.floor(n / 6) % 6] + ' ' + n,
        21 + n % 9, position, 55 + n % 14);
      p.contractYears = 0;
      state.freeAgents.push(p);
    }
  }
}
function migrateSave(s) {
  if (!s || ![4, VERSION].includes(s.version)) throw Error('Unsupported save version');
  s.season ??= 1;
  s.seasonHistory ??= [];
  s.playerDevelopmentHistory ??= [];
  s.freeAgents ??= [];
  s.retirementHistory ??= [];
  s.endOfSeasonRoster ??= [];
  s.nextPlayerId ??= 1;
  if (!s.transferWindowState) {
    s.transferWindowState = s.currentMatchday === 1 && !s.fixtures?.[0]?.[0]?.played ? 'summer' : 'closed';
    if ((s.currentMatchday === LEAGUE.winterAfter && s.fixtures?.[LEAGUE.winterAfter - 1]?.[0]?.played) ||
        (s.currentMatchday === LEAGUE.winterAfter + 1 && !s.fixtures?.[LEAGUE.winterAfter]?.[0]?.played)) {
      s.currentMatchday = LEAGUE.winterAfter;
      s.transferWindowState = 'winter';
    }
  }
  const all = [...Object.values(s.squads || {}).flat(), ...s.freeAgents];
  for (const p of all) {
    p.pot ??= initialPotential(p.age, p.ovr, p.id);
    p.previousOVR ??= p.ovr;
    p.contractYears ??= s.freeAgents.includes(p) ? 0 : 1 + hashId(p.id) % 5;
    p.wage ??= calculateWage(p);
  }
  s.fixtures?.forEach(round => {
    round?.forEach(m => {
      if (m.played) {
        m.homeGoals = Array.isArray(m.homeGoals) ? m.homeGoals : [];
        m.awayGoals = Array.isArray(m.awayGoals) ? m.awayGoals : [];
      }
    });
  });
  if (s.version === 4) ensureFreeAgentPool(s);
  s.version = VERSION;
  return s;
}
// One policy used by every buy/sell/sign action and all window UI.
function transferWindow(state = gameState) {
  const phase = state.seasonComplete ? 'closed' : state.transferWindowState;
  return { phase, open: phase !== 'closed', message: phase === 'summer'
    ? 'Transfer Window: OPEN · Summer Window'
    : phase === 'winter' ? 'Transfer Window: OPEN · Winter Window'
    : 'TRANSFER WINDOW CLOSED · ' + (state.seasonComplete ? '次シーズン開始で夏の移籍期間へ' :
      state.currentMatchday <= LEAGUE.winterAfter ? 'Winter window opens after Matchday ' + LEAGUE.winterAfter : '次の夏まで移籍できません') };
}
function closeTransferWindow() {
  const status = transferWindow();
  if (!status.open) return;
  // Do not lock the user out of recruiting a valid XI.
  const enough = POSITIONS.every(pos => squad().filter(p => p.position === pos).length >= SLOTS.filter(s => s === pos).length);
  if (!enough || squad().length < 15) return notify('移籍期間を終了するには15人以上と4-3-3を組める人数を確保してください。');
  if (status.phase === 'winter') gameState.currentMatchday = LEAGUE.winterAfter + 1;
  gameState.transferWindowState = 'closed';
  commit(status.phase === 'summer' ? '夏の移籍期間終了。シーズンを開始します。' : '冬の移籍期間終了。第10節へ進みます。');
  switchScreen('match');
}
function requestContract(id, mode) {
  if (mode !== 'renew' && !transferWindow().open) return notify('TRANSFER WINDOW CLOSED');
  const p = mode === 'renew' ? playerById(id) : mode === 'sign' ? gameState.freeAgents.find(p => p.id === id) :
    clubs.filter(c => c.cpu).flatMap(c => gameState.squads[c.id]).find(p => p.id === id);
  if (!p) return notify('選手が見つかりません。');
  const fee = mode === 'buy' ? p.transferFee : 0;
  if (fee > gameState.clubFunds) return notify('資金不足です。');
  askConfirmation(mode === 'renew' ? '契約更新' : mode === 'sign' ? 'フリー選手と契約' : '選手購入と契約',
    p.name + ' · OVR ' + p.ovr + ' / POT ' + p.pot + ' · 移籍金 ' + money(fee) + '。契約条件を確認してください。',
    () => {
      const years = Number($('#contract-years').value);
      if (mode === 'renew') renewContract(id, years);
      else if (mode === 'sign') signFreeAgent(id, years);
      else buyPlayer(id, years);
    });
  $('#contract-options').hidden = false;
  $('#contract-years').value = '3';
  $('#contract-wage').textContent = '新しい週給: ' + money(calculateWage(p)) + ' /週';
}
function renewContract(id, years) {
  const p = playerById(id);
  if (!p || !validYears(years)) return notify('契約年数は1〜5年です。');
  p.contractYears = years;
  p.wage = calculateWage(p);
  commit(p.name + ' の契約を' + years + '年に更新しました。');
}
function signFreeAgent(id, years) {
  if (!transferWindow().open) return notify('TRANSFER WINDOW CLOSED');
  const p = gameState.freeAgents.find(p => p.id === id);
  if (!p || !validYears(years)) return notify('選手または契約年数を確認してください。');
  p.contractYears = years; p.wage = calculateWage(p);
  gameState.freeAgents = gameState.freeAgents.filter(p => p.id !== id);
  squad().push(p);
  gameState.transfers.push({ playerId: id, from: 'free', to: USER, fee: 0, season: gameState.season, matchday: gameState.currentMatchday, type: 'sign' });
  commit(p.name + ' と契約しました。');
}
function retirementChance(age) {
  if (age < 34) return 0;
  if (age >= 42) return 1;
  return [0.03, 0.06, 0.10, 0.17, 0.25, 0.38, 0.55, 0.75][age - 34];
}
function finishSeason(random = Math.random) {
  if (!gameState.seasonComplete || gameState.seasonHistory.some(h => h.season === gameState.season)) return;
  const sorted = sortedStandings();
  const userStats = sorted.find(s => s.clubId === USER);
  gameState.seasonHistory.push({ season: gameState.season, champion: sorted[0].clubId,
    rank: sorted.findIndex(s => s.clubId === USER) + 1, ...userStats });
  gameState.endOfSeasonRoster = squad().map(p => ({ ...p }));
  gameState.transferWindowState = 'closed';
  const unattached = [];
  function retained(p, from) {
    if (random() < retirementChance(p.age)) {
      gameState.retirementHistory.push({ id: p.id, name: p.name, age: p.age, position: p.position, season: gameState.season, from });
      return false;
    }
    if (from !== 'free') p.contractYears--;
    if (p.contractYears === 0) { unattached.push(p); return false; }
    return true;
  }
  // Process pre-existing free agents exactly once, then expiring contracts.
  gameState.freeAgents.forEach(p => retained(p, 'free'));
  clubs.forEach(c => { gameState.squads[c.id] = gameState.squads[c.id].filter(p => retained(p, c.id)); });
  gameState.freeAgents = unattached;
  const owned = new Set(squad().map(p => p.id));
  gameState.selectedStartingXI = gameState.selectedStartingXI.filter(id => owned.has(id));
  gameState.lineup = gameState.lineup.map(id => owned.has(id) ? id : null);
  ui.activeSlot = null;
}
function evolvePlayer(p, random = Math.random) {
  p.previousOVR = p.ovr;
  p.age++;
  const r = random();
  let change;
  if (p.age <= 20) change = r < .15 ? 0 : r < .45 ? 1 : r < .8 ? 2 : 3;
  else if (p.age <= 24) change = r < .25 ? 0 : r < .7 ? 1 : r < .95 ? 2 : 3;
  else if (p.age <= 28) change = r < .7 ? 0 : 1;
  else if (p.age <= 31) change = r < .55 ? 0 : -1;
  else change = r < .15 ? 0 : r < .55 ? -1 : r < .9 ? -2 : -3;
  p.ovr = Math.max(1, Math.min(p.pot, p.ovr + change));
  p.marketValue = marketValue(p.age, p.position, p.ovr, p.pot);
  p.transferFee = Math.round(p.marketValue * 1.15 / 50000) * 50000;
}
function replenishCPU() {
  // Minimal roster continuity, not price-based CPU transfer negotiation.
  for (const c of clubs.filter(c => c.cpu)) {
    for (const [pos, target] of [['GK',2],['DEF',6],['MID',6],['FWD',6]]) {
      while (gameState.squads[c.id].filter(p => p.position === pos).length < target) {
        ensureFreeAgentPool(gameState);
        const p = gameState.freeAgents.find(p => p.position === pos);
        gameState.freeAgents = gameState.freeAgents.filter(x => x.id !== p.id);
        p.contractYears = 3; p.wage = calculateWage(p);
        gameState.squads[c.id].push(p);
        gameState.transfers.push({ playerId: p.id, from: 'free', to: c.id, fee: 0, season: gameState.season, matchday: 1, type: 'roster-cover' });
      }
    }
  }
  ensureFreeAgentPool(gameState);
}
function startNextSeason(random = Math.random) {
  if (!gameState.seasonComplete) return;
  finishSeason(random);
  const all = [...Object.values(gameState.squads).flat(), ...gameState.freeAgents];
  all.forEach(p => evolvePlayer(p, random));
  const report = gameState.endOfSeasonRoster.map(old => {
    const now = all.find(p => p.id === old.id);
    return { id: old.id, name: old.name, position: old.position, age: now ? now.age : old.age,
      previousOVR: old.ovr, newOVR: now ? now.ovr : old.ovr, delta: now ? now.ovr - old.ovr : 0,
      status: !now ? '引退（更新対象外）' : squad().some(p => p.id === old.id) ? '在籍' : '契約満了' };
  });
  gameState.season++;
  gameState.playerDevelopmentHistory.push({ season: gameState.season, players: report });
  gameState.currentMatchday = 1;
  gameState.fixtures = createFixtures(gameState.season);
  gameState.standings = emptyStandings(); gameState.results = [];
  gameState.seasonComplete = false; gameState.transferWindowState = 'summer';
  gameState.endOfSeasonRoster = [];
  replenishCPU();
  ui.activeSlot = null; ui.reportSeason = gameState.season;
  commit('Season ' + gameState.season + ' 開始。Summer Window OPEN');
  switchScreen('development');
}
function developmentRows(report, sort) {
  return [...report.players].sort((a,b) => sort === 'decline' ? a.delta - b.delta :
    sort === 'ovr' ? b.newOVR - a.newOVR : sort === 'age' ? a.age - b.age : b.delta - a.delta);
}
function renderDevelopment() {
  const history = gameState.playerDevelopmentHistory;
  const current = history.find(r => r.season === ui.reportSeason) || history.at(-1);
  $('#development-season').innerHTML = history.length
    ? history.map(h => '<option value="' + h.season + '">Season ' + h.season + '</option>').join('')
    : '<option value="">まだレポートはありません</option>';
  if (current) $('#development-season').value = String(current.season);
  $('#development-list').innerHTML = current ? developmentRows(current, ui.developmentSort).map(p =>
    `<article class="development-card"><div><h3>${escapeHTML(p.name)}</h3><p>${p.age}歳 · ${p.position} · ${escapeHTML(p.status)}</p></div><div class="ovr-change"><span><small>Previous OVR</small><b>${p.previousOVR}</b></span><span aria-hidden="true">→</span><span><small>New OVR</small><b>${p.newOVR}</b></span><strong class="${p.delta > 0 ? 'gain' : p.delta < 0 ? 'decline' : 'unchanged'}">${p.delta > 0 ? '+' : ''}${p.delta}</strong></div></article>`).join('')
    : '<p>次シーズン開始時に成長レポートが作成されます。</p>';
}
function renderSeasons() {
  document.querySelectorAll('[data-window-continue]').forEach(b => {
    b.hidden = !transferWindow().open;
    b.textContent = transferWindow().phase === 'summer' ? 'Start Season' : 'Continue Season';
  });
  const current = gameState.seasonHistory.find(h => h.season === gameState.season);
  $('#season-summary').innerHTML = gameState.seasonComplete && current
    ? `<p class="eyebrow green">SEASON ${current.season} COMPLETE</p><h2>優勝: ${clubById(current.champion).name}</h2><p>最終順位 ${current.rank}位 · 勝点 ${current.points}</p><p>W-D-L: ${current.wins}-${current.draws}-${current.losses}</p><p>得点 ${current.goalsFor} / 失点 ${current.goalsAgainst} / 得失点差 ${current.goalDifference}</p><p>契約満了・引退を処理しました。次シーズン開始時に年齢・OVR・市場価値が更新されます。</p>`
    : '<p>Season ' + gameState.season + ' · シーズン進行中</p>';
  $('#start-next-season').hidden = !gameState.seasonComplete;
  $('#season-history').innerHTML = [...gameState.seasonHistory].reverse().map(h => `<article class="season-panel"><h3>Season ${h.season} · ${clubById(h.champion).name}</h3><p>優勝クラブ / 自クラブ ${h.rank}位 · ${h.points}勝点</p><p>W-D-L: ${h.wins}-${h.draws}-${h.losses}</p></article>`).join('') || '<p>シーズン終了後に記録されます。</p>';
  renderDevelopment();
}

let saveMessage = '';
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return newGame();
    const state = validateSave(migrateSave(JSON.parse(raw)));
    saveMessage = 'セーブを復元しました。';
    return state;
  } catch {
    saveMessage = 'セーブを読み込めませんでした。新規状態で開始します。';
    return newGame();
  }
}
let gameState = loadGame();
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));
    saveMessage = '自動保存済み · このブラウザに保存';
  } catch {
    saveMessage = '保存できません。ブラウザの保存設定・空き容量を確認してください。';
    notify(saveMessage);
  }
  $('#save-status').textContent = saveMessage;
}
const squad = () => gameState.squads[USER];
const playerById = id => squad().find(p => p.id === id);
const selected = () => gameState.selectedStartingXI.map(playerById).filter(Boolean);
function notify(message) {
  clearTimeout(noticeTimer);
  $('#notice').textContent = message;
  $('#notice').hidden = false;
  noticeTimer = setTimeout(() => { $('#notice').hidden = true; }, 5000);
}
function commit(message) {
  saveGame();
  renderAll();
  if (message) notify(message);
}
function askConfirmation(title, message, action) {
  confirmation = action;
  $('#contract-options').hidden = true;
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  $('#confirm-dialog').showModal();
}
function syncLineup() {
  const pool = selected().map(p => p.id);
  gameState.lineup = SLOTS.map(position => {
    const index = pool.findIndex(id => playerById(id).position === position);
    return index >= 0 ? pool.splice(index, 1)[0] : null;
  });
  // Keep all selected players visible, including out-of-position selections.
  gameState.lineup = gameState.lineup.map(id => id || pool.shift() || null);
}
function validFormation() {
  return gameState.selectedStartingXI.length === 11 &&
    SLOTS.every((position, i) => playerById(gameState.lineup[i])?.position === position);
}
function togglePlayer(id) {
  if (!playerById(id)) return;
  const xi = gameState.selectedStartingXI;
  if (xi.includes(id)) gameState.selectedStartingXI = xi.filter(p => p !== id);
  else if (xi.length < 11) xi.push(id);
  else return notify('スタメンは最大11人です。先に1人解除してください。');
  ui.activeSlot = null;
  syncLineup();
  commit();
}
function assignBenchPlayer(id) {
  const slot = ui.activeSlot;
  if (slot === null) return notify('先にピッチの入れ替え先をタップしてください。');
  const player = playerById(id);
  if (!player) return;
  const old = gameState.lineup[slot];
  if (!old && !gameState.selectedStartingXI.includes(id) && gameState.selectedStartingXI.length >= 11)
    return notify('スタメンは最大11人です。');
  const existing = gameState.lineup.indexOf(id);
  if (existing >= 0) gameState.lineup[existing] = old;
  gameState.lineup[slot] = id;
  gameState.selectedStartingXI = gameState.lineup.filter(Boolean);
  ui.activeSlot = null;
  commit();
}
function autoPickBestXI() {
  const all = [...squad()].sort((a,b) => b.ovr - a.ovr);
  const picked = [];
  const pickedIds = new Set();
  const take = (pos, count) => {
    const available = all.filter(p => p.position === pos && !pickedIds.has(p.id));
    for (let i = 0; i < count && i < available.length; i++) {
      picked.push(available[i]);
      pickedIds.add(available[i].id);
    }
  };
  take('GK', 1);
  take('DEF', 4);
  take('MID', 3);
  take('FWD', 3);
  if (picked.length < 11) {
    const remaining = all.filter(p => !pickedIds.has(p.id));
    for (const p of remaining) {
      if (picked.length >= 11) break;
      picked.push(p);
      pickedIds.add(p.id);
    }
  }
  gameState.selectedStartingXI = picked.map(p => p.id);
  syncLineup();
  ui.activeSlot = null;
  commit('4-3-3のBest XIを自動選出しました。');
}
function clearStartingXI() {
  gameState.selectedStartingXI = [];
  gameState.lineup = Array(11).fill(null);
  ui.activeSlot = null;
  commit('Starting XIをクリアしました。');
}
function buyPlayer(id, years = 3) {
  if (!transferWindow().open) return notify('TRANSFER WINDOW CLOSED');
  if (!validYears(years)) return notify('契約年数は1〜5年です。');
  const owner = clubs.find(c => c.cpu && gameState.squads[c.id].some(p => p.id === id));
  if (!owner) return notify('この選手はすでに移籍済みです。');
  const source = gameState.squads[owner.id];
  const player = source.find(p => p.id === id);
  if (source.length <= 15) return notify('所属クラブが最低人数のため購入できません。');
  if (gameState.clubFunds < player.transferFee) return notify('資金不足です。');
  const fee = player.transferFee;
  gameState.clubFunds -= fee;
  gameState.squads[owner.id] = source.filter(p => p.id !== id);
  player.contractYears = years; player.wage = calculateWage(player);
  squad().push(player);
  gameState.transfers.push({ playerId: id, from: owner.id, to: USER, fee, season: gameState.season, matchday: gameState.currentMatchday });
  commit(player.name + ' を獲得しました。');
}
function sellPlayer(id) {
  if (!transferWindow().open) { notify('TRANSFER WINDOW CLOSED'); return false; }
  const player = playerById(id);
  if (!player) return false;
  if (squad().length <= 15) { notify('15人未満になる売却はできません。'); return false; }
  const buyer = clubs.filter(c => c.cpu).sort((a,b) => gameState.squads[a.id].length - gameState.squads[b.id].length)[0];
  gameState.squads[USER] = squad().filter(p => p.id !== id);
  gameState.squads[buyer.id].push(player);
  gameState.clubFunds += player.marketValue;
  gameState.selectedStartingXI = gameState.selectedStartingXI.filter(p => p !== id);
  gameState.lineup = gameState.lineup.map(p => p === id ? null : p);
  ui.activeSlot = null;
  gameState.transfers.push({ playerId: id, from: USER, to: buyer.id, fee: player.marketValue, season: gameState.season, matchday: gameState.currentMatchday });
  commit(player.name + ' を売却しました。');
  return true;
}
function requestSell(id) {
  if (!transferWindow().open) return notify('TRANSFER WINDOW CLOSED');
  const p = playerById(id);
  if (!p) return;
  if (squad().length <= 15) return notify('15人未満になる売却はできません。');
  askConfirmation('選手の売却', p.name + ' を ' + money(p.marketValue) + ' で売却しますか？ スタメンからも外れます。', () => sellPlayer(id));
}
function resetGame() {
  gameState = newGame();
  ui.activeSlot = null; ui.squadFilter = 'all'; ui.transferFilter = 'all'; ui.sort = 'ovr'; ui.market = 'clubs'; ui.search = ''; ui.reportSeason = null;
  $('#transfer-search').value = '';
  $('#transfer-sort').value = 'ovr';
  commit('新しいゲームを開始しました。');
  switchScreen('dashboard');
}
function teamProfile(id) {
  const pool = id === USER ? selected() : gameState.squads[id];
  const avg = ps => ps.length ? ps.reduce((n,p) => n + p.ovr, 0) / ps.length : 50;
  const parts = Object.fromEntries(POSITIONS.map(pos => [pos, avg(pool.filter(p => p.position === pos))]));
  return { overall: avg(pool), ...parts, attack: parts.FWD * .62 + parts.MID * .38,
    defense: parts.GK * .25 + parts.DEF * .55 + parts.MID * .2 };
}
function sortedStandings() {
  return [...gameState.standings].sort((a,b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor);
}
function currentFixture() {
  return gameState.fixtures[gameState.currentMatchday - 1].find(m => m.home === USER || m.away === USER);
}
function applyResult(standings, m) {
  const h = standings.find(s => s.clubId === m.home), a = standings.find(s => s.clubId === m.away);
  h.played++; a.played++;
  h.goalsFor += m.homeScore; h.goalsAgainst += m.awayScore;
  a.goalsFor += m.awayScore; a.goalsAgainst += m.homeScore;
  h.goalDifference = h.goalsFor - h.goalsAgainst; a.goalDifference = a.goalsFor - a.goalsAgainst;
  if (m.homeScore > m.awayScore) { h.wins++; h.points += 3; a.losses++; }
  else if (m.homeScore < m.awayScore) { a.wins++; a.points += 3; h.losses++; }
  else { h.draws++; a.draws++; h.points++; a.points++; }
}
function simulateScore(home, away) {
  const hp = teamProfile(home), ap = teamProfile(away);
  const expected = (a,b,bonus) => Math.max(.25, Math.min(3.2, 1.15 * Math.exp(((a.attack - b.defense) * .8 + (a.overall - b.overall) * .2) / 24) + bonus));
  const poisson = mean => {
    const limit = Math.exp(-mean); let product = 1, goals = -1;
    do { goals++; product *= Math.random(); } while (product > limit && goals < 8);
    return goals;
  };
  return [poisson(expected(hp,ap,.2)), poisson(expected(ap,hp,0))];
}
function pickScorer(pool) {
  const posWeights = { FWD: 10, MID: 4, DEF: 1, GK: 0.05 };
  const weights = pool.map(p => {
    const pw = posWeights[p.position] || 1;
    const ow = Math.max(0.5, (p.ovr - 40) / 10);
    return pw * ow;
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[0];
}
function generateGoalEvents(clubId, goalCount) {
  if (goalCount <= 0) return [];
  const pool = clubId === USER ? (selected().length === 11 ? selected() : squad()) : (gameState.squads[clubId] || []);
  if (!pool.length) return [];
  const events = [];
  for (let i = 0; i < goalCount; i++) {
    const scorer = pickScorer(pool);
    const minute = Math.floor(Math.random() * 90) + 1;
    events.push({ minute, playerId: scorer.id, playerName: scorer.name });
  }
  return events.sort((a, b) => a.minute - b.minute);
}
function playMatch() {
  if (gameState.seasonComplete || currentFixture().played) return;
  if (transferWindow().open) return notify('先に Start Season / Continue Season で移籍期間を終了してください。');
  if (!validFormation()) return notify('GK 1 / DEF 4 / MID 3 / FWD 3で11人を編成してください。');
  gameState.fixtures[gameState.currentMatchday - 1].forEach(m => {
    [m.homeScore, m.awayScore] = simulateScore(m.home, m.away);
    m.played = true;
    m.homeGoals = generateGoalEvents(m.home, m.homeScore);
    m.awayGoals = generateGoalEvents(m.away, m.awayScore);
    applyResult(gameState.standings, m);
    gameState.results.push({ ...m, matchday: gameState.currentMatchday, season: gameState.season });
  });
  gameState.seasonComplete = gameState.currentMatchday === LEAGUE.matchdays;
  if (gameState.currentMatchday === LEAGUE.winterAfter) gameState.transferWindowState = 'winter';
  if (gameState.seasonComplete) finishSeason();
  commit();
  if (gameState.seasonComplete) {
    switchScreen('season');
  } else {
    const ftCard = $('#match-fulltime-card');
    if (ftCard) {
      try { ftCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch {}
    }
  }
}
function nextMatchday() {
  if (!currentFixture().played || gameState.currentMatchday >= LEAGUE.matchdays || transferWindow().open) return;
  gameState.currentMatchday++;
  commit();
}
function outcome(m) {
  const diff = m.home === USER ? m.homeScore - m.awayScore : m.awayScore - m.homeScore;
  return diff > 0 ? 'WIN / 勝利' : diff < 0 ? 'LOSS / 敗戦' : 'DRAW / 引分';
}
function renderDashboard() {
  $('#season-label').textContent = 'CLUB MANAGER / SEASON ' + gameState.season;
  $('.sidebar-footer').textContent = 'Season ' + gameState.season + ' · ' + (gameState.seasonComplete ? 'Complete' : 'Matchday ' + gameState.currentMatchday);
  $('#dashboard-window').textContent = transferWindow().message;  const stats = gameState.standings.find(s => s.clubId === USER);
  $('#dashboard-position').textContent = (sortedStandings().findIndex(s => s.clubId === USER) + 1) + '位';
  $('#dashboard-points').textContent = stats.points;
  $('#dashboard-matchday').textContent = gameState.seasonComplete ? '終了' : gameState.currentMatchday + ' / ' + LEAGUE.matchdays;
  const next = gameState.fixtures.flat().find(m => !m.played && (m.home === USER || m.away === USER));
  $('#dashboard-opponent').textContent = next ? (next.home === USER ? 'Home · ' : 'Away · ') + clubById(next.home === USER ? next.away : next.home).name : 'Season complete';
  const last = gameState.results.filter(m => m.home === USER || m.away === USER).at(-1);
  if (last) {
    const hCl = clubById(last.home), aCl = clubById(last.away);
    const hGoals = (last.homeGoals || []).map(g => g.minute + "' " + g.playerName).join(', ');
    const aGoals = (last.awayGoals || []).map(g => g.minute + "' " + g.playerName).join(', ');
    const scorerSummary = (hGoals || aGoals) ? ' (' + (hGoals || '—') + ' / ' + (aGoals || '—') + ')' : '';
    $('#dashboard-last-result').textContent = '直近: ' + hCl.short + ' ' + last.homeScore + ' – ' + last.awayScore + ' ' + aCl.short + ' · ' + outcome(last) + scorerSummary;
  } else {
    $('#dashboard-last-result').textContent = 'まだ試合はありません。';
  }
  $('#dashboard-record').textContent = stats.wins + ' - ' + stats.draws + ' - ' + stats.losses;
  $('#club-funds').textContent = money(gameState.clubFunds);
  $('#squad-size').textContent = squad().length + '人';
  $('#squad-value').textContent = money(squad().reduce((sum,p) => sum + p.marketValue,0));
  $('#save-status').textContent = saveMessage || '編成・売買・試合の変更時に自動保存します。';
}
function renderPlayers() {
  $('#starting-count').textContent = 'STARTING XI ' + gameState.selectedStartingXI.length + '/11';
  document.querySelectorAll('[data-filter]').forEach(b => { b.classList.toggle('active', b.dataset.filter === ui.squadFilter); b.setAttribute('aria-pressed', b.dataset.filter === ui.squadFilter); });
  $('#player-list').innerHTML = squad().filter(p => ui.squadFilter === 'all' || p.position === ui.squadFilter).map(p => {
    const on = gameState.selectedStartingXI.includes(p.id);
    return `<article class="squad-player"><button class="player-card ${on ? 'is-starting' : ''}" data-player-id="${p.id}" aria-pressed="${on}" type="button"><span class="player-number">${on ? '✓' : p.number}</span><span><span class="player-name">${escapeHTML(p.name)}</span><span class="player-meta">${p.position} · ${p.age}歳</span></span><span class="ovr"><strong>${p.ovr}</strong><span>OVR / POT ${p.pot}</span></span></button><div class="contract-meta">${p.contractYears}年 · 週給 ${money(p.wage)} /週${p.contractYears === 1 ? ' · 今季満了' : ''}</div><div class="player-sale"><span>市場価値 <b>${money(p.marketValue)}</b></span><button class="sell-button" data-renew="${p.id}" type="button">契約更新</button><button class="sell-button" data-sell="${p.id}" type="button" ${transferWindow().open ? '' : 'disabled'}>売却</button></div></article>`;
  }).join('');
}
function renderTactics() {
  const groups = [[8,9,10],[5,6,7],[1,2,3,4],[0]];
  $('#pitch').innerHTML = groups.map(indices => '<div class="pitch-row">' + indices.map(i => {
    const p = playerById(gameState.lineup[i]);
    return `<button class="pitch-slot ${p ? '' : 'empty'} ${ui.activeSlot === i ? 'active' : ''}" data-slot-index="${i}" type="button" aria-pressed="${ui.activeSlot === i}" aria-label="${SLOTS[i]} ${p ? escapeHTML(p.name) : '空き'}"><span class="slot-position">${SLOTS[i]}</span><strong>${p ? escapeHTML(p.name) : '＋'}</strong>${p ? '<span>' + p.position + ' · ' + p.ovr + '</span>' : ''}</button>`;
  }).join('') + '</div>').join('');
  $('#bench-list').innerHTML = squad().filter(p => !gameState.selectedStartingXI.includes(p.id)).map(p =>
    `<button class="bench-player" data-bench-id="${p.id}" type="button"><span><strong>${escapeHTML(p.name)}</strong><span>${p.position} · ${p.age}歳</span></span><span class="bench-ovr">${p.ovr}</span></button>`).join('');
  const counts = POSITIONS.map(pos => pos + ' ' + selected().filter(p => p.position === pos).length).join(' / ');
  $('#formation-alert').textContent = validFormation() ? '4-3-3のポジション条件を満たしています。' : '必要: GK 1 / DEF 4 / MID 3 / FWD 3。現在: ' + counts + '。配置も確認してください。';
  $('#formation-alert').classList.toggle('valid', validFormation());
  $('#tactics-hint').textContent = ui.activeSlot === null ? 'ピッチ → 控えの順にタップで入れ替え' : '控え、または別のピッチ選手をタップ。同じ枠で取消。';
}
function renderTransfer() {
  const windowStatus = transferWindow();
  $('#transfer-funds').textContent = money(gameState.clubFunds);
  $('#transfer-window').textContent = windowStatus.message;
  document.querySelectorAll('[data-transfer-filter]').forEach(b => { b.classList.toggle('active', b.dataset.transferFilter === ui.transferFilter); b.setAttribute('aria-pressed', b.dataset.transferFilter === ui.transferFilter); });
  document.querySelectorAll('[data-market]').forEach(b => { b.classList.toggle('active', b.dataset.market === ui.market); b.setAttribute('aria-pressed', b.dataset.market === ui.market); });
  const source = ui.market === 'free'
    ? gameState.freeAgents.map(p => ({ ...p, transferFee: 0, club: { id: 'free', name: 'Free Agent' } }))
    : clubs.filter(c => c.cpu).flatMap(c => gameState.squads[c.id].map(p => ({ ...p, club: c })));
  const list = source.filter(p => (ui.transferFilter === 'all' || p.position === ui.transferFilter) &&
      (p.name + ' ' + p.club.name).toLowerCase().includes(ui.search.toLowerCase()))
    .sort((a,b) => ui.sort === 'price' ? a.transferFee - b.transferFee : ui.sort === 'price-desc' ? b.transferFee - a.transferFee : b.ovr - a.ovr);
  $('#transfer-count').textContent = list.length + '人 · ' + (ui.market === 'free' ? '移籍金0・給与契約が必要' : '所属クラブにも最低15人を残します');
  $('#transfer-list').innerHTML = list.map(p => `<article class="transfer-card" data-transfer-player="${p.id}"><div class="transfer-heading"><div><h3>${escapeHTML(p.name)}</h3><p>${p.position} · ${p.age}歳 · ${escapeHTML(p.club.name)}</p></div><strong class="rating">${p.ovr}<small>OVR</small><small>POT ${p.pot}</small></strong></div><dl><div><dt>市場価値</dt><dd>${money(p.marketValue)}</dd></div><div><dt>移籍金</dt><dd>${money(p.transferFee)}</dd></div><div><dt>契約 / 現週給</dt><dd>${p.contractYears}年 / ${money(p.wage)} /週</dd></div></dl><button data-${ui.market === 'free' ? 'sign' : 'buy'}="${p.id}" class="primary-button" type="button" ${windowStatus.open ? '' : 'disabled'}>${!windowStatus.open ? 'TRANSFER WINDOW CLOSED' : ui.market === 'free' ? 'Sign · 契約する' : gameState.squads[p.club.id].length <= 15 ? '所属クラブの最低人数' : gameState.clubFunds < p.transferFee ? '資金不足' : '購入 · ' + money(p.transferFee)}</button></article>`).join('') || '<p>該当する選手はいません。</p>';
}
function renderTable() {
  $('#standings-body').innerHTML = sortedStandings().map((s,i) => `<tr class="${s.clubId === USER ? 'user-row' : ''}"><td>${i+1}</td><td><strong>${clubById(s.clubId).short}</strong> ${clubById(s.clubId).name}</td><td>${s.played}</td><td>${s.wins}</td><td>${s.draws}</td><td>${s.losses}</td><td>${s.goalDifference}</td><td><b>${s.points}</b></td></tr>`).join('');
}
function renderMatch() {
  const m = currentFixture(), home = m.home === USER;
  const rival = clubById(home ? m.away : m.home);
  $('#matchday-label').textContent = gameState.currentMatchday;
  $('#match-status').textContent = gameState.seasonComplete ? 'COMPLETE' : m.played ? 'FULL TIME' : 'UP NEXT';
  $('#match-venue').textContent = home ? 'HOME' : 'AWAY';
  $('#match-opponent').textContent = rival.name; $('#opponent-badge').textContent = rival.short;
  $('#user-rating').textContent = 'OVR ' + teamProfile(USER).overall.toFixed(1);
  $('#opponent-rating').textContent = 'OVR ' + teamProfile(rival.id).overall.toFixed(1);
  $('#play-match').disabled = m.played || !validFormation() || transferWindow().open;
  $('#match-window').textContent = transferWindow().message;
  $('#match-summary').hidden = !gameState.seasonComplete;
  $('#play-match').textContent = m.played ? 'Match Played' : validFormation() ? 'Play Match' : 'Starting XIを編成してください';
  $('#match-message').textContent = gameState.seasonComplete ? 'シーズン終了。Tableで最終順位を確認できます。' : m.played ? 'この節は終了しました。' : '4-3-3の11人を編成して試合を開始。';
  $('#next-match').hidden = !m.played || gameState.seasonComplete || transferWindow().open;

  const previewCard = $('#match-card');
  const ftCard = $('#match-fulltime-card');

  if (!m.played) {
    if (previewCard) previewCard.hidden = false;
    if (ftCard) ftCard.hidden = true;
    $('#last-result-card').hidden = true;
  } else {
    if (previewCard) previewCard.hidden = true;
    if (ftCard) {
      ftCard.hidden = false;
      const homeClub = clubById(m.home);
      const awayClub = clubById(m.away);
      const diff = m.home === USER ? m.homeScore - m.awayScore : m.awayScore - m.homeScore;
      const outcomeText = diff > 0 ? 'WIN' : diff < 0 ? 'LOSS' : 'DRAW';
      const outcomeClass = diff > 0 ? 'is-win' : diff < 0 ? 'is-loss' : 'is-draw';
      ftCard.className = 'match-result-card ' + outcomeClass;

      const formatScorersList = (goals) => {
        if (!goals || !goals.length) return '<p class="scorers-none">得点なし</p>';
        return '<ul class="scorers-list">' + goals.map(g =>
          `<li class="scorer-item"><span class="scorer-minute">${g.minute}'</span><span class="scorer-name">${escapeHTML(g.playerName)}</span></li>`
        ).join('') + '</ul>';
      };

      const otherFixtures = gameState.fixtures[gameState.currentMatchday - 1].filter(f => f.id !== m.id);
      const otherMatchesHtml = otherFixtures.length ? `
        <details class="other-matches">
          <summary>他会場の結果（第${gameState.currentMatchday}節・4試合）▼</summary>
          <ul class="other-matches-list">
            ${otherFixtures.map(f => `<li>${clubById(f.home).short} ${f.homeScore} – ${f.awayScore} ${clubById(f.away).short}</li>`).join('')}
          </ul>
        </details>` : '';

      let actionButtons = '';
      if (gameState.seasonComplete) {
        actionButtons = `<button class="primary-button" data-screen="season" type="button">🏆 Season Complete / シーズン結果を見る</button>`;
      } else if (transferWindow().open) {
        actionButtons = `
          <button class="primary-button" data-window-continue type="button">Continue Season（冬の移籍期間終了）</button>
          <button class="secondary-button" data-screen="transfer" type="button">⇄ Winter Transfer市場を開く</button>`;
      } else {
        actionButtons = `
          <button class="primary-button" id="ft-next-match" type="button">Next Matchday (第${gameState.currentMatchday + 1}節へ) →</button>`;
      }
      actionButtons += `<button class="secondary-button compact" data-screen="table" type="button">📊 Table（順位表）を見る</button>`;

      ftCard.innerHTML = `
        <p class="eyebrow">MATCHDAY ${gameState.currentMatchday} · FULL TIME</p>
        <div class="result-badge">${outcomeText}</div>
        <div class="score-board">
          <div class="score-team">
            <div class="club-badge ${m.home === USER ? 'user-badge' : ''}">${homeClub.short}</div>
            <strong>${escapeHTML(homeClub.name)}</strong>
          </div>
          <div class="score-display">
            <span>${m.homeScore}</span>
            <span class="score-divider">-</span>
            <span>${m.awayScore}</span>
          </div>
          <div class="score-team">
            <div class="club-badge ${m.away === USER ? 'user-badge' : ''}">${awayClub.short}</div>
            <strong>${escapeHTML(awayClub.name)}</strong>
          </div>
        </div>
        <div class="scorers-section">
          <div class="scorers-heading">Scorers</div>
          <div class="scorers-grid">
            <div class="scorers-col">
              <p class="eyebrow" style="margin-bottom:4px;">${escapeHTML(homeClub.short)}</p>
              ${formatScorersList(m.homeGoals)}
            </div>
            <div class="scorers-col">
              <p class="eyebrow" style="margin-bottom:4px;">${escapeHTML(awayClub.short)}</p>
              ${formatScorersList(m.awayGoals)}
            </div>
          </div>
        </div>
        <div class="match-actions">
          ${actionButtons}
        </div>
        ${otherMatchesHtml}
      `;
    }
    $('#last-result-card').hidden = true;
  }
}
function renderAll() {
  renderDashboard(); renderPlayers(); renderTactics(); renderMatch(); renderTable(); renderTransfer(); renderSeasons();
}
function switchScreen(name) {
  const target = $('#' + name + '-screen');
  if (!target) return;
  ui.screen = name;
  document.querySelectorAll('.screen').forEach(s => { s.hidden = s !== target; });
  $('#screen-title').textContent = name[0].toUpperCase() + name.slice(1);
  document.querySelectorAll('[data-screen]').forEach(b => {
    b.classList.toggle('active', b.dataset.screen === name);
    if (b.dataset.screen === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  window.scrollTo({ top: 0, behavior: 'instant' });
}
// Delegated actions keep repeated renders from accumulating event listeners.
document.addEventListener('click', e => {
  const button = e.target.closest('button');
  if (!button) return;
  const d = button.dataset;
  if (button.id === 'ft-next-match') nextMatchday();
  else if (d.action === 'auto-pick') autoPickBestXI();
  else if (d.action === 'clear-xi') clearStartingXI();
  else if (d.screen) switchScreen(d.screen);
  else if (d.playerId) togglePlayer(d.playerId);
  else if (d.sell) requestSell(d.sell);
  else if (d.buy) requestContract(d.buy, 'buy');
  else if (d.sign) requestContract(d.sign, 'sign');
  else if (d.renew) requestContract(d.renew, 'renew');
  else if (d.market) { ui.market = d.market; renderTransfer(); }
  else if (d.windowContinue !== undefined) closeTransferWindow();
  else if (d.filter) { ui.squadFilter = d.filter; renderPlayers(); }
  else if (d.transferFilter) { ui.transferFilter = d.transferFilter; renderTransfer(); }
  else if (d.benchId) assignBenchPlayer(d.benchId);
  else if (d.slotIndex !== undefined) {
    const index = Number(d.slotIndex);
    if (ui.activeSlot === index) ui.activeSlot = null;
    else if (ui.activeSlot !== null) {
      [gameState.lineup[ui.activeSlot], gameState.lineup[index]] = [gameState.lineup[index], gameState.lineup[ui.activeSlot]];
      ui.activeSlot = null; commit();
    } else ui.activeSlot = index;
    renderTactics();
  }
});
$('#transfer-search').addEventListener('input', e => { ui.search = e.target.value; renderTransfer(); });
$('#development-sort').addEventListener('change', e => { ui.developmentSort = e.target.value; renderDevelopment(); });
$('#development-season').addEventListener('change', e => { ui.reportSeason = Number(e.target.value); renderDevelopment(); });
$('#start-next-season').addEventListener('click', () => startNextSeason());
$('#transfer-sort').addEventListener('change', e => { ui.sort = e.target.value; renderTransfer(); });
$('#play-match').addEventListener('click', playMatch);
$('#next-match').addEventListener('click', nextMatchday);
$('#reset-save').addEventListener('click', () => askConfirmation('New Game / Reset Save', 'リーグ進行、選手売買、編成をすべて初期化します。資金は€100,000,000に戻ります。この操作は元に戻せません。', resetGame));
$('#confirm-cancel').addEventListener('click', () => { confirmation = null; $('#confirm-dialog').close(); });
$('#confirm-dialog').addEventListener('cancel', () => { confirmation = null; });
$('#confirm-accept').addEventListener('click', () => {
  const action = confirmation; confirmation = null; $('#confirm-dialog').close(); if (action) action();
});
if (gameState.seasonComplete && !gameState.seasonHistory.some(h => h.season === gameState.season)) finishSeason();
renderAll();
if (saveMessage === 'セーブを復元しました。') saveGame();
if (gameState.seasonComplete) switchScreen('season');
