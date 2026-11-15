import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('engine.js','utf8');
const token={access_token:'TEST',refresh_token:'REFRESH',expires_at:Date.now()+3600000};
const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});

function make({pauseSticks=false,storage=new Map([['gsy.spotifyToken.v6',JSON.stringify(token)]]),state={uri:'',is_playing:false}}={}){
  const device={id:'phone',is_active:true,is_restricted:false,volume_percent:50};
  const calls=[];
  const ctx=vm.createContext({
    window:{GSYAppPolicy:{}},location:{origin:'https://example.test',href:'https://example.test/game',search:''},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    document:{head:{appendChild(){}},createElement:()=>({})},
    URL,URLSearchParams,AbortController,setTimeout,clearTimeout,console,
    fetch:async(raw,options={})=>{
      const url=new URL(raw);
      const path=url.pathname;
      const method=options.method||'GET';
      const body=options.body&&options.headers?.['Content-Type']==='application/json'?JSON.parse(options.body):null;
      calls.push({path,method,body});
      if(path.endsWith('/devices'))return response({devices:[device]});
      if(path.endsWith('/pause')){
        if(!pauseSticks)state.is_playing=false;
        return response(null,204);
      }
      if(path.endsWith('/play')){
        state.uri=body?.uris?.[0]||body?.offset?.uri||'';
        state.is_playing=true;
        return response(null,204);
      }
      if(path==='/v1/me/player')return response({
        is_playing:state.is_playing,
        item:state.uri?{uri:state.uri}:null,
        device,
      });
      throw Error('Unexpected Spotify request: '+path);
    },
  });
  vm.runInContext(source,ctx,{filename:'engine.js'});
  return {E:ctx.window.GSYEngine,calls,state,storage};
}
const playCalls=h=>h.calls.filter(c=>c.path.endsWith('/play'));
const pauseCalls=h=>h.calls.filter(c=>c.path.endsWith('/pause'));

{
  const h=make();
  await h.E.playSpotify('spotify:track:first');
  assert.equal(playCalls(h).length,1);
  assert.equal(pauseCalls(h).length,0,'do not pause an untouched Spotify session on the first song');
  assert.equal(h.calls.filter(c=>c.path==='/v1/me/player'&&c.method==='GET').length,1,
    'no added preflight for the first game-controlled song');

  // Simulate a previous stop that was never applied by Spotify.
  await h.E.playSpotify('spotify:track:second');
  assert.equal(pauseCalls(h).length,1,'previous recording must be paused before switching');
  const pauseIndex=h.calls.findIndex(c=>c.path.endsWith('/pause'));
  const secondPlayIndex=h.calls.findIndex(c=>c.path.endsWith('/play')&&c.body?.uris?.[0]==='spotify:track:second');
  assert.ok(pauseIndex>=0&&pauseIndex<secondPlayIndex,'pause must complete before the new play request');
  assert.equal(h.state.uri,'spotify:track:second');
  assert.equal(h.state.is_playing,true);
}
{
  const h=make();
  await h.E.playSpotify('spotify:track:first');
  h.state.is_playing=false;
  await h.E.playSpotify('spotify:track:second');
  assert.equal(pauseCalls(h).length,0,'already paused old music must not incur another pause');
  assert.equal(playCalls(h).length,2);
}
{
  const h=make({pauseSticks:true});
  await h.E.playSpotify('spotify:track:first');
  await assert.rejects(
    h.E.playSpotify('spotify:track:second'),
    error=>error.code==='SPOTIFY_PREVIOUS_TRACK_STILL_PLAYING',
    'do not send a new track while the previous track is audibly reported as active'
  );
  assert.equal(pauseCalls(h).length,1,'bounded pause attempt');
  assert.equal(playCalls(h).length,1,'unsafe transition must not start another recording');
  assert.equal(h.calls.filter(c=>c.path==='/v1/me/player'&&c.method==='GET').length,7,
    'initial confirmation plus preflight plus five bounded stop confirmations');
}

{
  const before=make();
  await before.E.playSpotify('spotify:track:first');
  const after=make({storage:before.storage,state:before.state});
  await after.E.playSpotify('spotify:track:second');
  assert.equal(pauseCalls(after).length,1,'refresh must preserve ownership of the earlier playback device');
  assert.equal(after.state.uri,'spotify:track:second');
}

console.log('Spotify track transition regression passed: quiet switch, no redundant pause, fail closed if old song persists.');
