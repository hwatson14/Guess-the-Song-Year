import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(process.env.GSY_ENGINE_UNDER_TEST||'engine.js','utf8');
const uri='spotify:track:requested';
const device={id:'phone',name:'Phone',is_active:true,is_restricted:false};
const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});
const playing=(overrides={})=>({is_playing:true,item:{uri},device:{...device,volume_percent:50},...overrides});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function make({states=[playing()],devices=[device],hang='',expired=false,selected='',playStatus=204,loadStability=false,activationDelay=0}={}){
  const storage=new Map([
    ['gsy.spotifyToken.v6',JSON.stringify({access_token:'TEST',refresh_token:'REFRESH',expires_at:expired?0:Date.now()+3600000})],
    ['gsy.spotifyDevice.v6',selected],
  ]);
  const calls=[],timers=new Map();let nextTimer=0,read=0,activated='',activationReads=0;
  const setTimeout=(fn,ms)=>{
    const id=++nextTimer;timers.set(id,{fn,ms});
    if(ms<10000)queueMicrotask(()=>{if(timers.delete(id))fn()});
    return id;
  };
  const context=vm.createContext({
    window:{},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    location:{search:''},URL,URLSearchParams,AbortController,setTimeout,clearTimeout:id=>timers.delete(id),console,
    fetch:async(raw,options={})=>{
      const url=new URL(raw);const call={path:url.pathname,method:options.method||'GET',signal:options.signal};calls.push(call);
      if(hang&&url.pathname===hang){
        return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('request aborted')),{once:true}));
      }
      if(url.pathname==='/api/token')return response({access_token:'RENEWED',expires_in:3600});
      if(url.pathname.endsWith('/devices')){
        const ready=activated&&activationReads++>=activationDelay;
        return response({devices:devices.map(item=>ready?{...item,is_active:item.id===activated}:item)});
      }
      if(url.pathname.endsWith('/play'))return response(playStatus===403?{error:{message:'Premium required'}}:null,playStatus);
      if(url.pathname==='/v1/me/player'&&options.method==='PUT'){activated=JSON.parse(options.body).device_ids[0];return response(null,204)}
      if(url.pathname==='/v1/me/player'){
        const state=states[Math.min(read++,states.length-1)];
        return response(state,state===null?204:200);
      }
      throw Error('Unexpected request '+url.pathname);
    },
  });
  vm.runInContext(readFileSync('app-policy.js','utf8'),context);
  vm.runInContext(source,context);
  if(loadStability)vm.runInContext(readFileSync('spotify-stability.js','utf8'),context);
  return {E:context.window.GSYEngine,calls,timers,
    expire:()=>{const timer=[...timers].find(([,value])=>value.ms===10000);assert.ok(timer,'request must have a timeout');timers.delete(timer[0]);timer[1].fn()},
    unhang:()=>{hang=''},
  };
}

{
  const h=make();assert.equal(await h.E.playSpotify(uri),'phone');
  assert.equal(h.calls.filter(x=>x.path==='/v1/me/player'&&x.method==='GET').length,1);
  assert.equal(h.timers.size,0,'completed requests clean up timers');
}
{
  const h=make({states:[playing({is_playing:false}),playing()]});
  await h.E.playSpotify(uri);
  assert.equal(h.calls.filter(x=>x.path==='/v1/me/player'&&x.method==='GET').length,2,'allow the device to finish starting');
}
for(const state of [null,playing({is_playing:false}),playing({item:{uri:'spotify:track:old'}}),playing({device:{id:'different-device'}})]){
  const h=make({states:[state]});
  await assert.rejects(h.E.playSpotify(uri),error=>error.code==='SPOTIFY_PLAYBACK_UNCONFIRMED','204 with paused, old or wrong-device playback must not report success');
  assert.equal(h.calls.filter(x=>x.path==='/v1/me/player'&&x.method==='GET').length,5,'confirmation polling must be bounded');
}
{
  const h=make({states:[playing({item:{uri:'spotify:track:regional',linked_from:{uri}}})]});
  assert.equal(await h.E.playSpotify(uri),'phone','legitimate regional relinking can confirm the requested track');
}
{
  const h=make({states:[playing({device:{...device,volume_percent:0}})]});
  await assert.rejects(h.E.playSpotify(uri),error=>error.code==='SPOTIFY_MUTED');
}
{
  const h=make({devices:[{...device,is_restricted:true}],selected:'phone'});
  await assert.rejects(h.E.playSpotify(uri),error=>error.code==='SPOTIFY_DEVICE_RESTRICTED');
  assert.equal(h.calls.some(x=>x.path.endsWith('/play')),false,'restricted device must fail before sending play');
}
{
  const h=make({devices:[{id:'restricted',is_active:true,is_restricted:true},{...device,is_active:false}]});
  assert.equal(await h.E.playSpotify(uri),'phone','automatic selection skips restricted devices');
}
{
  const h=make({devices:[{...device,is_active:false}],activationDelay:2});
  await h.E.playSpotify(uri);
  const playIndex=h.calls.findIndex(call=>call.path.endsWith('/play'));
  assert.equal(h.calls.slice(0,playIndex).filter(call=>call.path.endsWith('/devices')).length,4,'wait for the selected device to become active before sending play');
}
{
  const h=make({devices:[{...device,is_active:false}],activationDelay:Infinity});
  await assert.rejects(h.E.playSpotify(uri),error=>error.code==='SPOTIFY_DEVICE_NOT_READY');
  assert.equal(h.calls.some(call=>call.path.endsWith('/play')),false,'never send play before transfer is ready');
}
{
  const h=make({playStatus:403});
  await assert.rejects(h.E.playSpotify(uri),error=>error.code==='SPOTIFY_FORBIDDEN');
}
for(const [hang,expired,action] of [
  ['/v1/me/player/devices',false,'finding playback devices'],
  ['/api/token',true,'renewing sign-in'],
  ['/v1/me/player/play',false,'starting music'],
  ['/v1/me/player',false,'checking whether music started'],
]){
  const h=make({hang,expired,loadStability:true});
  const operation=h.E.playSpotify(uri);
  const rejected=assert.rejects(operation,error=>error.code==='SPOTIFY_TIMEOUT'&&error.message.includes(action));
  await tick();h.expire();await rejected;
  assert.equal(h.calls.find(call=>call.path===hang).signal.aborted,true,'timeout aborts the underlying request');
  assert.equal(h.timers.size,0);
  h.unhang();assert.equal(await h.E.playSpotify(uri),'phone','timeout releases both Spotify queues so retry can work');
}

console.log('Spotify playback confirmation, restricted/muted targets, bounded waits and queue recovery passed.');
