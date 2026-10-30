import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const policy = fs.readFileSync('app-policy.js','utf8');
const source = fs.readFileSync('app.js','utf8').replace('  boot();',`  modeReports=E.modeReports();
  window.__test={addBonusPoint,buyBonusYear,newCardForRepeat,finishPhysical,
    finishVirtualTurn,lockPlacement,migrateMatch,handleBack,saveMatch,startMatch,resumeMatch,
    startSteal,selectStealTeam,selectStealSlot,commitSteal,revealSteals,judgePhysicalSteal,
    revealPhysical,skippedScreen,virtualTimeline,clearRoundState,
    getState:()=>({cfg,screen,match,current,pendingSlot,placementResult}),
    setState:next=>{if(next.cfg)cfg={...DEFAULT_CFG,...next.cfg};if('match' in next)match=next.match;
      if('current' in next)current=next.current;if('screen' in next)screen=next.screen;
      if('pendingSlot' in next)pendingSlot=next.pendingSlot;if('placementResult' in next)placementResult=next.placementResult;}};`);

const song=(title,year,artist='Example Artist')=>({title,artist,year,canonicalKey:`${title.toLowerCase()}|${artist.toLowerCase()}`});
const catalogue=[song('Alpha',2000),song('Bravo',2001),song('Charlie',2002),song('Delta',2003)];
const current={cardId:1,year:2000,song:catalogue[0],provider:'youtube',resolved:{videoId:'alpha'}};
const node={innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){}},querySelector(){return null},querySelectorAll(){return[]}};

async function make(saved={}){
  const store=new Map(), cfg={playMode:'virtual',teams:2,victory:'10',mode:'greatest',minYear:2000,maxYear:2003};
  const base={active:true,mode:'greatest',phase:'reveal',round:4,turn:0,settings:cfg,current,placementResult:{correct:true,slot:1},pendingSlot:null,
    teams:[{name:'Team 1',score:2,correct:2,wrong:0,bonusPoints:0,bonusYears:0,timeline:[1990,2000]},{name:'Team 2',score:1,correct:1,wrong:0,bonusPoints:0,bonusYears:0,timeline:[1991]}],
    used:[],history:[],virtualDeck:[1,2,3,4],virtualPos:0,bonusAwarded:false,lastBonusYear:null,...saved};
  const E={
    MODES:{greatest:{name:'Greatest Hits',status:'beta',selectable:true,yearBasis:'release',repeatPolicy:'unique'}},
    init:async()=>{}, modeReports:()=>({greatest:{id:'greatest',status:'beta',selectable:true,repeatPolicy:'unique',years:[2000,2001,2002,2003],yearSongKeys:{2000:['alpha|example artist'],2001:['bravo|example artist'],2002:['charlie|example artist'],2003:['delta|example artist']}}}),
    cardYear:id=>({1:2000,2:2001,3:2002,4:2003}[id]||null), songUseKey:s=>s.canonicalKey, songKey:s=>s.canonicalKey,
    chooseSong:async year=>catalogue.find(s=>s.year===year), resolveSong:async s=>({videoId:s.title}), getProvider:()=> 'youtube', isSpotifyConnected:()=>false, getSpotifyDevice:()=>'', spotifyDevices:async()=>[],
    pauseYouTube(){},destroyYouTube(){},replayYouTube:()=>true,baseCardYear:id=>E.cardYear(id),cardYearReference:id=>({year:E.cardYear(id)}),setCardYearReference(){},
    AppError:class AppError extends Error{constructor(code,msg){super(msg);this.code=code}}
  };
  const ctx=vm.createContext({window:{GSYEngine:E,addEventListener(){},scrollTo(){}},document:{getElementById:id=>['app','toast'].includes(id)?node:null,activeElement:null,querySelectorAll:()=>[],addEventListener(){}},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},navigator:{},requestAnimationFrame(fn){fn?.()},setTimeout(fn){fn?.();return 1},clearTimeout(){},setInterval(){return 1},clearInterval(){},URL,console,prompt(){return null},history:{state:null,replaceState(){},pushState(){},back(){}}});
  vm.runInContext(policy,ctx); vm.runInContext(source,ctx);
  const R=ctx.window.__test; R.setState({cfg,match:JSON.parse(JSON.stringify(base)),current:base.current,screen:'reveal',pendingSlot:null,placementResult:base.placementResult});
  return {R,E,store,node,state:()=>R.getState()};
}

// Honour is stored on the active team, adds no card score, and survives reload.
{const h=await make();h.R.addBonusPoint();h.R.addBonusPoint();let m=h.state().match;assert.equal(m.bonusAwarded,true);assert.equal(m.teams[0].bonusPoints,1);assert.equal(m.teams[0].score,2);const r=await make(JSON.parse(JSON.stringify(m)));r.R.migrateMatch();r.R.addBonusPoint();assert.equal(r.state().match.teams[0].bonusPoints,1)}

// Five bonus points buy one independent year card: score/timeline/used change,
// turn and current reveal remain intact, and pending placement is cleared.
{const h=await make({teams:[{name:'Team 1',score:2,bonusPoints:5,bonusYears:0,timeline:[1990,2000]},{name:'Team 2',score:1,bonusPoints:0,bonusYears:0,timeline:[1991]}],pendingSlot:1});const before=h.state().match;const turn=before.turn,round=before.round,currentJSON=JSON.stringify(before.current);await h.R.buyBonusYear();const m=h.state().match;assert.equal(m.teams[0].bonusPoints,0);assert.equal(m.teams[0].bonusYears,1);assert.equal(m.teams[0].score,3);assert.equal(m.turn,turn);assert.equal(m.round,round);assert.equal(JSON.stringify(m.current),currentJSON);assert.equal(m.lastBonusYear.team,0);assert.ok([2001,2002,2003].includes(m.lastBonusYear.year));assert.equal(m.lastBonusYear.title,catalogue.find(s=>s.year===m.lastBonusYear.year).title);assert.equal(m.pendingSlot,null);assert.ok(m.teams[0].timeline.includes(m.lastBonusYear.year));assert.ok(m.used.includes(catalogue.find(s=>s.year===m.lastBonusYear.year).canonicalKey));assert.ok(m.history.some(x=>x.outcome==='bonus-year'));
 const no=await make({teams:[{name:'Team 1',score:2,bonusPoints:5,bonusYears:0,timeline:[1990,2000]},{name:'Team 2',score:1,bonusPoints:0,bonusYears:0,timeline:[1991]}],used:catalogue.map(s=>s.canonicalKey)});await no.R.buyBonusYear();assert.equal(no.state().match.teams[0].bonusPoints,5)}

{const h=await make({teams:[{name:'Team 1',score:2,bonusPoints:4,timeline:[1990]},{name:'Team 2',score:1,bonusPoints:0,timeline:[1991]}]});const before=JSON.stringify(h.state().match);await h.R.buyBonusYear();assert.equal(JSON.stringify(h.state().match),before);const skip=await make({teams:[{name:'Team 1',score:2,bonusPoints:0,timeline:[1990]},{name:'Team 2',score:1,bonusPoints:0,timeline:[1991]}]});const skipBefore=JSON.stringify(skip.state().match);skip.R.setState({screen:'youtube'});skip.R.newCardForRepeat();assert.equal(JSON.stringify(skip.state().match),skipBefore)}

{const h=await make({teams:[{name:'Team 1',score:2,bonusPoints:5,timeline:[1990]},{name:'Team 2',score:1,bonusPoints:0,timeline:[1991]}]});let release;h.E.chooseSong=()=>new Promise(resolve=>{release=resolve});const first=h.R.buyBonusYear(),second=h.R.buyBonusYear();release(catalogue[1]);await Promise.all([first,second]);assert.equal(h.state().match.teams[0].bonusPoints,0);assert.equal(h.state().match.teams[0].bonusYears,1)}

{const h=await make({settings:{playMode:'virtual',teams:2,victory:'10',mode:'greatest',minYear:2002,maxYear:2002},teams:[{name:'Team 1',score:9,bonusPoints:5,timeline:[1990]},{name:'Team 2',score:1,bonusPoints:0,timeline:[1991]}]});h.R.setState({cfg:{playMode:'virtual',minYear:2002,maxYear:2002}});const turn=h.state().match.turn;await h.R.buyBonusYear();assert.equal(h.state().screen,'gameover');assert.equal(h.state().match.teams[0].score,10);assert.equal(h.state().match.turn,turn);assert.equal(h.state().match.lastBonusYear.year,2002)}

// A stale draw cancelled by Back cannot charge or replace the newer round.
{const h=await make({teams:[{name:'Team 1',score:2,bonusPoints:5,bonusYears:0,timeline:[1990,2000]},{name:'Team 2',score:1,bonusPoints:0,bonusYears:0,timeline:[1991]}]});let release;h.E.chooseSong=()=>new Promise(resolve=>{release=resolve});h.R.setState({screen:'playing'});const pending=h.R.buyBonusYear();h.R.handleBack();h.R.setState({current:{...current,cardId:4,year:2003}});release(catalogue[1]);await pending;assert.equal(h.state().match.teams[0].bonusPoints,5);assert.equal(h.state().current.cardId,4)}

// Paid skip costs one point and keeps the same team.
{const h=await make({screen:'youtube',teams:[{name:'Team 1',score:2,bonusPoints:1,timeline:[1990]},{name:'Team 2',score:1,bonusPoints:0,timeline:[1991]}]});h.R.setState({screen:'youtube'});await h.R.newCardForRepeat();assert.equal(h.state().match.teams[0].bonusPoints,0);assert.equal(h.state().match.turn,0);assert.equal(h.state().screen,'skipped');assert.equal(h.state().match.phase,'skipped');assert.match(h.R.skippedScreen(),/Alpha/);assert.match(h.R.skippedScreen(),/Example Artist/);assert.match(h.R.skippedScreen(),/2000/);assert.match(h.R.skippedScreen(),/Next song/);assert.equal(h.state().match.teams[0].score,2);
 const saved=JSON.parse(h.store.get('gsy.match.v7'));h.R.newCardForRepeat();assert.equal(h.state().match.history.filter(x=>x.outcome==='bonus-skip').length,1);const reload=await make(saved);reload.R.setState({screen:'resume'});await reload.R.resumeMatch();assert.equal(reload.state().screen,'skipped');assert.equal(reload.state().current.song.title,'Alpha');assert.equal(reload.state().match.teams[0].bonusPoints,0)}

// Physical finish marks once, adds the collected year, and stays on reveal.
{const h=await make({settings:{playMode:'physical',teams:2,victory:'10',mode:'greatest',minYear:2000,maxYear:2003}});h.R.setState({cfg:{playMode:'physical'},screen:'reveal',placementResult:null});h.R.finishPhysical(true);h.R.finishPhysical(true);const m=h.state().match;assert.equal(h.state().screen,'reveal');assert.equal(m.teams[0].score,3);assert.equal(m.teams[0].timeline.filter(y=>y===2000).length,2)}

const team=(name,bonusPoints=2,timeline=[1990,2010],score=0)=>({name,bonusPoints,timeline,score,correct:0,wrong:0});
async function placing(teams=[team('Team 1'),team('Team 2')],slot=0){
 const h=await make({teams,phase:'guess',placementResult:null,pendingSlot:slot});
 h.R.setState({screen:'guess',placementResult:null,pendingSlot:slot});return h;
}

// Reveal is always direct, even when funded opponents could steal. No forced gate.
{const h=await placing();assert.match(h.R.virtualTimeline(),/>Reveal<\/button>/);assert.match(h.R.virtualTimeline(),/>Steal<\/button>/);h.R.lockPlacement();assert.equal(h.state().screen,'reveal');assert.equal(h.state().placementResult.correct,false);assert.equal(h.state().match.steal,undefined);assert.equal(h.state().match.teams[1].bonusPoints,2)}

// A committed steal stays hidden, costs once, survives Back/Resume and wins only
// after revealing a wrong active placement. A stolen tenth card wins normally.
{const h=await placing([team('Team 1'),team('Team 2',2,[1980],9)]);h.R.startSteal();assert.equal(h.state().screen,'steal');assert.equal(h.state().placementResult,null);assert.doesNotMatch(h.node.innerHTML,/Alpha|Example Artist|answer-year/);h.R.selectStealTeam(1);h.R.selectStealSlot(1);h.R.commitSteal();h.R.commitSteal();assert.equal(h.state().match.teams[1].bonusPoints,1);assert.equal(h.state().match.teams[1].score,9);h.R.handleBack();assert.equal(h.state().screen,'resume');await h.R.resumeMatch();assert.equal(h.state().screen,'steal');
 const reload=await make(JSON.parse(h.store.get('gsy.match.v7')));reload.R.setState({screen:'resume'});reload.R.migrateMatch();await reload.R.resumeMatch();assert.equal(reload.state().screen,'steal');reload.R.revealSteals();reload.R.revealSteals();const m=reload.state().match;assert.equal(reload.state().screen,'reveal');assert.equal(m.teams[0].score,0);assert.equal(m.teams[0].wrong,1);assert.equal(m.teams[1].score,10);assert.deepEqual(Array.from(m.teams[1].timeline),[1980,2000]);assert.equal(m.steal.winner,1);assert.equal(m.history.filter(x=>x.outcome==='steal-won').length,1);reload.R.finishVirtualTurn();assert.equal(reload.state().screen,'gameover')}

// Distinct gaps only; active team, empty balances and duplicate team attempts
// cannot spend. The first correct caller wins when equal years allow two gaps.
{const h=await placing([team('Team 1',2,[1990,2000,2010]),team('Team 2'),team('Team 3'),team('Team 4',0)]);h.R.startSteal();h.R.selectStealTeam(0);assert.equal(h.state().match.steal.selectedTeam,null);h.R.selectStealTeam(3);assert.equal(h.state().match.steal.selectedTeam,null);h.R.selectStealTeam(1);h.R.selectStealSlot(0);h.R.commitSteal();assert.equal(h.state().match.steal.challenges.length,0);h.R.selectStealSlot(1);h.R.commitSteal();h.R.selectStealTeam(1);assert.equal(h.state().match.steal.selectedTeam,null);h.R.selectStealTeam(2);h.R.selectStealSlot(1);assert.equal(h.state().match.steal.selectedSlot,null);h.R.selectStealSlot(2);h.R.commitSteal();h.R.revealSteals();assert.equal(h.state().match.steal.winner,1);assert.equal(h.state().match.teams[1].score,1);assert.equal(h.state().match.teams[2].score,0);assert.equal(h.state().match.teams[2].bonusPoints,1)}

// A correct active placement beats an equally valid same-year challenge.
{const h=await placing([team('Team 1',2,[2000]),team('Team 2')],0);h.R.startSteal();h.R.selectStealTeam(1);h.R.selectStealSlot(1);h.R.commitSteal();h.R.revealSteals();assert.equal(h.state().placementResult.correct,true);assert.equal(h.state().match.teams[0].score,1);assert.equal(h.state().match.teams[1].score,0);assert.equal(h.state().match.teams[1].bonusPoints,1);assert.equal(h.state().match.steal.winner,null)}

// A wrong challenge does not receive a card; duplicate-year interior slots are
// not representable. No challenges can be added or charged after the reveal.
{const h=await placing([team('Team 1',2,[1990,1990,2010]),team('Team 2')]);h.R.startSteal();h.R.selectStealTeam(1);h.R.selectStealSlot(1);assert.equal(h.state().match.steal.selectedSlot,null);h.R.selectStealSlot(3);h.R.commitSteal();h.R.revealSteals();assert.equal(h.state().match.steal.winner,null);assert.equal(h.state().match.teams[1].score,0);h.R.selectStealTeam(1);h.R.commitSteal();assert.equal(h.state().match.teams[1].bonusPoints,1);h.R.clearRoundState();assert.equal(h.state().match.steal,null)}

// Real-card challenges must be registered before reveal, then judged in call
// order. Next Team and bonus buys cannot bypass the unresolved steal.
{const h=await placing([team('Team 1'),team('Team 2',6),team('Team 3')]);h.R.setState({cfg:{playMode:'physical'}});h.R.startSteal();for(const i of [1,2]){h.R.selectStealTeam(i);h.R.commitSteal()}h.R.revealSteals();h.R.finishPhysical(false);const round=h.state().match.round;h.R.finishVirtualTurn();assert.equal(h.state().match.round,round);await h.R.buyBonusYear();h.R.judgePhysicalSteal(false);assert.equal(h.state().match.steal.checkIndex,1);
 const reload=await make(JSON.parse(h.store.get('gsy.match.v7')));reload.R.setState({cfg:{playMode:'physical'},screen:'resume'});await reload.R.resumeMatch();reload.R.judgePhysicalSteal(true);reload.R.judgePhysicalSteal(true);assert.equal(reload.state().match.steal.winner,2);assert.equal(reload.state().match.teams[2].score,1);assert.equal(reload.state().match.steal.physicalPending,false)}
{const h=await placing();h.R.setState({cfg:{playMode:'physical'}});h.R.startSteal();h.R.selectStealTeam(1);h.R.commitSteal();h.R.revealSteals();h.R.finishPhysical(true);h.R.judgePhysicalSteal(true);assert.equal(h.state().match.teams[0].score,1);assert.equal(h.state().match.teams[1].score,0);assert.equal(h.state().match.teams[1].bonusPoints,1);assert.equal(h.state().match.steal.physicalPending,false)}

// Two points are a new-game allowance, never a refill on Resume.
{const h=await make();await h.R.startMatch();assert.ok(h.state().match.teams.every(t=>t.bonusPoints===2));const old=await make({teams:[team('Team 1',0),team('Team 2',1)]});old.R.migrateMatch();assert.equal(old.state().match.teams[0].bonusPoints,0);assert.equal(old.state().match.teams[1].bonusPoints,1)}

console.log('bonus, stealing and skipped-song gameplay VM regressions passed');
