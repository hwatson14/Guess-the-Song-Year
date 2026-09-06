(() => {
  'use strict';

  const E=window.GSYEngine;
  if(!E)throw new Error('GSYEngine must load before spotify-stability.js');

  const CLIENT_ID='c088fe548e9b4f6c886bce6b0db64e16';
  const PENDING_KEY='gsy.spotify.pkce.pending.v1';
  const VERIFIER_KEY='gsy.spotify.verifier';
  const STATE_KEY='gsy.spotify.state';
  const PENDING_TTL_MS=15*60*1000;
  const RETRY_DELAY_MS=900;

  const original={
    init:E.init,
    resolveSong:E.resolveSong,
    spotifyDevices:E.spotifyDevices,
    playSpotify:E.playSpotify,
    pauseSpotify:E.pauseSpotify,
  };

  function loadPending(){
    try{return JSON.parse(localStorage.getItem(PENDING_KEY))||null}catch{return null}
  }
  function clearPending(){
    try{localStorage.removeItem(PENDING_KEY)}catch{}
    try{sessionStorage.removeItem(VERIFIER_KEY);sessionStorage.removeItem(STATE_KEY)}catch{}
  }
  function savePending(verifier,state){
    const pending={verifier,state,createdAt:Date.now()};
    sessionStorage.setItem(VERIFIER_KEY,verifier);
    sessionStorage.setItem(STATE_KEY,state);
    localStorage.setItem(PENDING_KEY,JSON.stringify(pending));
  }
  function pendingIsFresh(pending){
    return !!(pending?.verifier&&pending?.state&&Number(pending.createdAt)>0&&Date.now()-Number(pending.createdAt)<=PENDING_TTL_MS);
  }
  function restoreCallbackState(){
    const params=new URLSearchParams(location.search);
    const callbackState=params.get('state');
    if(!params.get('code')&&!params.get('error'))return false;
    if(sessionStorage.getItem(VERIFIER_KEY)&&sessionStorage.getItem(STATE_KEY))return true;
    const pending=loadPending();
    if(!pendingIsFresh(pending)){if(pending)clearPending();return false}
    if(callbackState&&callbackState!==pending.state)return false;
    sessionStorage.setItem(VERIFIER_KEY,pending.verifier);
    sessionStorage.setItem(STATE_KEY,pending.state);
    return true;
  }
  function randomString(length){
    const bytes=crypto.getRandomValues(new Uint8Array(length));
    return [...bytes].map(value=>(value%36).toString(36)).join('');
  }
  async function sha256(value){
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
    return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function redirectUri(){
    if(typeof E.redirectUri==='function')return E.redirectUri();
    const url=new URL('./',location.href);url.search='';url.hash='';return url.href;
  }
  function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
  function isNetworkError(error){
    return error?.name==='TypeError'||/failed to fetch|network|load failed|internet connection/i.test(String(error?.message||''));
  }
  function isTransient(error){
    const status=Number(error?.status)||0;
    return status===429||status===500||status===502||status===503||status===504||isNetworkError(error);
  }
  function friendlyError(error){
    if(error?.code==='SPOTIFY_REAUTH'||error?.code==='SPOTIFY_NOT_CONNECTED'||error?.code==='SPOTIFY_FORBIDDEN'||error?.code==='NO_SPOTIFY_DEVICE'||error?.code==='SPOTIFY_DEVICE_LOST')return error;
    if(Number(error?.status)===429)return new E.AppError('SPOTIFY_RATE_LIMIT','Spotify is temporarily rate-limiting requests. Try again in a moment.',429);
    if(isNetworkError(error))return new E.AppError('SPOTIFY_NETWORK','Spotify could not be reached. Check the connection and try again.');
    return error;
  }
  async function retryTransient(task){
    try{return await task()}
    catch(first){
      if(!isTransient(first))throw friendlyError(first);
      await sleep(RETRY_DELAY_MS);
      try{return await task()}catch(second){throw friendlyError(second)}
    }
  }

  E.spotifyConnect=async function(){
    clearPending();
    const verifier=randomString(72),state=randomString(24),challenge=await sha256(verifier);
    savePending(verifier,state);
    const params=new URLSearchParams({
      client_id:CLIENT_ID,
      response_type:'code',
      redirect_uri:redirectUri(),
      scope:'user-read-playback-state user-modify-playback-state',
      code_challenge_method:'S256',
      code_challenge:challenge,
      state,
      show_dialog:'false',
    });
    location.href=`https://accounts.spotify.com/authorize?${params}`;
  };

  E.init=async function(...args){
    const hadCallback=/[?&](?:code|error)=/.test(location.search);
    restoreCallbackState();
    try{
      const result=await original.init.apply(E,args);
      if(hadCallback||E.isSpotifyConnected())clearPending();
      return result;
    }catch(error){
      if(hadCallback)clearPending();
      throw friendlyError(error);
    }
  };

  E.spotifyDevices=(...args)=>retryTransient(()=>original.spotifyDevices.apply(E,args));
  E.playSpotify=(...args)=>retryTransient(()=>original.playSpotify.apply(E,args));
  E.pauseSpotify=(...args)=>retryTransient(()=>original.pauseSpotify.apply(E,args));
  E.resolveSong=(song,kind=E.getProvider?.())=>kind==='spotify'
    ?retryTransient(()=>original.resolveSong.call(E,song,kind))
    :original.resolveSong.call(E,song,kind);

  E.spotifyStability={pendingKey:PENDING_KEY,pendingTtlMs:PENDING_TTL_MS};
})();
