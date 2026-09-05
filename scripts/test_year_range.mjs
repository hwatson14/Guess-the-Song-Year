import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {catalogueEngine} from './catalogue_runtime.mjs';

const source=fs.readFileSync('app.js','utf8').replace('  boot();',`  window.__test={
  startMatch,migrateMatch,takeVirtualCardId,prepareCard,nextRound,ensureVirtualStarters,resumeMatch,
  getState:()=>({cfg,screen,match,current}),
  setState:next=>{if(next.cfg)cfg={...DEFAULT_CFG,...next.cfg};if('match' in next)match=next.match;
    if(next.reports)modeReports=next.reports;if('current' in next)current=next.current;
    if(next.screen)screen=next.screen;}
};`);
const config={playMode:'virtual',teams:2,victory:'10',mode:'greatest',minYear:2000,maxYear:2001};
const song=(title,year)=>({title,artist:'Example',year});
const data={modes:{greatest:{2000:[{...song('Alpha',2000),legacyKeys:['old alpha|example']},song('Beta',2000)],2001:[song('Gamma',2001)]},
  number1_us:{2000:[{...song('Leader',2000),chartYear:2000}]}}};
const manifest={modes:{
  greatest:{name:'Greatest',short:'Hits',status:'beta',yearBasis:'release',repeatPolicy:'unique'},
  number1_us:{name:'#1 US',short:'#1 US',status:'beta',yearBasis:'chart',repeatPolicy:'fixed'}
}};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function make(cfg=config){
  const E=catalogueEngine(data,manifest),store=new Map(),scheduled=[],messages=[];
  E.cardYear=id=>({1:2000,2:2001,3:1999}[id]||null);
  E.getProvider=()=> 'youtube';E.isSpotifyConnected=()=>false;E.getSpotifyDevice=()=> '';
  E.resolveSong=async song=>({videoId:'fake-video',song});E.songKey=E.songUseKey;
  E.pauseYouTube=()=>{};E.destroyYouTube=()=>{};
  const node={innerHTML:'',classList:{add(){},remove(){}},querySelector:()=>null,querySelectorAll:()=>[]};
  Object.defineProperty(node,'textContent',{set:value=>messages.push(value),get:()=>messages.at(-1)});
  const context=vm.createContext({window:{GSYEngine:E,addEventListener(){},scrollTo(){}},
    document:{getElementById:id=>["app","toast"].includes(id)?node:null,activeElement:null,querySelectorAll:()=>[],addEventListener(){}},
    localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)},
    navigator:{},requestAnimationFrame(){},setTimeout(fn,delay){scheduled.push({fn,delay});return scheduled.length},
    setInterval(){return 1},clearTimeout(){},clearInterval(){},URL,console});
  vm.runInContext(fs.readFileSync('app-policy.js','utf8'),context);
  vm.runInContext(source,context);
  const api=context.window.__test;
  api.setState({cfg,match:null,reports:await E.modeReports(),screen:'setup'});
  return {...api,E,P:context.window.GSYAppPolicy,store,scheduled,messages};
}
const R=await make();
assert.deepEqual(JSON.parse(JSON.stringify(R.P.normalizeYearRange(undefined,undefined))),{minYear:1950,maxYear:2022});
assert.deepEqual(JSON.parse(JSON.stringify(R.P.normalizeYearRange(2020,1990))),{minYear:1990,maxYear:2020});
assert.ok(R.P.yearInRange(1990,{minYear:1990,maxYear:1990}));
assert.ok(!R.P.yearInRange(1989,{minYear:1990,maxYear:1990}));
await R.startMatch();await flush();
assert.equal(R.getState().match.settings.minYear,2000);
assert.ok(R.getState().match.virtualDeck.every(id=>[1,2].includes(id)));

const narrow=await make({...config,minYear:2000,maxYear:2000,teams:6});
await narrow.startMatch();await flush();
let m=narrow.getState().match;
assert.equal(m.teams.length,6);
assert.ok(m.teams.every(team=>team.timeline.length===1&&team.starterYear===2000));
assert.equal(m.used.length,0,'starter references do not consume songs');
for(let i=0;i<8;i++)assert.equal(narrow.takeVirtualCardId(),1,'physical card IDs refill while songs remain');
m.used=[narrow.E.songUseKey(data.modes.greatest[2000][0])];
assert.equal(narrow.takeVirtualCardId(),1,'another song in same year remains available');
m.used=['old alpha|example',narrow.E.songUseKey(data.modes.greatest[2000][1])];
assert.equal(narrow.takeVirtualCardId(),null,'saved legacy aliases exhaust the year without an endless refill');
m.used=data.modes.greatest[2000].map(narrow.E.songUseKey);
assert.equal(narrow.takeVirtualCardId(),null);
m.teams[0].score=4;m.teams[1].score=2;
narrow.nextRound();
assert.equal(narrow.getState().screen,'gameover');
assert.equal(m.endReason,'range-exhausted');
assert.equal(m.teams[0].score,4);
assert.equal(m.teams[1].score,2);

const skip=await make();await skip.startMatch();await flush();
m=skip.getState().match;m.virtualDeck=[1,2];m.virtualPos=0;m.used=data.modes.greatest[2000].map(skip.E.songUseKey);
assert.equal(skip.takeVirtualCardId(),2,'exhausted year skipped within selected range');
m.used.push(skip.E.songUseKey(data.modes.greatest[2001][0]));
assert.equal(skip.takeVirtualCardId(),null,'all selected songs exhausted');

const fixed=await make({...config,mode:'number1_us',minYear:2000,maxYear:2000});
await fixed.startMatch();await flush();
m=fixed.getState().match;m.used=[fixed.E.songUseKey(data.modes.number1_us[2000][0])];
for(let i=0;i<8;i++)assert.equal(fixed.takeVirtualCardId(),1,'fixed chart leader repeats after deck rollover');

const migrated=await make({...config,teams:1,minYear:2000,maxYear:2000});
const old={active:true,mode:'greatest',phase:'guess',teams:Array.from({length:6},(_,i)=>({name:`T${i}`,score:i,timeline:[]})),used:[],history:[],virtualDeck:[1],virtualPos:0};
migrated.setState({match:old});migrated.migrateMatch();
assert.equal(old.settings.playMode,'virtual');
assert.equal(old.settings.teams,6);
assert.ok(old.teams.every(team=>team.starterYear===2000));
assert.equal(old.phase,'guess');
assert.equal(old.teams[5].score,5);
const locked=await make({...config,playMode:'physical',minYear:1950,maxYear:2022});
locked.setState({match:JSON.parse(JSON.stringify(old))});locked.migrateMatch();
assert.equal(locked.getState().cfg.playMode,'virtual');
assert.equal(locked.getState().cfg.minYear,2000);
assert.equal(locked.getState().cfg.maxYear,2000);
assert.equal(locked.getState().cfg.teams,6);

const physical=await make({...config,playMode:'physical',minYear:2000,maxYear:2000});
await physical.startMatch();await flush();
m=physical.getState().match;
const before=JSON.stringify(m);
await physical.prepareCard(2);
assert.equal(JSON.stringify(m),before,'out-of-range rejection preserves turn, phase, scores and state');
assert.equal(physical.getState().screen,'scanner');
assert.ok(physical.scheduled.some(timer=>timer.delay===400),'rejected scan restarts scanner');
assert.match(physical.messages.at(-1),/outside the selected range/);

const unsupported=await make({...config,playMode:'physical',minYear:1999,maxYear:2001});
await unsupported.startMatch();await flush();
const unsupportedBefore=JSON.stringify(unsupported.getState().match);
await unsupported.prepareCard(3);
assert.equal(JSON.stringify(unsupported.getState().match),unsupportedBefore);
assert.match(unsupported.messages.at(-1),/no playable song/);

const failed=await make({...config,minYear:2001,maxYear:2001});
failed.E.resolveSong=async()=>{throw new failed.E.AppError('YOUTUBE_VIDEO_NOT_FOUND','Mock missing upload')};
await failed.startMatch();await flush();
assert.equal(failed.getState().screen,'error','failed candidates cause recovery, not whole-range completion');
assert.notEqual(failed.getState().match.endReason,'range-exhausted');
console.log('year range VM regressions passed: starters, persistence, finite exhaustion, refills, fixed repeats, scan rejection and provider failures');
