import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const policy=fs.readFileSync('app-policy.js','utf8');
const app=fs.readFileSync('app.js','utf8').replace('  boot();',`  modeReports={greatest:{years:[2000],yearSongKeys:{2000:['example song|example artist']},songLegacyKeys:{},repeatPolicy:'unique',selectable:true,status:'beta',statusLabel:'Beta',yearBasis:'release'}};
  window.__test={prepareCard,playCurrent,getState:()=>({screen,current,playing,match})};`);

function make(provider){
  const song={title:'Example Song',artist:'Example Artist',year:2000,canonicalKey:'example song|example artist'};
  const saved={active:true,mode:'greatest',settings:{playMode:'physical',teams:1,victory:'10',mode:'greatest',minYear:1950,maxYear:2022},phase:'scanner',round:0,turn:0,teams:[{name:'Team 1',score:0,correct:0,wrong:0,timeline:[]}],used:[],history:[],current:null};
  const store=new Map([['gsy.config.v7',JSON.stringify(saved.settings)],['gsy.match.v7',JSON.stringify(saved)]]);
  const node={innerHTML:'',textContent:'',classList:{add(){},remove(){}},querySelector(){return null},querySelectorAll(){return[]}};
  const calls={spotify:0,youtube:0};
  const E={
    MODES:{greatest:{name:'Greatest Hits',short:'Hits',status:'beta',yearBasis:'release',repeatPolicy:'unique'}},
    init:async()=>true,modeReports:async()=>({}),getProvider:()=>provider,getSpotifyDevice:()=>'',isSpotifyConnected:()=>true,
    cardYear:()=>2000,cardYearReference:id=>({cardId:id,baseYear:2000,year:2000,overridden:false}),
    chooseSong:async()=>song,resolveSong:async()=>provider==='spotify'?{uri:'spotify:example'}:{videoId:'youtube-example',candidateIds:['youtube-example']},
    songUseKey:s=>`${s.title.toLowerCase()}|${s.artist.toLowerCase()}`,songKey:s=>`${s.title}|${s.artist}`,
    pauseYouTube(){},destroyYouTube(){},pauseSpotify:async()=>{},
    playSpotify:async()=>{calls.spotify++},playYouTube:async()=>{calls.youtube++;return {started:true,videoId:'youtube-example'}}
  };
  const ctx=vm.createContext({window:{GSYEngine:E,addEventListener(){},scrollTo(){}},document:{getElementById:id=>['app','toast'].includes(id)?node:null,activeElement:null,querySelectorAll:()=>[],addEventListener(){}},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},navigator:{},requestAnimationFrame(){},setTimeout(){return 1},setInterval(){return 1},clearTimeout(){},clearInterval(){},URL,console});
  vm.runInContext(policy,ctx);vm.runInContext(app,ctx);
  return {R:ctx.window.__test,calls};
}

for(const provider of ['spotify','youtube']){
  const {R,calls}=make(provider);
  await R.prepareCard(1);
  assert.equal(R.getState().screen,'ready',`${provider}: physical scan must stop at Ready`);
  assert.equal(R.getState().match.phase,'ready',`${provider}: Ready must persist in the match`);
  assert.equal(calls.spotify,0,`${provider}: Spotify must not start during scan preparation`);
  assert.equal(calls.youtube,0,`${provider}: YouTube must not start during scan preparation`);
  await R.playCurrent();
  if(provider==='spotify')assert.equal(calls.spotify,1,'Spotify starts only after Start music');
  else assert.equal(R.getState().screen,'countdown','YouTube starts its countdown only after Start music');
}

console.log('physical ready gate regression tests passed');
