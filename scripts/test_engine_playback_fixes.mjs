import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('engine.js','utf8');
const policy=fs.readFileSync('app-policy.js','utf8');
const song={title:'Example Song',artist:'Example Artist'};
const key='example song|example artist';

function make({cache={},fetchImpl}={}){
  const storage=new Map([['gsy.resolveCache.v6',JSON.stringify(cache)],['gsy.spotifyToken.v6',JSON.stringify({access_token:'TEST',refresh_token:'REFRESH',expires_at:Date.now()+3600000})]]);
  const calls=[];
  const context=vm.createContext({window:{},location:{origin:'https://example.test',href:'https://example.test/game',search:''},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    document:{head:{appendChild(){}},createElement:()=>({})},URL,URLSearchParams,console,
    fetch:async raw=>{const url=new URL(raw,'https://example.test');calls.push(url.pathname+url.search);return fetchImpl(url,calls)}
  });
  vm.runInContext(policy,context);vm.runInContext(source,context,{filename:'engine.js'});
  return {E:context.window.GSYEngine,storage,calls};
}

const ok=data=>({ok:true,json:async()=>data});

{
  const h=make({cache:{['youtube:'+key]:{ids:['expired'],cachedAt:Date.now()-8*24*60*60*1000}},fetchImpl:async(url)=>url.pathname.endsWith('/search')?ok({items:[{id:{videoId:'fresh'},snippet:{title:'Example Song',channelTitle:'Example Artist'}}]}):ok({items:[{id:'fresh',status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed'},snippet:{title:'Example Song',channelTitle:'Example Artist'}}]})});
  const result=await h.E.resolveSong(song,'youtube');
  assert.equal(result.videoId,'fresh','expired YouTube cache is replaced through search');
  assert.ok(h.calls.some(x=>x.includes('/youtube/v3/search')));
}

{
  const h=make({cache:{['youtube:'+key]:{ids:['wrong'],cachedAt:Date.now()}},fetchImpl:async(url)=>url.pathname.endsWith('/videos')?ok({items:[{id:'wrong',status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed'},snippet:{title:'You Got Nothing I Want (2011 Remastered)',channelTitle:'Cold Chisel'}}]}):ok({items:[{id:{videoId:'wrong'},snippet:{title:'You Got Nothing I Want (2011 Remastered)',channelTitle:'Cold Chisel'}}]})});
  await assert.rejects(()=>h.E.resolveSong(song,'youtube'),err=>err.code==='YOUTUBE_VIDEO_NOT_FOUND');
}

{
  const cold={title:"I'm Gonna Roll Ya",artist:'Cold Chisel',youtubeId:'Q5uzeROl9Sk'},coldKey='im gonna roll ya|cold chisel';
  const h=make({cache:{['youtube:'+coldKey]:{ids:['good'],cachedAt:Date.now()}},fetchImpl:async(url)=>url.pathname.endsWith('/videos')?ok({items:[{id:'good',status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed'},snippet:{title:"I'm Gonna Roll Ya (2011 Remastered) (Official Video)",channelTitle:'Cold Chisel'}}]}):ok({items:[]})});
  assert.equal((await h.E.resolveSong(cold,'youtube')).videoId,'good','remastered official video with matching identity remains playable');
}

{
  const songWithEntity={title:'Rock & Roll',artist:"Guns N' Roses",youtubeId:'entity'};
  const h=make({fetchImpl:async(url)=>url.pathname.endsWith('/videos')?ok({items:[{id:'entity',status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed'},snippet:{title:'Rock &amp; Roll (Official Audio)',channelTitle:"Guns N' Roses"}}]}):ok({items:[]})});
  assert.equal((await h.E.resolveSong(songWithEntity,'youtube')).videoId,'entity','HTML entities and apostrophes normalize for valid identity');
}

{
  const live={title:'Live and Let Die',artist:"Guns N' Roses",youtubeId:'live'};
  const h=make({fetchImpl:async(url)=>url.pathname.endsWith('/videos')?ok({items:[{id:'live',status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed'},snippet:{title:'Live and Let Die (Official Audio)',channelTitle:"Guns N' Roses"}}]}):ok({items:[]})});
  assert.equal((await h.E.resolveSong(live,'youtube')).videoId,'live','literal live title remains playable');
}

{
  let videoCalls=0;
  const h=make({cache:{['youtube:'+key]:{ids:['dead'],cachedAt:Date.now()}},fetchImpl:async(url)=>url.pathname.endsWith('/videos')?(videoCalls++===0?ok({items:[]}):ok({items:[{id:'replacement',status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed'},snippet:{title:'Example Song',channelTitle:'Example Artist'}}]})):ok({items:[{id:{videoId:'replacement'},snippet:{title:'Example Song',channelTitle:'Example Artist'}}]})});
  const result=await h.E.resolveSong(song,'youtube');
  assert.equal(result.videoId,'replacement','invalidated cached YouTube candidates are replaced');
}

{
  const h=make({fetchImpl:async(url)=>url.pathname.endsWith('/search')?ok({tracks:{items:[{id:'weak',name:'Example Song',artists:[{name:'Unrelated'}]}]}}):ok({items:[]})});
  await assert.rejects(()=>h.E.resolveSong(song,'spotify'),err=>err.code==='SPOTIFY_TRACK_NOT_FOUND');
}

{
  let releasePlay;
  const h=make({fetchImpl:async(url)=>{
    if(url.pathname.endsWith('/devices'))return ok({devices:[{id:'device',is_active:true}]});
    if(url.pathname.endsWith('/play'))return new Promise(resolve=>{releasePlay=()=>resolve(ok(null));});
    if(url.pathname.endsWith('/pause'))return ok(null);
    throw new Error('unexpected '+url.pathname);
  }});
  const play=h.E.playSpotify('spotify:track:first');
  await new Promise(resolve=>setImmediate(resolve));
  const pause=h.E.pauseSpotify();
  assert.equal(h.calls.filter(x=>x.includes('/pause')).length,0,'pause waits behind an in-flight play');
  releasePlay();
  await Promise.all([play,pause]);
  assert.ok(h.calls.at(-1).includes('/pause'),'queued pause becomes the final provider command');
}

console.log('engine playback fixes passed: YouTube cache expiry/revalidation, Spotify match floor, serialized device commands');

for(const fixture of [
 {song:{title:'Music',artist:'Madonna'},title:'Madonna - Vogue (Official Music Video)',channel:'Madonna',allowed:false},
 {song:{title:'One',artist:'Artist'},title:'Someone',channel:'Artist',allowed:false},
 {song:{title:'Live and Let Die',artist:'Wings'},title:'Live and Let Die (Remix)',channel:'Wings',allowed:false},
 {song:{title:'More Than This',artist:'Roxy Music'},title:'More Than This (Official Video)',channel:'Roxy Music',allowed:true},
 {song:{title:'Music',artist:'Madonna'},title:'Madonna - Music (Official Music Video)',channel:'Madonna',allowed:true},
]){
 const item={id:'candidate',status:{embeddable:true,privacyStatus:'public',uploadStatus:'processed'},snippet:{title:fixture.title,channelTitle:fixture.channel}};
 const h=make({fetchImpl:async url=>ok({items:url.pathname.endsWith('/videos')?[item]:[{...item,id:{videoId:'candidate'}}]})});
 if(fixture.allowed)assert.equal((await h.E.resolveSong(fixture.song,'youtube')).videoId,'candidate');
 else await assert.rejects(()=>h.E.resolveSong(fixture.song,'youtube'),error=>error.code==='YOUTUBE_VIDEO_NOT_FOUND',fixture.title);
}
