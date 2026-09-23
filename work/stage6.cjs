const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const storage = new Map();
function boot() {
  const elements = new Map();
  const el = key => {
    if (!elements.has(key)) elements.set(key, {innerHTML:'',textContent:'',value:'',dataset:{},hidden:false,
      classList:{toggle(){},add(){},remove(){}},setAttribute(){},removeAttribute(){},addEventListener(){},
      showModal(){this.open=true;},close(){this.open=false;},reset(){},insertAdjacentHTML(where,html){this.innerHTML+=html;}});
    return elements.get(key);
  };
  const context = vm.createContext({assert,console,setTimeout:()=>0,clearTimeout(){},document:{querySelector:el,querySelectorAll:()=>[],addEventListener(){}},window:{scrollTo(){}},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
  vm.runInContext(fs.readFileSync('script.js','utf8'),context);
  return code=>vm.runInContext(code,context);
}
let run=boot();
run(`
assert.equal(gameState,null);
assert.equal($('#setup-screen').hidden,false);
assert.equal(startCareerWithProfile('Test City FC','Manchester','TCF'),true);
assert.equal(gameState.clubProfile.shortName,'TCF');
assert.equal(clubById(USER).short,'TCF');
assert.equal(gameState.clubProfile.country,'England');
assert.equal(gameState.clubFunds,100000000);
assert.equal(maintenanceCost(),250000);
assert.equal(gameState.fixtures.length,18);
const pairs=new Set();
gameState.fixtures.forEach(round=>{
 assert.equal(round.length,5);
 assert.equal(new Set(round.flatMap(m=>[m.home,m.away])).size,10);
 round.forEach(m=>pairs.add(m.home+':'+m.away));
});
assert.equal(pairs.size,90);
assert.ok(Object.values(gameState.squads).flat().every(p=>POSITIONS.includes(p.position)));
autoPickBestXI(); assert.equal(validFormation(),true);
assert.equal(new Set(gameState.lineup).size,11);
assert.deepEqual(gameState.lineup.map(id=>playerById(id).position),SLOTS);
const scarce = squad().filter(p=>!['DM','CM'].includes(p.position));
scarce.push(makePlayer('scarce-cm','31','Only CM',22,'CM',80));
scarce.push(makePlayer('scarce-am','32','Second AM',22,'AM',75));
const scarceXI=pickLineup(scarce);
assert.equal(scarceXI.filter(Boolean).length,11);
assert.equal(scarce.find(p=>p.id===scarceXI[5]).position,'CM');
const selectedId=gameState.lineup[0]; togglePlayer(selectedId); assert.equal(selected().length,10); togglePlayer(selectedId);
assert.equal(validFormation(),true);
const bench=squad().find(p=>p.position==='GK' && !gameState.lineup.includes(p.id));
ui.activeSlot=0; assignBenchPlayer(bench.id); assert.equal(gameState.lineup[0],bench.id); autoPickBestXI();
const purchase=gameState.squads.redhaven[0], funds=gameState.clubFunds;
buyPlayer(purchase.id); assert.equal(gameState.clubFunds,funds-purchase.transferFee);
assert.ok(playerById(purchase.id)); assert.equal(gameState.financeLedger.at(-1).type,'transfer-out');
buyPlayer(purchase.id); assert.equal(gameState.clubFunds,funds-purchase.transferFee);
togglePlayer(gameState.selectedStartingXI[0]); togglePlayer(purchase.id);
sellPlayer(purchase.id); assert.ok(!playerById(purchase.id)); assert.ok(!gameState.lineup.includes(purchase.id));
assert.equal(gameState.financeLedger.at(-1).type,'transfer-in');
autoPickBestXI();
const ovr=selected()[0].ovr; selected()[0].fatigue=100; assert.equal(effectiveOVR(selected()[0]),ovr-4); assert.equal(selected()[0].ovr,ovr);
squad().forEach(p=>p.fatigue=0);
playMatch(); assert.equal(gameState.results.length,0);
closeTransferWindow(); playMatch(); assert.equal(gameState.results.length,5);
assert.equal(gameState.flowState,'weekly-action');
assert.ok(selected().every(p=>p.fatigue>=20 && p.fatigue<=30));
assert.ok(currentFixture().attendance<=currentFixture().stadiumCapacity);
assert.equal(currentFixture().occupancy,currentFixture().attendance/currentFixture().stadiumCapacity);
assert.equal(currentFixture().settlement.gate,currentFixture().attendance*30);
assert.equal(currentFixture().settlement.wage,weeklyWages());
assert.equal(currentFixture().settlement.net,currentFixture().settlement.gate-weeklyWages()-maintenanceCost());
const after=gameState.clubFunds, count=gameState.financeLedger.length;
settleMatchday(); playMatch(); assert.equal(gameState.clubFunds,after); assert.equal(gameState.financeLedger.length,count);
nextMatchday(); assert.equal(gameState.currentMatchday,1);
chooseWeeklyAction('training'); assert.equal(gameState.trainingBonus,1);
const fatigue=averageFatigue(); chooseWeeklyAction('rest'); assert.equal(averageFatigue(),fatigue);
assert.equal(gameState.matchdayActions.length,1);
saveGame();
`);
const snapshot=storage.values().next().value;
run=boot();
run(`
assert.ok(gameState); assert.equal(gameState.clubProfile.shortName,'TCF');
assert.equal(gameState.results.length,5); assert.equal(gameState.trainingBonus,1);
assert.equal(weeklyAction().action,'training'); assert.equal(gameState.financeSettlements.length,1);
nextMatchday(); assert.equal(gameState.currentMatchday,2);
const blocked=gameState.squads.redhaven[0].id; buyPlayer(blocked); assert.ok(!playerById(blocked));
playMatch(); assert.equal(gameState.trainingBonus,0); chooseWeeklyAction('rest');
while(gameState.currentMatchday<9) { nextMatchday(); playMatch(); if(gameState.currentMatchday<9) chooseWeeklyAction('rest'); }
assert.equal(transferWindow().open,false);
nextMatchday(); assert.equal(gameState.currentMatchday,9);
chooseWeeklyAction('rest'); assert.equal(transferWindow().phase,'winter');
closeTransferWindow(); assert.equal(gameState.currentMatchday,10); assert.equal(transferWindow().open,false);
// Deterministic contract case and guaranteed retirement.
squad().forEach(p=>{p.contractYears=1;p.age=24;});
const retireId=squad().at(-1).id; squad().at(-1).age=42;
for(let day=10;day<=18;day++){if(day>10)nextMatchday(); autoPickBestXI(); playMatch(); chooseWeeklyAction('rest');}
assert.equal(gameState.results.length,90); assert.equal(gameState.seasonHistory.length,1);
assert.equal(gameState.financeSettlements.length,18);
assert.equal(gameState.financeLedger.filter(e=>e.type==='wage').length,18);
assert.equal(gameState.financeLedger.filter(e=>e.type==='maintenance').length,18);
for(const m of gameState.results) {
 assert.equal(m.homeGoals.length,m.homeScore); assert.equal(m.awayGoals.length,m.awayScore);
 assert.ok([...m.homeGoals,...m.awayGoals].every(g=>g.minute>=1 && g.minute<=90 && g.playerName));
 if(m.home===USER || m.away===USER) assert.equal(m.settlement.gate,m.home===USER?m.attendance*30:0);
}
assert.equal(gameState.clubFunds,100000000+gameState.financeLedger.reduce((n,e)=>n+e.amount,0));
assert.ok(gameState.standings.every(s=>s.played===18));
assert.equal(gameState.standings.reduce((n,s)=>n+s.goalsFor,0),gameState.standings.reduce((n,s)=>n+s.goalsAgainst,0));
assert.ok(gameState.pendingContractDecisions.length>0);
assert.ok(!playerById(retireId)); assert.ok(gameState.retirementHistory.some(p=>p.id===retireId));
const pending=gameState.pendingContractDecisions[0];
assert.equal(playerById(pending).contractYears,0);
assert.ok(!gameState.freeAgents.some(p=>p.id===pending));
startNextSeason(); assert.equal(gameState.season,1);
saveGame();
`);
run=boot();
run(`
assert.ok(gameState && gameState.pendingContractDecisions.length);
const release=gameState.pendingContractDecisions[0]; releaseExpired(release);
assert.ok(gameState.freeAgents.some(p=>p.id===release)); assert.ok(!gameState.lineup.includes(release));
for(const id of [...gameState.pendingContractDecisions]) renewContract(id,3);
const age=squad()[0].age, funds=gameState.clubFunds;
startNextSeason(()=>.8); assert.equal(gameState.season,2); assert.equal(squad()[0].age,age+1); assert.equal(gameState.clubFunds,funds);
assert.equal(gameState.currentMatchday,1); assert.equal(transferWindow().phase,'summer');
assert.equal(gameState.playerDevelopmentHistory[0].players.length,20);
assert.ok(gameState.playerDevelopmentHistory[0].players.every(p=>p.newOVR-p.previousOVR===p.delta));
const report=gameState.playerDevelopmentHistory[0];
assert.ok(developmentRows(report,'gain').every((p,i,a)=>!i||a[i-1].delta>=p.delta));
assert.ok(developmentRows(report,'decline').every((p,i,a)=>!i||a[i-1].delta<=p.delta));
const youth=makePlayer('test-young','1','Young',18,'CF',70); youth.pot=72; evolvePlayer(youth,()=>.99); assert.equal(youth.ovr,72);
const old=makePlayer('test-old','2','Old',35,'CB',80); evolvePlayer(old,()=>.99); assert.equal(old.ovr,77);
const free=gameState.freeAgents.find(p=>p.contractYears===0); signFreeAgent(free.id,4); assert.equal(playerById(free.id).contractYears,4);
// Another complete season with unchanged history, growing finance history and fresh fixtures.
autoPickBestXI(); closeTransferWindow();
for(let day=1;day<=18;day++){
 if(day>1){if(transferWindow().phase==='winter')closeTransferWindow();else nextMatchday();}
 autoPickBestXI(); playMatch(); chooseWeeklyAction('rest');
}
assert.equal(gameState.seasonHistory.length,2); assert.equal(gameState.financeSettlements.length,36);
for(const id of [...gameState.pendingContractDecisions]) renewContract(id,3);
startNextSeason(()=>.5); assert.equal(gameState.season,3);
assert.equal(gameState.playerDevelopmentHistory.length,2);
ui.transferFilter='CB'; renderTransfer(); assert.ok(!$('#transfer-list').innerHTML.includes('GK ·'));
gameState.clubFunds=0; const id=gameState.squads.redhaven[0].id; buyPlayer(id); assert.ok(!playerById(id));
gameState.clubFunds=100000000;
while(squad().length>15) sellPlayer(squad().at(-1).id);
assert.equal(sellPlayer(squad()[0].id),false);
const legacy=JSON.parse(JSON.stringify(newGame()));
legacy.version=5; delete legacy.clubProfile; delete legacy.financeLedger; delete legacy.financeSettlements; delete legacy.matchdayActions; delete legacy.pendingContractDecisions;
Object.values(legacy.squads).flat().forEach(p=>{p.position=positionGroup(p.position);delete p.fatigue;});
const migrated=validateSave(migrateSave(legacy));
assert.equal(migrated.clubProfile.name,'Northbridge FC');
assert.ok(migrated.squads[USER].every(p=>POSITIONS.includes(p.position)));
assert.equal(migrated.clubProfile.stadiumCapacity,20000);
assert.equal(migrated.clubProfile.shortName,'NB');
const legacyPlayed=JSON.parse(JSON.stringify(gameState));
legacyPlayed.version=6; delete legacyPlayed.financeLedger; delete legacyPlayed.financeSettlements;
const legacyFunds=legacyPlayed.clubFunds;
assert.equal(migrateSave(legacyPlayed).clubFunds,legacyFunds);
resetGame(); assert.equal(gameState,null); assert.equal($('#setup-screen').hidden,false);
`);
assert.equal(storage.size,0);
console.log('Stage 6: setup, migration, positions, transfers, fatigue, weekly flow, finances, reload, 18 rounds, contracts, development, reset passed.');
