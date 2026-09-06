import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

function storage(){
  const values=new Map();
  return {
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value)),
    removeItem:key=>values.delete(key),
    clear:()=>values.clear(),
  };
}

const localStorage=storage(),sessionStorage=storage();
const location={href:'https://example.com/Guess-the-Song-Year/',search:''};
let connected=false,initSawSession=false,deviceCalls=0,resolveCalls=0;

class AppError extends Error{
  constructor(code,message,status=0){super(message);this.code=code;this.status=status}
}

const E={
  AppError,
  redirectUri:()=> 'https://example.com/Guess-the-Song-Year/',
  getProvider:()=> 'spotify',
  isSpotifyConnected:()=>connected,
  init:async()=>{
    initSawSession=!!sessionStorage.getItem('gsy.spotify.verifier')&&!!sessionStorage.getItem('gsy.spotify.state');
    if(location.search.includes('code='))connected=true;
    return true;
  },
  spotifyDevices:async()=>{
    deviceCalls++;
    if(deviceCalls===1)throw new AppError('SPOTIFY_API','rate limited',429);
    return [{id:'phone',name:'Phone'}];
  },
  resolveSong:async()=>{
    resolveCalls++;
    if(resolveCalls===1)throw new TypeError('Failed to fetch');
    return {provider:'spotify',id:'track'};
  },
  playSpotify:async()=>true,
  pauseSpotify:async()=>true,
};

const context={
  window:{GSYEngine:E},location,localStorage,sessionStorage,
  URL,URLSearchParams,TextEncoder,Uint8Array,crypto:webcrypto,
  btoa:value=>Buffer.from(value,'binary').toString('base64'),
  setTimeout,clearTimeout,Date,Promise,console,
};
vm.createContext(context);
vm.runInContext(readFileSync('spotify-stability.js','utf8'),context,{filename:'spotify-stability.js'});

await E.spotifyConnect();
const auth=new URL(location.href);
const state=auth.searchParams.get('state');
assert.equal(auth.origin,'https://accounts.spotify.com');
assert.ok(state,'Spotify connect should create OAuth state');
assert.ok(sessionStorage.getItem('gsy.spotify.verifier'),'PKCE verifier should be kept in the current tab');
const pending=JSON.parse(localStorage.getItem('gsy.spotify.pkce.pending.v1'));
assert.equal(pending.state,state,'mobile recovery copy should use the same OAuth state');
assert.ok(pending.verifier,'mobile recovery copy should include the PKCE verifier');

// Simulate a mobile browser/app handoff recreating the tab and losing sessionStorage.
sessionStorage.clear();
location.href=`https://example.com/Guess-the-Song-Year/?code=test-code&state=${encodeURIComponent(state)}`;
location.search=`?code=test-code&state=${encodeURIComponent(state)}`;
await E.init();
assert.equal(initSawSession,true,'callback should restore PKCE state before the engine handles it');
assert.equal(localStorage.getItem('gsy.spotify.pkce.pending.v1'),null,'successful callback should clear the recovery copy');
assert.equal(sessionStorage.getItem('gsy.spotify.verifier'),null,'successful callback should clear PKCE verifier');

const devices=await E.spotifyDevices();
assert.equal(deviceCalls,2,'429 device lookup should retry exactly once');
assert.equal(devices[0].id,'phone');

const resolved=await E.resolveSong({title:'Song',artist:'Artist'},'spotify');
assert.equal(resolveCalls,2,'transient Spotify network resolution failure should retry exactly once');
assert.equal(resolved.id,'track');

console.log('Spotify mobile auth recovery and transient retry contract passed.');
