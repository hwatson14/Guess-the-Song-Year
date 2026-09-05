import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const policy = fs.readFileSync('app-policy.js','utf8');
const source = fs.readFileSync('app.js','utf8').replace('  boot();',`  modeReports=E.modeReports();
  window.__test={addBonusPoint,buyBonusYear,newCardForRepeat,finishPhysical,
    finishVirtualTurn,lockPlacement,migrateMatch,handleBack,saveMatch,
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
  return {R,E,store,state:()=>R.getState()};
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
{const h=await make({screen:'youtube',teams:[{name:'Team 1',score:2,bonusPoints:1,timeline:[1990]},{name:'Team 2',score:1,bonusPoints:0,timeline:[1991]}]});h.R.setState({screen:'youtube'});await h.R.newCardForRepeat();assert.equal(h.state().match.teams[0].bonusPoints,0);assert.equal(h.state().match.turn,0)}

// Physical finish marks once, adds the collected year, and stays on reveal.
{const h=await make({settings:{playMode:'physical',teams:2,victory:'10',mode:'greatest',minYear:2000,maxYear:2003}});h.R.setState({cfg:{playMode:'physical'},screen:'reveal',placementResult:null});h.R.finishPhysical(true);h.R.finishPhysical(true);const m=h.state().match;assert.equal(h.state().screen,'reveal');assert.equal(m.teams[0].score,3);assert.equal(m.teams[0].timeline.filter(y=>y===2000).length,2)}

console.log('bonus gameplay VM regressions passed');
