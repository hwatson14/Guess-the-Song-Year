import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const engineSource=readFileSync(new URL('../engine.js',import.meta.url),'utf8');

function makeHarness({apiReady=true}={}){
  let now=0,nextTimer=1;
  const timers=new Map(),instances=[];
  const setTimeout=(fn,delay=0)=>{const id=nextTimer++;timers.set(id,{fn,at:now+delay});return id};
  const clearTimeout=id=>timers.delete(id);
  const advance=ms=>{
    const end=now+ms;
    while(true){
      const due=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];
      if(!due)break;
      timers.delete(due[0]);now=due[1].at;due[1].fn();
    }
    now=end;
  };
  const storage=new Map();
  const context=vm.createContext({
    window:{GSYAppPolicy:{}},location:{origin:'https://example.test',href:'https://example.test/game',search:''},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    document:{head:{appendChild(){}},createElement:()=>({})},setTimeout,clearTimeout,URL,URLSearchParams,fetch:async()=>({ok:true,json:async()=>({})}),console
  });
  function installApi(){
    class Player{
      constructor(containerId,config){this.containerId=containerId;this.config=config;this.loads=[];this.playCalls=0;this.pauseCalls=0;this.seekCalls=[];this.destroyCalls=0;instances.push(this)}
      loadVideoById(id){this.loads.push(id)}
      playVideo(){this.playCalls++}
      pauseVideo(){this.pauseCalls++}
      seekTo(...args){this.seekCalls.push(args)}
      destroy(){this.destroyCalls++}
      fireReady(){this.config.events.onReady({target:this})}
      fireState(data){this.config.events.onStateChange({target:this,data})}
      fireError(){this.config.events.onError({target:this})}
    }
    const YT={Player,PlayerState:{PLAYING:1}};
    context.YT=YT;context.window.YT=YT;
  }
  if(apiReady)installApi();
  vm.runInContext(engineSource,context,{filename:'engine.js'});
  return {E:context.window.GSYEngine,context,instances,advance,installApi,timers};
}

const tick=()=>new Promise(resolve=>setImmediate(resolve));

{
  const h=makeHarness();
  const oldPending=h.E.playYouTube('player',{videoId:'old-a',candidateIds:['old-a','old-b']});
  await tick();
  const oldPlayer=h.instances[0];
  oldPlayer.fireError();
  const newPending=h.E.playYouTube('player',{videoId:'new-a',candidateIds:['new-a','new-b']});
  await tick();
  const newPlayer=h.instances[1];
  h.advance(150);
  assert.deepEqual(oldPlayer.loads,[],'cancelled fallback must not touch its destroyed player');
  assert.deepEqual(newPlayer.loads,[],'old fallback must never load into the newer global player');
  assert.equal((await oldPending).cancelled,true);
  newPlayer.fireState(1);
  assert.equal((await newPending).videoId,'new-a');
}

{
  const h=makeHarness();
  const pending=h.E.playYouTube('player',{videoId:'ready-video'});
  await tick();
  h.instances[0].fireReady();
  h.E.destroyYouTube();
  h.advance(6500);
  const result=await pending;
  assert.equal(result.cancelled,true);
  assert.equal(result.started,false);
  assert.equal(result.needsTap,false);
  assert.equal(h.timers.size,0,'destroy must clear startup and API timeout timers');
}

{
  const h=makeHarness({apiReady:false});
  const stale=h.E.playYouTube('player',{videoId:'stale-api-load'});
  const current=h.E.playYouTube('player',{videoId:'current-api-load'});
  h.installApi();
  h.context.window.onYouTubeIframeAPIReady();
  await tick();
  assert.equal(h.instances.length,1,'only the latest request may create a player after API load');
  assert.equal(h.instances[0].config.videoId,'current-api-load');
  assert.equal((await stale).cancelled,true);
  h.instances[0].fireState(1);
  assert.equal((await current).videoId,'current-api-load');
}

{
  const h=makeHarness({apiReady:false});
  const pending=h.E.playYouTube('player',{videoId:'destroyed-before-api'});
  h.E.destroyYouTube();
  assert.equal((await pending).cancelled,true,'destroy should settle an API-loading startup immediately');
  h.installApi();h.context.window.onYouTubeIframeAPIReady();
  await tick();
  assert.equal(h.instances.length,0,'destroyed API-loading startup must not create a player later');
}

{
  const h=makeHarness();
  const pending=h.E.playYouTube('player',{videoId:'bad',candidateIds:['bad','good']});
  await tick();
  const player=h.instances[0];
  player.fireError();h.advance(149);
  assert.deepEqual(player.loads,[]);
  h.advance(1);
  assert.deepEqual(player.loads,['good'],'current request should retain normal candidate fallback');
  player.fireState(1);
  assert.equal((await pending).videoId,'good');
  h.E.pauseYouTube();
  assert.equal(player.pauseCalls,1);
  assert.equal(h.E.resumeYouTube(),true);
  assert.equal(h.E.replayYouTube(),true);
  assert.deepEqual(player.seekCalls,[[0,true]]);
}

console.log('YouTube playback lifecycle regression tests passed');
