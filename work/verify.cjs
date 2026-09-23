const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('script.js', 'utf8');
const storage = new Map();
function boot() {
  const elements = new Map();
  const element = key => {
    if (!elements.has(key)) elements.set(key, { textContent: '', innerHTML: '', hidden: false, dataset: {},
      value: '', classList: { toggle() {} }, setAttribute() {}, removeAttribute() {},
      addEventListener() {}, showModal() { this.open = true; }, close() { this.open = false; } });
    return elements.get(key);
  };
  const context = vm.createContext({ assert, console, Intl, setTimeout: () => 1, clearTimeout() {},
    document: { querySelector: element, querySelectorAll: () => [], addEventListener() {} },
    window: { scrollTo() {} },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key,value) => storage.set(key,value) } });
  vm.runInContext(source, context);
  return { run: code => vm.runInContext(code, context), elements };
}
let app = boot();
app.run(`
assert.equal(gameState.clubFunds, 100000000);
assert.equal(squad().length, 20);
assert.equal($('#club-funds').textContent, '€100,000,000');
assert.equal(clubs.filter(c => c.cpu).length, 9);
assert.ok(clubs.every(c => gameState.squads[c.id].length === 20));
assert.ok(marketValue(21,'FWD',80) > marketValue(31,'FWD',80));
assert.ok(marketValue(21,'FWD',80) > marketValue(21,'FWD',60));
const pairs = new Set();
assert.equal(gameState.fixtures.length,18);
gameState.fixtures.forEach(round => {
  assert.equal(round.length,5);
  assert.equal(new Set(round.flatMap(m => [m.home,m.away])).size,10);
  round.forEach(m => pairs.add(m.home + ':' + m.away));
});
assert.equal(pairs.size,90);
for (const pair of pairs) assert.ok(pairs.has(pair.split(':').reverse().join(':')));
const purchase = gameState.squads.redhaven[0];
const fee = purchase.transferFee;
buyPlayer(purchase.id);
assert.equal(gameState.clubFunds,100000000-fee);
assert.equal(squad().length,21);
assert.equal(gameState.squads.redhaven.length,19);
assert.ok(playerById(purchase.id));
buyPlayer(purchase.id);
assert.equal(gameState.clubFunds,100000000-fee);
const funds = gameState.clubFunds;
gameState.clubFunds = 0;
const blocked = gameState.squads.redhaven[0].id;
buyPlayer(blocked);
assert.equal(squad().length,21);
assert.equal(gameState.clubFunds,0);
assert.equal($('#notice').textContent,'資金不足です。');
gameState.clubFunds = funds;
togglePlayer(purchase.id);
assert.ok(gameState.selectedStartingXI.includes(purchase.id));
requestSell(purchase.id);
assert.ok($('#confirm-dialog').open);
assert.ok(playerById(purchase.id)); // confirmation has not sold yet
confirmation(); confirmation = null;
assert.equal(gameState.clubFunds,funds+purchase.marketValue);
assert.ok(!playerById(purchase.id));
assert.ok(!gameState.selectedStartingXI.includes(purchase.id));
assert.ok(!gameState.lineup.includes(purchase.id));
while (squad().length > 15) sellPlayer(squad().at(-1).id);
const fundsAt15 = gameState.clubFunds;
assert.equal(sellPlayer(squad()[0].id),false);
assert.equal(squad().length,15);
assert.equal(gameState.clubFunds,fundsAt15);
resetGame();
assert.equal(gameState.clubFunds,100000000);
assert.equal(squad().length,20);
assert.equal(gameState.results.length,0);
assert.equal(gameState.transfers.length,0);
const xi = ['01','02','03','04','05','06','08','10','07','09','11'].map(n => 'nb-'+n);
xi.forEach(togglePlayer);
assert.ok(validFormation());
const oldOVR = teamProfile(USER).overall;
ui.activeSlot = 0;
assignBenchPlayer('nb-13');
assert.ok(validFormation());
assert.equal(gameState.selectedStartingXI.length,11);
assert.ok(teamProfile(USER).overall < oldOVR);
togglePlayer('nb-19');
assert.equal(gameState.selectedStartingXI.length,11);
const day = gameState.currentMatchday;
nextMatchday();
assert.equal(gameState.currentMatchday,day); // cannot skip unplayed round
closeTransferWindow();
playMatch();
assert.equal(gameState.results.length,5);
assert.ok(gameState.standings.every(s => s.played === 1));
const after = JSON.stringify(gameState);
playMatch();
assert.equal(JSON.stringify(gameState),after);
nextMatchday();
const bought = gameState.squads.oakvale[1];
buyPlayer(bought.id);
saveGame();
`);
const beforeReload = app.run('JSON.stringify(gameState)');
app = boot();
assert.equal(app.run('JSON.stringify(gameState)'), beforeReload);
app.run(`
assert.equal(gameState.currentMatchday,2);
assert.equal(squad().length,20); // purchase outside window was rejected
assert.equal(gameState.transfers.length,0);
assert.ok(validFormation());
for (let day=2;day<=18;day++) {
  playMatch();
  assert.equal(gameState.results.length,day*5);
  assert.ok(gameState.standings.every(s => s.played === day));
  if(day===LEAGUE.winterAfter) closeTransferWindow();
  else if(day<18) nextMatchday();
}
assert.ok(gameState.seasonComplete);
assert.equal(gameState.results.length,90);
const totals = gameState.standings.reduce((a,s) => ({ gf:a.gf+s.goalsFor, ga:a.ga+s.goalsAgainst }),{gf:0,ga:0});
assert.equal(totals.gf,totals.ga);
gameState.standings.forEach(s => {
  const games=gameState.fixtures.flat().filter(m=>m.home===s.clubId||m.away===s.clubId);
  const gf=games.reduce((n,m)=>n+(m.home===s.clubId?m.homeScore:m.awayScore),0);
  const ga=games.reduce((n,m)=>n+(m.home===s.clubId?m.awayScore:m.homeScore),0);
  assert.equal(s.goalsFor,gf); assert.equal(s.goalsAgainst,ga);
  assert.equal(s.points,s.wins*3+s.draws);
  assert.equal(s.wins+s.draws+s.losses,18);
});
const final = JSON.stringify(gameState);
playMatch(); nextMatchday();
assert.equal(JSON.stringify(gameState),final);
saveGame();
`);
const completed = app.run('JSON.stringify(gameState)');
app = boot();
assert.equal(app.run('JSON.stringify(gameState)'), completed);
app.run('resetGame()');
app = boot();
app.run(`
assert.equal(gameState.clubFunds,100000000);
assert.equal(squad().length,20);
assert.equal(gameState.currentMatchday,1);
assert.equal(gameState.results.length,0);
assert.equal(gameState.selectedStartingXI.length,0);
`);
console.log('PASS: funds, valuation, buy/sell, duplicate/insufficient funds, XI removal, 15-player floor, confirmation, save/reload/reset, fixtures, tactics, OVR, all 90 results and table consistency.');

// Stage 5: real game functions, reproducible lifecycle branches and save migration.
app.run(`
resetGame();
assert.equal(gameState.season,1);
assert.equal(transferWindow().phase,'summer');
assert.ok(gameState.freeAgents.length >= 16);
assert.ok(Object.values(gameState.squads).flat().every(p => p.pot >= p.ovr && p.contractYears >= 1 && p.wage > 0));
const free = gameState.freeAgents[0];
const cash = gameState.clubFunds;
requestContract(free.id,'sign');
assert.ok($('#contract-options').hidden === false);
$('#contract-years').value = '5';
confirmation(); confirmation = null;
assert.ok(playerById(free.id));
assert.equal(playerById(free.id).contractYears,5);
assert.equal(gameState.clubFunds,cash);
signFreeAgent(free.id,3); // idempotent
assert.equal(squad().filter(p=>p.id===free.id).length,1);
const young = makePlayer('test-young','91','Young Prospect',19,'MID',60);
young.pot=85;
evolvePlayer(young,()=>.99);
assert.equal(young.age,20); assert.equal(young.previousOVR,60); assert.equal(young.ovr,63);
assert.equal(young.marketValue,marketValue(20,'MID',63,85));
const capped = {...young,age:18,ovr:84,pot:85};
evolvePlayer(capped,()=>.99); assert.equal(capped.ovr,85);
const old = makePlayer('test-old','92','Senior',34,'DEF',80);
const oldValue = old.marketValue;
evolvePlayer(old,()=>.99);
assert.equal(old.ovr,77); assert.ok(old.marketValue < oldValue);
assert.equal(retirementChance(33),0);
assert.ok(retirementChance(38)>retirementChance(34));
assert.equal(retirementChance(42),1);
for (let age=16;age<=40;age++) for (let i=0;i<100;i++) {
  const p=makePlayer('check-'+i,'1','Check',age,'MID',72);
  const previous=p.ovr; evolvePlayer(p,()=>i/100);
  assert.ok(Math.abs(p.ovr-previous)<=3); assert.ok(p.ovr<=p.pot);
}
const xi2=['01','02','03','04','05','06','08','10','07','09','11'].map(n=>'nb-'+n);
xi2.forEach(togglePlayer);
renewContract('nb-01',5);
assert.equal(playerById('nb-01').contractYears,5);
assert.ok(validFormation());
const summerState=JSON.stringify(gameState);
playMatch(); assert.equal(JSON.stringify(gameState),summerState); // explicit start required
closeTransferWindow();
const closedBefore=JSON.stringify(gameState);
buyPlayer(gameState.squads.redhaven[0].id);
sellPlayer('nb-01');
signFreeAgent(gameState.freeAgents[0].id,3);
assert.equal(JSON.stringify(gameState),closedBefore);
for(let day=1;day<=9;day++) { playMatch(); if(day<9) nextMatchday(); }
assert.equal(gameState.currentMatchday,9);
assert.equal(transferWindow().phase,'winter');
const winterState=JSON.stringify(gameState);
nextMatchday(); playMatch(); assert.equal(JSON.stringify(gameState),winterState);
const winterPlayer=gameState.squads.oakvale[0];
buyPlayer(winterPlayer.id,2);
assert.ok(playerById(winterPlayer.id));
saveGame();
`);
const winterSave = app.run('JSON.stringify(gameState)');
app = boot();
assert.equal(app.run('JSON.stringify(gameState)'), winterSave);
app.run(`
assert.equal(transferWindow().phase,'winter');
closeTransferWindow();
assert.equal(gameState.currentMatchday,10);
assert.equal(transferWindow().open,false);
// Force one expiration and one retirement to verify all removal paths.
playerById('nb-02').contractYears=1;
playerById('nb-04').age=42;
const contractBefore=playerById('nb-01').contractYears;
const endRoster=squad().map(p=>({...p}));
for(let day=10;day<=18;day++) { playMatch(); if(day<18) nextMatchday(); }
assert.ok(gameState.seasonComplete);
assert.equal(gameState.seasonHistory.length,1);
assert.equal(ui.screen,'season');
assert.equal(playerById('nb-01').contractYears,contractBefore-1);
assert.ok(gameState.freeAgents.some(p=>p.id==='nb-02' && p.contractYears===0));
assert.ok(!Object.values(gameState.squads).flat().some(p=>p.id==='nb-04'));
assert.ok(!gameState.freeAgents.some(p=>p.id==='nb-04'));
assert.ok(gameState.retirementHistory.some(p=>p.id==='nb-04'));
assert.ok(!gameState.selectedStartingXI.includes('nb-02'));
assert.ok(!gameState.lineup.includes('nb-04'));
const settled=JSON.stringify(gameState);
finishSeason(); assert.equal(JSON.stringify(gameState),settled);
const activeBefore=new Map([...Object.values(gameState.squads).flat(),...gameState.freeAgents].map(p=>[p.id,{...p}]));
const oldCash=gameState.clubFunds;
const transfersCount=gameState.transfers.length;
const oldSchedule=JSON.stringify(gameState.fixtures.map(r=>r.map(m=>[m.home,m.away])));
startNextSeason(()=>.75);
assert.equal(gameState.season,2);
assert.equal(gameState.currentMatchday,1);
assert.equal(gameState.clubFunds,oldCash);
assert.ok(gameState.transfers.length>=transfersCount);
assert.equal(gameState.results.length,0);
assert.ok(gameState.standings.every(s=>s.played===0 && s.points===0));
assert.equal(transferWindow().phase,'summer');
assert.notEqual(JSON.stringify(gameState.fixtures.map(r=>r.map(m=>[m.home,m.away]))),oldSchedule);
assert.ok(clubs.filter(c=>c.cpu).every(c=>gameState.squads[c.id].length>=20));
for(const p of [...Object.values(gameState.squads).flat(),...gameState.freeAgents]) {
  const old=activeBefore.get(p.id);
  if(old) {assert.equal(p.age,old.age+1); assert.equal(p.previousOVR,old.ovr); assert.equal(p.marketValue,marketValue(p.age,p.position,p.ovr,p.pot));}
}
const report=gameState.playerDevelopmentHistory[0];
assert.equal(report.players.length,endRoster.length);
assert.deepEqual(report.players.map(p=>p.id).sort(),endRoster.map(p=>p.id).sort());
report.players.forEach(p=>{
  assert.equal(p.previousOVR,endRoster.find(o=>o.id===p.id).ovr);
  assert.equal(p.delta,p.newOVR-p.previousOVR);
});
assert.equal(report.players.find(p=>p.id==='nb-04').status,'引退（更新対象外）');
for(const sort of ['gain','decline','ovr','age']) {
  const rows=developmentRows(report,sort);
  for(let i=1;i<rows.length;i++) {
    assert.ok(sort==='gain'?rows[i-1].delta>=rows[i].delta:
      sort==='decline'?rows[i-1].delta<=rows[i].delta:
      sort==='ovr'?rows[i-1].newOVR>=rows[i].newOVR:rows[i-1].age<=rows[i].age);
  }
}
const startOnce=JSON.stringify(gameState);
startNextSeason(); assert.equal(JSON.stringify(gameState),startOnce);
saveGame();
`);
const season2 = app.run('JSON.stringify(gameState)');
app = boot();
assert.equal(app.run('JSON.stringify(gameState)'), season2);
app.run(`
// Complete three more seasons, replenishing user shortages with legal free signings.
for(let season=2;season<=4;season++) {
  ensureFreeAgentPool(gameState);
  for(const pos of POSITIONS) {
    const target=SLOTS.filter(p=>p===pos).length;
    while(squad().filter(p=>p.position===pos).length<target) {
      ensureFreeAgentPool(gameState); signFreeAgent(gameState.freeAgents.find(p=>p.position===pos).id,3);
    }
  }
  while(squad().length<15) { ensureFreeAgentPool(gameState); signFreeAgent(gameState.freeAgents[0].id,3); }
  gameState.selectedStartingXI=[];
  for(const pos of POSITIONS) gameState.selectedStartingXI.push(...squad().filter(p=>p.position===pos).slice(0,SLOTS.filter(p=>p===pos).length).map(p=>p.id));
  syncLineup(); closeTransferWindow();
  for(let day=1;day<=18;day++) {
    playMatch();
    if(day===9) closeTransferWindow(); else if(day<18) nextMatchday();
  }
  assert.equal(gameState.seasonHistory.length,season);
  assert.equal(gameState.results.length,90);
  startNextSeason();
  assert.equal(gameState.season,season+1);
  validateSave(JSON.parse(JSON.stringify(gameState)));
}
saveGame();
`);
const season5 = app.run('JSON.stringify(gameState)');
app = boot();
assert.equal(app.run('JSON.stringify(gameState)'), season5);
// Old save: no lifecycle fields. Preserve money, roster, XI and results.
const legacy = JSON.parse(app.run('JSON.stringify(newGame())'));
legacy.version = 4;
legacy.clubFunds = 42000000;
for (const key of ['season','seasonHistory','playerDevelopmentHistory','freeAgents','transferWindowState','nextPlayerId','endOfSeasonRoster','retirementHistory']) delete legacy[key];
for (const p of Object.values(legacy.squads).flat()) for (const key of ['pot','previousOVR','contractYears','wage']) delete p[key];
storage.set('northbridge.club-manager.v4', JSON.stringify(legacy));
app = boot();
app.run(`
assert.equal(gameState.version,5);
assert.equal(gameState.clubFunds,42000000);
assert.equal(gameState.season,1);
assert.equal(squad().length,20);
assert.ok(squad().every(p=>p.pot>=p.ovr && p.contractYears>=1 && p.wage>0));
assert.equal(transferWindow().phase,'summer');
`);
console.log('PASS stage 5: summer/winter boundaries, guarded transfers, contracts/signings, expiry/retirement, age and POT bounds, full development report and all sorts, migration, reload, and seasons 1–5.');
