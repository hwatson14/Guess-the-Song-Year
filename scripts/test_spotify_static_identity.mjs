import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('engine.js','utf8');
const policy=fs.readFileSync('app-policy.js','utf8');
const baseSong={title:'Example Song',artist:'Example Artist'};
const key='example song|example artist';
const track=(id,name='Example Song',artist='Example Artist')=>({id,name,uri:`spotify:track:${id}`,artists:[{name:artist}],external_urls:{spotify:`https://open.spotify.com/track/${id}`}});
const ok=(data,status=200)=>({ok:true,status,json:async()=>data});

function make({cache={},fetchImpl}={}){
  const storage=new Map([
    ['gsy.resolveCache.v6',JSON.stringify(cache)],
    ['gsy.spotifyToken.v6',JSON.stringify({access_token:'TEST',refresh_token:'REFRESH',expires_at:Date.now()+3600000})],
  ]);
  const calls=[];
  const context=vm.createContext({
    window:{},location:{origin:'https://example.test',href:'https://example.test/game',search:''},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},
    history:{replaceState(){}},document:{head:{appendChild(){}},createElement:()=>({})},
    URL,URLSearchParams,console,crypto:{getRandomValues:a=>a,subtle:{digest:async()=>new ArrayBuffer(32)}},TextEncoder,
    btoa:s=>Buffer.from(s,'binary').toString('base64'),
    fetch:async raw=>{const url=new URL(raw,'https://example.test');calls.push(url.pathname+url.search);return fetchImpl(url,calls)},
  });
  vm.runInContext(policy,context);vm.runInContext(source,context,{filename:'engine.js'});
  return {E:context.window.GSYEngine,storage,calls};
}

{
  const song={...baseSong,spotifyId:'staticwrong'};
  const h=make({fetchImpl:async url=>{
    if(url.pathname.endsWith('/tracks/staticwrong'))return ok(track('staticwrong','Different Song','Wrong Artist'));
    if(url.pathname.endsWith('/search'))return ok({tracks:{items:[track('searchedgood')]}});
    throw new Error('unexpected '+url.pathname);
  }});
  const resolved=await h.E.resolveSong(song,'spotify');
  assert.equal(resolved.id,'searchedgood','wrong static Spotify identity falls back to scored search');
  assert.ok(h.calls.some(x=>x.includes('/tracks/staticwrong')));
  assert.ok(h.calls.some(x=>x.includes('/search')));
}

{
  const song={...baseSong,spotifyId:'staticgood'};
  const h=make({fetchImpl:async url=>{
    if(url.pathname.endsWith('/tracks/staticgood'))return ok(track('staticgood'));
    throw new Error('static match should not search');
  }});
  assert.equal((await h.E.resolveSong(song,'spotify')).id,'staticgood','matching static Spotify identity remains preferred');
  assert.equal(h.calls.filter(x=>x.includes('/search')).length,0);
}

{
  const cache={['spotify:'+key]:{id:'cachedwrong',catalogueId:'',cachedAt:Date.now()}};
  const h=make({cache,fetchImpl:async url=>{
    if(url.pathname.endsWith('/tracks/cachedwrong'))return ok(track('cachedwrong','Example Song','Unrelated Artist'));
    if(url.pathname.endsWith('/search'))return ok({tracks:{items:[track('replacement')]}});
    throw new Error('unexpected '+url.pathname);
  }});
  assert.equal((await h.E.resolveSong(baseSong,'spotify')).id,'replacement','cached Spotify identity is revalidated before reuse');
}

{
  const song={title:'Original Song',artist:'Original Artist',playbackTitle:'Club Rework',playbackArtist:'DJ Example',playbackPolicy:'membership-explicit',spotifyId:'reviewed'};
  const h=make({fetchImpl:async url=>{
    if(url.pathname.endsWith('/tracks/reviewed'))return ok(track('reviewed','Original Song','Original Artist'));
    throw new Error('membership-explicit mismatch must not search');
  }});
  await assert.rejects(()=>h.E.resolveSong(song,'spotify'),error=>error.code==='SPOTIFY_TRACK_NOT_FOUND');
  assert.equal(h.calls.filter(x=>x.includes('/search')).length,0);
}

console.log('Spotify static/cached identity validation regressions passed');
