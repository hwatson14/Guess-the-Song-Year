import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
function harness(cache){
 const storage=new Map([['gsy.resolveCache.v6',JSON.stringify(cache)],['gsy.spotifyToken.v6',JSON.stringify({access_token:'TEST',refresh_token:'TEST_REFRESH',expires_at:Date.now()+3600000})]]),calls=[];
 const context=vm.createContext({window:{},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},URL,URLSearchParams,location:{search:''},console,
  fetch:async raw=>{const url=new URL(raw,'https://example.test');calls.push(url.pathname);let data={};
   if(url.pathname.startsWith('/v1/tracks/')){const id=url.pathname.split('/').at(-1);data={id,uri:'spotify:track:'+id,name:'Example',artists:[{name:'Artist'}]}}
   else if(url.pathname.endsWith('/videos'))data={items:[{id:url.searchParams.get('id'),status:{embeddable:true}}]};
   else throw Error('Unexpected network path '+url.pathname);
   return {ok:true,json:async()=>data};
  }});
 vm.runInContext(fs.readFileSync('app-policy.js','utf8'),context);
 vm.runInContext(fs.readFileSync('engine.js','utf8'),context);return {E:context.window.GSYEngine,storage,calls};
}
const key='example|artist';
for(const kind of ['spotify','youtube']){
 const prior=kind==='spotify'?{id:'old'}:{ids:['old']};
 const {E,storage}=harness({[kind+':'+key]:prior});
 const song={title:'Example',artist:'Artist',[kind+'Id']:'new'};
 let result=await E.resolveSong(song,kind);
 assert.equal(result.id||result.videoId,'new','A new catalogue choice supersedes a legacy cached search');
 const entry=JSON.parse(storage.get('gsy.resolveCache.v6'))[kind+':'+key];
 assert.equal(entry.catalogueId,'new');
 song[kind+'Id']='replacement';result=await E.resolveSong(song,kind);
 assert.equal(result.id||result.videoId,'replacement','Changing a preferred link invalidates only its old cached choice');
}
const legacy=harness({'youtube:example|artist':{ids:['old']}});
assert.equal((await legacy.E.resolveSong({title:'Example',artist:'Artist'},'youtube')).videoId,'old');
assert.equal(legacy.calls.length,1,'Legacy cached YouTube results are revalidated and upgraded without search');
assert.match(JSON.parse(legacy.storage.get('gsy.resolveCache.v6'))['youtube:example|artist'].cachedAt+'',/^\d+$/);
console.log('Preferred provider changes override cached searches for Spotify and YouTube.');
