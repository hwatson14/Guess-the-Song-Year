import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = name => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const fakeLegacy = {access_token:'FAKE_ACCESS', refresh_token:'FAKE_REFRESH', expires_at:Date.now()+3600000};

function makeStorage(entries){
  const values = new Map(Object.entries(entries));
  return {values, getItem:key=>values.get(key) ?? null, setItem:(key,value)=>values.set(key,String(value)), removeItem:key=>values.delete(key)};
}
function load(storage){
  const context = vm.createContext({window:{}, localStorage:storage, URLSearchParams, location:{search:''},
    fetch:async url=>({ok:true,json:async()=>({modes:{}})} )});
  vm.runInContext(source('app-policy.js'), context, {filename:'app-policy.js'});
  vm.runInContext(source('engine.js'), context, {filename:'engine.js'});
  return context.window.GSYEngine;
}
async function init(storage){const engine=load(storage);await engine.init();return engine}

const storage = makeStorage({'gsy.token':JSON.stringify(fakeLegacy)});
let engine = await init(storage);
assert.equal(engine.isSpotifyConnected(), true);
assert.equal(storage.values.has('gsy.token'), false);
assert.equal(storage.values.has('gsy.spotifyToken.v6'), true);
engine.spotifyDisconnect();
assert.equal(engine.isSpotifyConnected(), false);
assert.equal(storage.values.has('gsy.token'), false);
assert.equal(storage.values.has('gsy.spotifyToken.v6'), false);
engine = await init(storage);
assert.equal(engine.isSpotifyConnected(), false, 'disconnect must survive reload');

const current = {access_token:'CURRENT_ACCESS', refresh_token:'CURRENT_REFRESH', expires_at:Date.now()+3600000};
const dual = makeStorage({'gsy.token':JSON.stringify(fakeLegacy), 'gsy.spotifyToken.v6':JSON.stringify(current)});
engine = await init(dual);
assert.equal(engine.isSpotifyConnected(), true);
assert.deepEqual(JSON.parse(dual.values.get('gsy.spotifyToken.v6')), current, 'current token must win');
assert.equal(dual.values.has('gsy.token'), false);

console.log('Spotify legacy migration and disconnect regression tests passed');
