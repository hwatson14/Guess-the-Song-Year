(() => {
  'use strict';

  const P=window.GSYAppPolicy;if(!P)throw new Error('GSYAppPolicy must load before engine.js');

  const YEAR_MAP=[null,1976,1987,1981,1960,2016,2013,2002,1990,1990,1976,1969,1989,1984,1984,1992,2005,1983,1988,2016,1960,2017,2013,1962,2010,1994,1995,2016,1981,2003,1976,2007,1966,1980,1973,1972,1979,1987,1979,1985,2020,1993,1988,1981,1999,1967,2004,1973,1998,1987,2005,2007,2019,2009,1977,1968,2004,1994,2012,1997,2013,1972,1966,1978,1976,2012,2008,1998,1990,1998,1978,2009,2009,1978,1958,1983,2012,2018,1991,1978,1979,1972,2005,1950,1985,2017,2006,1995,2015,1994,1953,1982,1991,1983,1971,1989,1997,1994,2014,1997,1968,2007,1983,2003,1990,1955,1979,1996,1976,1986,1957,1965,2021,2016,1957,2019,1959,2004,2008,1969,1965,2014,2007,1970,2010,1960,1986,2000,1972,2000,1983,1982,2004,2003,1989,1992,1996,1982,2022,1989,1984,1998,2000,1999,1951,1999,1963,1958,2021,2022,2012,2016,2000,2001,1977,1976,2019,1997,1987,1973,1971,1974,1978,1985,1982,1985,1967,2008,1989,1995,2011,2008,1988,1976,2009,1975,1974,2020,1997,2003,2012,2010,1997,2007,2013,1990,1989,2005,2001,1970,1965,1995,1991,2011,2014,2003,2010,2002,2014,1983,1958,1995,1984,2016,1988,1985,2014,1961,1996,1997,1956,1994,1992,1999,2005,2002,1986,1987,1995,1996,1975,1984,2008,1964,1993,2000,1986,1965,1968,2011,1962,1994,2007,1981,2001,1980,2009,1980,1973,1996,1963,1990,2006,1982,2002,1954,2006,2021,1961,2000,1987,2001,1983,2021,2020,1977,1994,2018,1982,2006,1970,1954,1994,2000,2002,1983,2005,2003,2019,1966,1967,2006,1981,1971,1969,1978,1975,2004,1952,1973,1975,1973,2022,2017,1972,2011,1977,2007,1992,1977,2020,2017,2018,2008,2010,1963,2006,1971,1977,2001,1979,2018,1966,1958,1975,1970,1974,1968,2010];

  const MODES={
    greatest:{name:'Greatest Hits',short:'Hits',desc:'Big recognisable songs released in the card year.',status:'beta',statusLabel:'Beta',statusNote:'Playable legacy list; 77 entries have external release-year evidence and 2022 is still being filled.',yearBasis:'release',repeatPolicy:'unique'},
    australian:{name:'Australian',short:'Australian',desc:'Australian artists and homegrown favourites released in the card year.',status:'beta',statusLabel:'Beta',statusNote:'Playable curated list; cross-year repeats are reconciled and five card years are not covered yet.',yearBasis:'release',repeatPolicy:'unique'},
    unexpected:{name:'Unexpected Years',short:'Unexpected',desc:'Songs whose real release year is surprisingly early or late.',status:'preview',statusLabel:'Preview',statusNote:'Sparse curated preview; virtual play deals only supported years.',yearBasis:'release',repeatPolicy:'unique'},
    number1_us:{name:'#1 US',short:'#1 US',desc:'The US year-end chart leader for the card year.',status:'beta',statusLabel:'Beta',statusNote:'Complete chart-year list; one fixed leader per year may repeat.',yearBasis:'chart',repeatPolicy:'fixed'},
    number1_au:{name:'#1 Australia',short:'#1 AU',desc:'The Australian year-end chart leader for the card year.',status:'beta',statusLabel:'Beta',statusNote:'Complete chart-year list; one fixed leader per year may repeat.',yearBasis:'chart',repeatPolicy:'fixed'}
  };

  const SPOTIFY_CLIENT_ID='c088fe548e9b4f6c886bce6b0db64e16';
  const YOUTUBE_API_KEY='AIzaSyDJvhC5aEQES30hAcwNhc3-eeAR_WWE0K8';
  const LS={provider:'gsy.provider.v6',token:'gsy.spotifyToken.v6',device:'gsy.spotifyDevice.v6',cache:'gsy.resolveCache.v6',cardYears:'gsy.cardYearOverrides.v1'};
  const SCOPES='user-read-playback-state user-modify-playback-state';
  const YOUTUBE_CACHE_TTL_MS=7*24*60*60*1000;
  const YOUTUBE_MATCH_POLICY='title-artist-v1';

  let provider=localStorage.getItem(LS.provider)||'youtube';
  let spotifyToken=loadJSON(LS.token,null);
  let spotifyDevice=localStorage.getItem(LS.device)||'';
  let resolveCache=loadJSON(LS.cache,{});
  let cardYearOverrides=loadJSON(LS.cardYears,{});
  if(!cardYearOverrides||typeof cardYearOverrides!=='object'||Array.isArray(cardYearOverrides))cardYearOverrides={};
  let catalogue=null,cataloguePromise=null,modeManifest=null,modeManifestPromise=null;
  let ytApiPromise=null,ytPlayer=null,ytRequestGeneration=0,ytActiveRequest=null,spotifyPlaybackChain=Promise.resolve();

  class AppError extends Error{
    constructor(code,message,status=0){super(message);this.name='AppError';this.code=code;this.status=status}
  }

  function loadJSON(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
  function saveJSON(key,value){localStorage.setItem(key,JSON.stringify(value))}
  function cleanText(v){return String(v??'').trim()}
  function norm(v){return cleanText(v).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim()}
  function tokenSet(v){return new Set(norm(v).split(' ').filter(Boolean))}
  function similarity(a,b){const aa=tokenSet(a),bb=tokenSet(b);if(!aa.size||!bb.size)return 0;let n=0;for(const x of aa)if(bb.has(x))n++;return n/Math.max(aa.size,bb.size)}
  function mainArtist(v){return cleanText(v).split(/feat\.|ft\.|&|,| and /i)[0].trim()}
  function songKey(s){return `${norm(s.title)}|${norm(s.artist)}`}
  function randomString(n){const a=crypto.getRandomValues(new Uint8Array(n));return [...a].map(x=>(x%36).toString(36)).join('')}
  async function sha256(value){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
  function redirectUri(){const u=new URL('./',location.href);u.search='';u.hash='';return u.href}
  function parseCardId(raw){return P.parseCardId(raw)}
  function baseCardYear(id){return Number(YEAR_MAP[Number(id)])||0}
  function cardYearReference(id){
    const cardId=Number(id),baseYear=baseCardYear(cardId);
    const override=P.normalizeCardYear(cardYearOverrides[String(cardId)]);
    return {cardId,baseYear,year:override??baseYear,overridden:override!==null};
  }
  function cardYear(id){return cardYearReference(id).year}
  function setCardYearReference(id,rawYear){
    const cardId=Number(id);
    if(!Number.isInteger(cardId)||cardId<1||cardId>308)throw new AppError('INVALID_CARD_ID','Card number must be between 1 and 308.');
    const year=P.normalizeCardYear(rawYear);
    if(year===null)throw new AppError('INVALID_CARD_YEAR',`Enter a four-digit year between ${P.CARD_YEAR_MIN} and ${P.CARD_YEAR_MAX}.`);
    const key=String(cardId),baseYear=baseCardYear(cardId);
    if(year===baseYear)delete cardYearOverrides[key];
    else cardYearOverrides[key]=year;
    saveJSON(LS.cardYears,cardYearOverrides);
    return cardYearReference(cardId);
  }
  function setProvider(v){if(!['youtube','spotify'].includes(v))return;provider=v;localStorage.setItem(LS.provider,v)}
  function getProvider(){return provider}

  async function init(){
    migrateLegacy();
    await handleSpotifyCallback();
    await Promise.all([loadModeManifest(),loadCatalogue()]);
    if(isSpotifyConnected()&&provider!=='spotify'&&!localStorage.getItem(LS.provider)){setProvider('spotify')}
    return true;
  }

  function migrateLegacy(){
    const oldProvider=localStorage.getItem('gsy.provider');if(oldProvider&&!localStorage.getItem(LS.provider))setProvider(oldProvider);
    const oldToken=loadJSON('gsy.token',null);
    if(oldToken){
      if(!spotifyToken){spotifyToken=oldToken;saveJSON(LS.token,spotifyToken)}
      localStorage.removeItem('gsy.token');
    }
    const oldDevice=localStorage.getItem('gsy.device');if(oldDevice&&!spotifyDevice){spotifyDevice=oldDevice;localStorage.setItem(LS.device,spotifyDevice)}
  }

  async function loadModeManifest(){
    if(modeManifest)return modeManifest;
    if(modeManifestPromise)return modeManifestPromise;
    modeManifestPromise=fetch('./data/modes.json?v=1',{cache:'no-store'}).then(async r=>{
      if(!r.ok)throw new Error('mode manifest unavailable');
      const data=await r.json();
      for(const [id,meta] of Object.entries(data?.modes||{})){
        if(MODES[id]&&meta&&typeof meta==='object')Object.assign(MODES[id],meta);
      }
      modeManifest=data;return data;
    }).catch(()=>{modeManifest={version:0,modes:MODES};return modeManifest}).finally(()=>modeManifestPromise=null);
    return modeManifestPromise;
  }

  async function loadCatalogue(){
    if(catalogue)return catalogue;
    if(cataloguePromise)return cataloguePromise;
    cataloguePromise=fetch('./data/catalogue.json?v=7.6.1',{cache:'no-store'}).then(async r=>{
      if(!r.ok)throw new AppError('CATALOGUE_UNAVAILABLE','The song catalogue is unavailable. Reload the app in a moment.',r.status);
      const data=await r.json();
      if(!data?.modes)throw new AppError('CATALOGUE_INVALID','The song catalogue is invalid.');
      catalogue=data;return data;
    }).finally(()=>cataloguePromise=null);
    return cataloguePromise;
  }

  function modePool(data,modeId,year){
    if(!MODES[modeId])return [];
    return data?.modes?.[modeId]?.[String(year)]||[];
  }

  async function chooseSong(year,modeId,usedKeys=[]){
    const data=await loadCatalogue();
    const pool=modePool(data,modeId,year).filter(Boolean);
    if(!pool.length)throw new AppError('MODE_YEAR_UNAVAILABLE',`${MODES[modeId]?.name||'This mode'} does not yet cover ${year}.`);
    if(modeId==='number1_us'||modeId==='number1_au'||modeId==='number1')return {...pool[0]};
    const used=new Set(usedKeys||[]);
    let available=pool.filter(s=>!used.has(songKey(s)));
    if(!available.length)available=pool;
    return {...available[Math.floor(Math.random()*available.length)]};
  }

  function cacheGet(kind,song){const entry=resolveCache[`${kind}:${songKey(song)}`];return entry&&String(entry.catalogueId||'')===String(song[kind+'Id']||'')?entry:null}
  function cachePut(kind,song,value){resolveCache[`${kind}:${songKey(song)}`]={...value,catalogueId:String(song[kind+'Id']||''),cachedAt:Number(value.cachedAt)||Date.now()};saveJSON(LS.cache,resolveCache)}
  function cacheDrop(kind,song){delete resolveCache[`${kind}:${songKey(song)}`];saveJSON(LS.cache,resolveCache)}
  function cacheDropYoutubeCandidate(song,id){
    if(!song)return;
    const entry=cacheGet('youtube',song);if(!entry?.ids?.length)return;
    const ids=entry.ids.filter(candidate=>candidate!==id);
    if(ids.length)cachePut('youtube',song,{...entry,ids,cachedAt:entry.cachedAt});else cacheDrop('youtube',song);
  }
  function decodeHtml(value){return String(value??'').replace(/&(#x?[0-9a-f]+|amp|apos|quot|lt|gt);/gi,(m,code)=>{const named={amp:'&',apos:"'",quot:'"',lt:'<',gt:'>'};if(named[code.toLowerCase()])return named[code.toLowerCase()];const lower=code.toLowerCase();const n=lower[0]==='#'?(lower[1]==='x'?parseInt(lower.slice(2),16):parseInt(lower.slice(1),10)):NaN;return Number.isFinite(n)?String.fromCodePoint(n):m})}
  function normalizedProviderText(value){return norm(decodeHtml(value).replace(/[’']/g,''))}
  function providerTokens(value){return normalizedProviderText(value).split(' ').filter(Boolean)}
  function artistTokens(value){return providerTokens(value).filter(token=>!['official','audio','video','music','topic','vevo','records','recordings','channel'].includes(token))}
  function youtubeCandidateAllowed(video,song){
    if(!video||!song)return false;
    const metadataFreeTitle=decodeHtml(video.title).replace(/\bofficial\s+(?:music\s+)?(?:video|audio|lyrics)\b/gi,' ');
    const title=normalizedProviderText(metadataFreeTitle),expectedTitle=normalizedProviderText(song.title);
    if(!expectedTitle||!(` ${title} `).includes(` ${expectedTitle} `))return false;
    const expectedArtist=providerTokens(mainArtist(song.artist)).filter(token=>token!=='the');
    const actualArtist=providerTokens(`${metadataFreeTitle} ${String(video.channel||'').replace(/vevo\b/gi,'')}`);
    const compactChannel=artistTokens(video.channel).join('').replace(/vevo$/,'');
    if(!expectedArtist.length||(!expectedArtist.every(token=>actualArtist.includes(token))&&compactChannel!==expectedArtist.join('')))return false;
    const alternate=/\b(karaoke|reaction|cover|tribute|sped up|slowed|nightcore|remix|re[- ]?mix|live)\b/i;
    const sourceText=`${video.title||''} ${video.channel||''}`;
    const expectedText=String(song.title||'');
    if(alternate.test(sourceText)){
      for(const marker of ['karaoke','reaction','cover','tribute','sped up','slowed','nightcore','remix','re-mix','live']){
        const pattern=new RegExp(`\\b${marker.replace('-','[- ]?')}\\b`,'i');
        if(pattern.test(sourceText)&&!pattern.test(expectedText))return false;
      }
    }
    return true;
  }
  function clearResolveCache(){resolveCache={};localStorage.removeItem(LS.cache)}

  async function resolveSong(song,kind=provider){
    if(kind==='spotify')return resolveSpotify(song);
    return resolveYouTube(song);
  }

  async function resolveSpotify(song){
    if(!isSpotifyConnected())throw new AppError('SPOTIFY_NOT_CONNECTED','Connect the Spotify Premium account first.');
    const cached=cacheGet('spotify',song);
    if(cached?.id){
      try{const t=await spotifyApi(`/tracks/${encodeURIComponent(cached.id)}`);return spotifyTrack(t)}
      catch(err){if(err?.status!==404)throw err}
    }
    if(song.spotifyId){
      try{const t=await spotifyApi(`/tracks/${encodeURIComponent(song.spotifyId)}`);cachePut('spotify',song,{id:t.id});return spotifyTrack(t)}
      catch(err){if(err?.status!==404)throw err}
    }
    const queries=[`track:${song.title} artist:${mainArtist(song.artist)}`,`${song.title} ${mainArtist(song.artist)}`];
    let best=null,bestScore=-99;
    for(const q of queries){
      const d=await spotifyApi(`/search?q=${encodeURIComponent(q)}&type=track&limit=10`);
      for(const t of d?.tracks?.items||[]){
        const title=t.name||'',artist=(t.artists||[]).map(a=>a.name).join(' ');
        const titleSimilarity=similarity(title,song.title),artistSimilarity=similarity(artist,song.artist);
        if(titleSimilarity<0.75||artistSimilarity<0.45)continue;
        let score=titleSimilarity*2.5+artistSimilarity*1.5;
        if(/karaoke|tribute|cover|sped up|slowed|remaster|live/i.test(title)&&!/(live|remaster)/i.test(song.title||''))score-=1.2;
        if(score>bestScore){best=t;bestScore=score}
      }
      if(best&&bestScore>=2.2)break;
    }
    if(!best||bestScore<2.2)throw new AppError('SPOTIFY_TRACK_NOT_FOUND',`Spotify could not find a reliable match for “${song.title}”.`);
    cachePut('spotify',song,{id:best.id});return spotifyTrack(best);
  }

  function spotifyTrack(t){return {provider:'spotify',id:t.id,uri:t.uri,url:t.external_urls?.spotify||`https://open.spotify.com/track/${t.id}`,title:t.name,artist:(t.artists||[]).map(a=>a.name).join(', ')}}

  async function resolveYouTube(song){
    const cached=cacheGet('youtube',song);
    if(cached?.ids?.length){
      // Legacy entries remain readable, but are validated once and stamped into the
      // current cache format so deleted/private uploads do not stick indefinitely.
      const hasTimestamp=Number(cached.cachedAt)>0,age=hasTimestamp?Date.now()-Number(cached.cachedAt):0;
      if(!hasTimestamp||age<=YOUTUBE_CACHE_TTL_MS){
        const valid=(await validateYouTubeIds(cached.ids)).filter(video=>youtubeCandidateAllowed(video,song));const ids=valid.map(x=>x.id);
        if(ids.length){cachePut('youtube',song,{...cached,ids});return {provider:'youtube',matchPolicy:YOUTUBE_MATCH_POLICY,videoId:ids[0],candidateIds:[...ids],url:`https://www.youtube.com/watch?v=${ids[0]}`,title:song.title,artist:song.artist,song};}
        cacheDrop('youtube',song);
      }else cacheDrop('youtube',song);
    }
    let ids=[];
    if(song.youtubeId)ids.push(song.youtubeId);
    if(ids.length){const valid=(await validateYouTubeIds(ids)).filter(video=>youtubeCandidateAllowed(video,song));ids=valid.map(x=>x.id)}
    if(!ids.length){
      const q=`${song.title} ${mainArtist(song.artist)} official audio`;
      const url=`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&videoSyndicated=true&maxResults=8&safeSearch=none&regionCode=AU&q=${encodeURIComponent(q)}&key=${encodeURIComponent(YOUTUBE_API_KEY)}`;
      const r=await fetch(url);const payload=await r.json().catch(()=>({}));
      if(!r.ok){const quota=/quota/i.test(payload?.error?.message||'');throw new AppError(quota?'YOUTUBE_QUOTA':'YOUTUBE_SEARCH_FAILED',quota?'YouTube search quota is temporarily exhausted. Use Spotify or try again later.':`YouTube search failed (${r.status}).`,r.status)}
      const raw=(payload.items||[]).map(x=>({id:x.id?.videoId,title:x.snippet?.title||'',channel:x.snippet?.channelTitle||''})).filter(x=>x.id);
      const valid=(await validateYouTubeIds(raw.map(x=>x.id))).filter(video=>youtubeCandidateAllowed(video,song));
      const byId=new Map(valid.map(x=>[x.id,x]));
      valid.sort((a,b)=>youtubeScore(byId.get(b.id),song)-youtubeScore(byId.get(a.id),song));
      ids=valid.map(x=>x.id);
    }
    if(!ids.length)throw new AppError('YOUTUBE_VIDEO_NOT_FOUND',`YouTube could not find an embeddable version of “${song.title}”.`);
    cachePut('youtube',song,{ids});
    return {provider:'youtube',matchPolicy:YOUTUBE_MATCH_POLICY,videoId:ids[0],candidateIds:[...ids],url:`https://www.youtube.com/watch?v=${ids[0]}`,title:song.title,artist:song.artist,song};
  }

  async function validateYouTubeIds(ids){
    if(!ids.length)return [];
    const url=`https://www.googleapis.com/youtube/v3/videos?part=status,snippet&id=${encodeURIComponent(ids.join(','))}&key=${encodeURIComponent(YOUTUBE_API_KEY)}`;
    const r=await fetch(url);const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new AppError('YOUTUBE_VALIDATE_FAILED','YouTube could not validate the candidate videos.',r.status);
    return (d.items||[]).filter(x=>x.status?.embeddable!==false&&x.status?.privacyStatus!=='private'&&x.status?.uploadStatus!=='rejected').map(x=>({id:x.id,title:x.snippet?.title||'',channel:x.snippet?.channelTitle||''}));
  }

  function youtubeScore(v,song){if(!v)return 0;const text=`${v.title||''} ${v.channel||''}`;let n=similarity(text,`${song.title} ${song.artist}`)*4;if(/official audio|official video|topic/i.test(text))n+=1.7;if(/karaoke|reaction|cover|tribute|sped up|slowed|nightcore|remix|live/i.test(text)&&!/(live|remix)/i.test(song.title||''))n-=2;return n}

  async function loadYouTubeApi(){
    if(window.YT?.Player)return;
    if(ytApiPromise)return ytApiPromise;
    ytApiPromise=new Promise((resolve,reject)=>{
      let settled=false,apiTimeout=null;
      const succeed=()=>{if(settled)return;settled=true;clearTimeout(apiTimeout);resolve()};
      const fail=err=>{if(settled)return;settled=true;clearTimeout(apiTimeout);reject(err)};
      const prior=window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady=()=>{try{prior?.()}catch{}succeed()};
      const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.async=true;s.onerror=()=>fail(new AppError('YOUTUBE_PLAYER_LOAD','Could not load the YouTube player.'));document.head.appendChild(s);
      apiTimeout=setTimeout(()=>window.YT?.Player?succeed():fail(new AppError('YOUTUBE_PLAYER_LOAD','YouTube did not finish loading. Check the connection and retry.')),8000);
    }).catch(err=>{ytApiPromise=null;throw err});
    return ytApiPromise;
  }

  function cancelYouTubeRequest(request,destroy=true){
    if(!request)return;
    clearTimeout(request.readyTimer);clearTimeout(request.fallbackTimer);
    if(destroy){try{request.player?.destroy?.()}catch{}}
    request.cancel?.();
  }

  async function playYouTube(containerId,resolved,onState=()=>{}){
    const generation=++ytRequestGeneration;
    const previousRequest=ytActiveRequest;
    cancelYouTubeRequest(previousRequest);
    if(ytPlayer&&ytPlayer!==previousRequest?.player){try{ytPlayer.destroy?.()}catch{}}
    ytPlayer=null;
    let cancelStartup;
    const startupCancelled=new Promise(resolve=>{cancelStartup=()=>resolve(true)});
    const request={generation,player:null,readyTimer:null,fallbackTimer:null,cancel:cancelStartup};
    ytActiveRequest=request;
    const cancelled=await Promise.race([loadYouTubeApi().then(()=>false),startupCancelled]);
    if(cancelled||generation!==ytRequestGeneration||ytActiveRequest!==request)return {cancelled:true,started:false,needsTap:false};
    const ids=[...(resolved.candidateIds||[resolved.videoId])];
    return new Promise((resolve,reject)=>{
      let idx=0,settled=false,started=false,player=null;
      const clearTimers=()=>{clearTimeout(request.readyTimer);clearTimeout(request.fallbackTimer);request.readyTimer=null;request.fallbackTimer=null};
      const ownsPlayer=()=>generation===ytRequestGeneration&&ytActiveRequest===request&&ytPlayer===player;
      const finish=value=>{if(settled)return;settled=true;clearTimers();resolve(value)};
      const fail=e=>{if(settled)return;settled=true;clearTimers();reject(e)};
      request.cancel=()=>finish({cancelled:true,started:false,needsTap:false});
      const playIndex=()=>{request.fallbackTimer=null;if(!ownsPlayer())return;const id=ids[idx];if(!id)return fail(new AppError('YOUTUBE_PLAY_FAILED','No playable YouTube version was found.'));if(player?.loadVideoById){player.loadVideoById(id);try{player.playVideo()}catch{}}};
      ytActiveRequest=request;
      try{
        player=new YT.Player(containerId,{videoId:ids[0],playerVars:{autoplay:1,controls:1,playsinline:1,rel:0,origin:location.origin},events:{
          onReady:e=>{if(!ownsPlayer()||e.target!==player)return;try{player.playVideo()}catch{};request.readyTimer=setTimeout(()=>{request.readyTimer=null;if(ownsPlayer()&&!started)finish({started:false,needsTap:true,videoId:ids[idx]})},6500)},
          onStateChange:e=>{if(!ownsPlayer()||e.target!==player)return;onState(e.data);if(e.data===YT.PlayerState.PLAYING){started=true;const chosen=ids[idx];if(resolved.song){const rest=ids.filter(x=>x!==chosen);cachePut('youtube',resolved.song,{ids:[chosen,...rest]})}finish({started:true,needsTap:false,videoId:chosen})}},
          onError:e=>{if(!ownsPlayer()||e.target!==player)return;cacheDropYoutubeCandidate(resolved.song,ids[idx]);if(idx<ids.length-1){idx++;clearTimeout(request.fallbackTimer);request.fallbackTimer=setTimeout(playIndex,150)}else fail(new AppError('YOUTUBE_PLAY_FAILED','The available YouTube versions could not be played. Try Spotify or another card.'))}
        }});
        request.player=player;ytPlayer=player;
      }catch(e){if(ytActiveRequest===request)ytActiveRequest=null;fail(e)}
    });
  }
  function youtubePlayer(){return ytPlayer}
  function pauseYouTube(){try{ytPlayer?.pauseVideo?.()}catch{}}
  function resumeYouTube(){try{if(!ytPlayer?.playVideo)return false;ytPlayer.playVideo();return true}catch{return false}}
  function replayYouTube(){try{if(!ytPlayer?.playVideo)return false;ytPlayer.seekTo?.(0,true);ytPlayer.playVideo();return true}catch{return false}}
  function destroyYouTube(){
    ytRequestGeneration++;
    const request=ytActiveRequest;ytActiveRequest=null;
    const player=ytPlayer;ytPlayer=null;
    cancelYouTubeRequest(request);
    if(player&&player!==request?.player){try{player.destroy?.()}catch{}}
  }

  async function spotifyConnect(){
    const verifier=randomString(72),state=randomString(24),challenge=await sha256(verifier);
    sessionStorage.setItem('gsy.spotify.verifier',verifier);sessionStorage.setItem('gsy.spotify.state',state);
    const p=new URLSearchParams({client_id:SPOTIFY_CLIENT_ID,response_type:'code',redirect_uri:redirectUri(),scope:SCOPES,code_challenge_method:'S256',code_challenge:challenge,state,show_dialog:'false'});
    location.href=`https://accounts.spotify.com/authorize?${p}`;
  }

  async function handleSpotifyCallback(){
    const p=new URLSearchParams(location.search);const code=p.get('code');
    if(p.get('error')){history.replaceState({},document.title,redirectUri());throw new AppError('SPOTIFY_AUTH',`Spotify authorization failed: ${p.get('error')}`)}
    if(!code)return false;
    const verifier=sessionStorage.getItem('gsy.spotify.verifier'),state=sessionStorage.getItem('gsy.spotify.state');
    if(!verifier||!state||state!==p.get('state')){history.replaceState({},document.title,redirectUri());throw new AppError('SPOTIFY_AUTH_STATE','Spotify login state was lost. Connect again.')}
    const body=new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirectUri(),client_id:SPOTIFY_CLIENT_ID,code_verifier:verifier});
    const r=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
    const t=await r.json().catch(()=>({}));
    sessionStorage.removeItem('gsy.spotify.verifier');sessionStorage.removeItem('gsy.spotify.state');history.replaceState({},document.title,new URL('./',location.href).pathname);
    if(!r.ok)throw new AppError('SPOTIFY_TOKEN',`Spotify connection failed (${r.status}).`,r.status);
    setSpotifyToken(t);setProvider('spotify');return true;
  }

  function setSpotifyToken(t){spotifyToken={...spotifyToken,...t,refresh_token:t.refresh_token||spotifyToken?.refresh_token,expires_at:Date.now()+Number(t.expires_in||3600)*1000};saveJSON(LS.token,spotifyToken)}
  function isSpotifyConnected(){return !!(spotifyToken?.access_token&&spotifyToken?.refresh_token)}
  function spotifyDisconnect(){spotifyToken=null;localStorage.removeItem(LS.token);localStorage.removeItem('gsy.token');spotifyDevice='';localStorage.removeItem(LS.device);if(provider==='spotify')setProvider('youtube')}

  async function spotifyAccessToken(forceRefresh=false){
    if(!spotifyToken?.access_token)throw new AppError('SPOTIFY_NOT_CONNECTED','Spotify is not connected.');
    if(!forceRefresh&&Date.now()<(spotifyToken.expires_at||0)-60000)return spotifyToken.access_token;
    if(!spotifyToken.refresh_token)throw new AppError('SPOTIFY_REAUTH','Spotify needs to be connected again.');
    const body=new URLSearchParams({grant_type:'refresh_token',refresh_token:spotifyToken.refresh_token,client_id:SPOTIFY_CLIENT_ID});
    const r=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});const t=await r.json().catch(()=>({}));
    if(!r.ok){if(t.error==='invalid_grant'){spotifyDisconnect();throw new AppError('SPOTIFY_REAUTH','Spotify authorization expired. Connect Spotify once to renew it.',r.status)}throw new AppError('SPOTIFY_REFRESH',`Spotify refresh failed (${r.status}).`,r.status)}
    setSpotifyToken(t);return spotifyToken.access_token;
  }

  async function spotifyApi(path,opt={},noJson=false,retried=false){
    const access=await spotifyAccessToken();
    const r=await fetch(`https://api.spotify.com/v1${path}`,{...opt,headers:{Authorization:`Bearer ${access}`,...(opt.headers||{})}});
    if(r.status===401&&!retried){await spotifyAccessToken(true);return spotifyApi(path,opt,noJson,true)}
    if(r.status===204)return null;
    if(!r.ok){let detail='';try{const d=await r.json();detail=d?.error?.message||d?.error_description||''}catch{}throw new AppError('SPOTIFY_API',detail||`Spotify API ${r.status}`,r.status)}
    return noJson?null:r.json();
  }

  async function spotifyDevices(){
    if(!isSpotifyConnected())return [];
    const d=await spotifyApi('/me/player/devices');const devices=d?.devices||[];
    if(spotifyDevice&&!devices.some(x=>x.id===spotifyDevice)){spotifyDevice='';localStorage.removeItem(LS.device)}
    return devices;
  }
  function setSpotifyDevice(id){spotifyDevice=id||'';if(spotifyDevice)localStorage.setItem(LS.device,spotifyDevice);else localStorage.removeItem(LS.device)}
  function getSpotifyDevice(){return spotifyDevice}

  async function ensureSpotifyDevice(){
    const devices=await spotifyDevices();
    if(!devices.length)throw new AppError('NO_SPOTIFY_DEVICE','Open Spotify on the phone or speaker you want to use and play/pause any song once, then try again.');
    let chosen=devices.find(x=>x.id===spotifyDevice)||devices.find(x=>x.is_active)||devices[0];
    if(!chosen.is_active){
      try{await spotifyApi('/me/player',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({device_ids:[chosen.id],play:false})},true)}catch(e){if(e.status!==404)throw e}
      await new Promise(r=>setTimeout(r,250));
    }
    return chosen.id;
  }

  async function playSpotifyNow(uri){
    if(!uri)throw new AppError('SPOTIFY_TRACK_MISSING','Spotify track is missing.');
    const pinned=!!spotifyDevice;
    let id=await ensureSpotifyDevice();
    const body=JSON.stringify({uris:[uri],position_ms:0});
    try{await spotifyApi(`/me/player/play?device_id=${encodeURIComponent(id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body},true);return id}
    catch(e){
      if(e.status===404){
        const devices=await spotifyDevices();const fallback=devices.find(x=>x.is_active)||devices[0];
        if(fallback){if(pinned)setSpotifyDevice(fallback.id);id=fallback.id;try{await spotifyApi('/me/player',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({device_ids:[id],play:false})},true);await new Promise(r=>setTimeout(r,300));await spotifyApi(`/me/player/play?device_id=${encodeURIComponent(id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body},true);return id}catch(fallbackErr){if(fallbackErr?.status!==404)throw fallbackErr}}
        throw new AppError('SPOTIFY_DEVICE_LOST','Spotify lost the playback device. Open Spotify on the target device, play/pause once, then retry.',404);
      }
      if(e.status===403)throw new AppError('SPOTIFY_FORBIDDEN','Spotify rejected playback control. Confirm the connected account has Premium and Spotify is open on the target device.',403);
      throw e;
    }
  }
  function enqueueSpotifyPlayback(task){const run=spotifyPlaybackChain.then(task,task);spotifyPlaybackChain=run.catch(()=>{});return run}
  function playSpotify(uri){return enqueueSpotifyPlayback(()=>playSpotifyNow(uri))}
  // The command queue owns all Spotify device side effects; callers must await the wrapper.
  function pauseSpotify(){return enqueueSpotifyPlayback(async()=>{const id=await ensureSpotifyDevice();await spotifyApi(`/me/player/pause?device_id=${encodeURIComponent(id)}`,{method:'PUT'},true)})}

  async function diagnostics(){
    const out=[];out.push({ok:YEAR_MAP.length===309&&YEAR_MAP[67]===1998,text:'308-card year map'});
    try{const c=await loadCatalogue();const years=Object.keys(c?.modes?.greatest||{}).length;out.push({ok:years>=60,text:`Static catalogue: ${years} years`})}catch(e){out.push({ok:false,text:e.message})}
    out.push({ok:!!YOUTUBE_API_KEY,text:'YouTube API key configured'});
    out.push({ok:isSpotifyConnected(),text:isSpotifyConnected()?'Spotify connected':'Spotify not connected'});
    if(isSpotifyConnected()){try{const d=await spotifyDevices();out.push({ok:d.length>0,text:`Spotify devices: ${d.length}`})}catch(e){out.push({ok:false,text:e.message})}}
    return out;
  }

  window.GSYEngine={
    MODES,YEAR_MAP,init,loadModeManifest,loadCatalogue,parseCardId,baseCardYear,cardYearReference,cardYear,setCardYearReference,chooseSong,songKey,
    setProvider,getProvider,resolveSong,clearResolveCache,
    isSpotifyConnected,spotifyConnect,spotifyDisconnect,spotifyDevices,setSpotifyDevice,getSpotifyDevice,playSpotify,pauseSpotify,
    playYouTube,pauseYouTube,resumeYouTube,replayYouTube,destroyYouTube,youtubePlayer,
    redirectUri,diagnostics,AppError
  };
})();
