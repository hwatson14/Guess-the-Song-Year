(() => {
  'use strict';

  const E=window.GSYEngine;
  if(!E)throw new Error('GSYEngine must load before engine-v7.js');

  const supported=['greatest','australian','unexpected','number1_us','number1_au'];
  for(const id of Object.keys(E.MODES||{}))if(!supported.includes(id))delete E.MODES[id];

  // Version words matter only in metadata-like annotations/suffixes. Genuine titles such as
  // "Live and Let Die" and "Another Brick in the Wall (Part II)" remain valid songs.
  const versionMarker=/\b(karaoke|tribute|demo|live|remix|re[- ]?mix|mix|mixed|edit|version|recording|master|radio|single|album|vocal|acoustic|unplugged|a cappella|acapella|backing(?: track)?|instrumental|strumentale|base musicale|bootleg|mashup|refix|rework|preview|playback|deluxe|bonus|voice note|alternate|alternative|original|rehearsal|session|concert|remaster(?:ed)?(?:\s*\d{4})?|radio edit|radio version|single edit|single version|album version|extended(?: version| edit| mix)?|club mix|dance mix|original mix|dub(?: version| mix)?|mono|stereo|sped up|slowed|re[- ]?record(?:ed)?|music video|video|video version|solo vocal|take \d+|pt\.?\s*\d+|special disco version|clean version|call out #1|jamie xx shuffle|gdp|space jesus|restrung|rumba 22)\b/i;
  const strongTrailingVersion=/\b(remix|re[- ]?mix|remaster(?:ed)?(?:\s*\d{4})?|radio edit|radio version|single edit|single version|album version|extended(?: version| edit| mix)?|club mix|dance mix|original mix|dub(?: version| mix)?|acoustic(?: version)?|unplugged|live version|instrumental(?: version)?|a cappella|acapella|sped up|slowed|re[- ]?record(?:ed)?|refix|rework|voice note|alternate version|alternative version|clean version)\s*$/i;
  // Joined credits such as "ArtistGuest" are malformed, but the single-letter
  // boundary in names like McCartney, LaBelle, and McDonald is legitimate.
  const malformedArtist=/(?:[a-zà-ÿ]{2,})[A-Z][a-zà-ÿ]{2,}/;
  const isMalformedArtist=artist=>malformedArtist.test(String(artist||''))&&!/^OneRepublic$/i.test(String(artist||'').trim());
  const soundtrackAttribution=/^\s*from\s+.+\boriginal\s+motion\s+picture\s+soundtrack\s*$/i;

  function norm(v){
    return String(v??'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
  }

  function isAlternateTitle(v){
    const s=String(v??'').trim();
    if(!s)return false;
    for(const m of s.matchAll(/\(([^)]*)\)|\[([^\]]*)\]/g)){
      const annotation=m[1]??m[2]??'';
      if(versionMarker.test(annotation)&&!soundtrackAttribution.test(annotation))return true;
    }
    const suffix=s.match(/\s[-–—:]\s(.+)$/);
    if(suffix&&versionMarker.test(suffix[1])&&!soundtrackAttribution.test(suffix[1]))return true;
    return strongTrailingVersion.test(s);
  }

  function baseTitle(v){
    let s=String(v??'').trim();
    s=s.replace(/\(([^)]*)\)/g,(whole,inside)=>soundtrackAttribution.test(inside)||(versionMarker.test(inside)&&!soundtrackAttribution.test(inside))||/^\s*(feat\.?|ft\.?|featuring|with)\b/i.test(inside)?' ':whole);
    s=s.replace(/\[([^\]]*)\]/g,(whole,inside)=>soundtrackAttribution.test(inside)||(versionMarker.test(inside)&&!soundtrackAttribution.test(inside))||/^\s*(feat\.?|ft\.?|featuring|with)\b/i.test(inside)?' ':whole);
    s=s.replace(/\s[-–—:]\s([^\n]+)$/,(whole,suffix)=>versionMarker.test(suffix)?' ':whole);
    // "with" is often real title text (Dancing with a Stranger, Break Up with Your Girlfriend...).
    s=s.replace(/\s+(feat\.?|ft\.?|featuring)\s+.+$/i,' ');
    if(strongTrailingVersion.test(s))s=s.replace(strongTrailingVersion,' ');
    return norm(s);
  }

  function primaryArtist(v){
    let s=String(v??'').trim();
    s=s.split(/\s+(?:feat\.?|ft\.?|featuring|with)\s+/i)[0];
    // A later remix can be billed "Lead Artist and Guest". For repeat identity we use the
    // lead artist so that the remix cannot masquerade as a new underlying song.
    s=s.split(/\s+(?:and|&)\s+/i)[0];
    return norm(s).replace(/^the\s+/,'');
  }

  function underlyingKey(song){
    if(song?.canonicalKey)return String(song.canonicalKey);
    return `${baseTitle(song?.title)}|${primaryArtist(song?.artist)}`;
  }

  function quality(song){
    let n=0;
    if(song.spotifyId)n+=4;
    if(song.youtubeId)n+=2;
    if(!isAlternateTitle(song.title))n+=4;
    if(!isMalformedArtist(song.artist))n+=2;
    if(Number(song.mbScore||0)>=70)n+=1;
    if(song.canonicalKey)n+=2;
    return n;
  }

  function dedupe(pool,allowAlternate=false){
    const ranked=[...pool].sort((a,b)=>quality(b)-quality(a));
    const out=[],songs=new Set(),spotify=new Set(),youtube=new Set();
    for(const song of ranked){
      if(!song||!song.title||!song.artist||(!allowAlternate&&isAlternateTitle(song.title)))continue;
      const canonical=underlyingKey(song),sp=String(song.spotifyId||''),yt=String(song.youtubeId||'');
      if(!canonical||songs.has(canonical)||(sp&&spotify.has(sp))||(yt&&youtube.has(yt)))continue;
      songs.add(canonical);if(sp)spotify.add(sp);if(yt)youtube.add(yt);out.push(song);
    }
    return out;
  }

  // Reporting, dealing and playback selection must agree on the usable pool.
  function usablePool(data,year,info){
    const chartMode=info.yearBasis==='chart';
    const raw=data?.modes?.[info.id]?.[String(year)];
    let pool=dedupe((Array.isArray(raw)?raw:[]).filter(song=>Number(song?.year)===Number(year)),chartMode);
    if(!chartMode){
      const clean=pool.filter(song=>!isMalformedArtist(song.artist));
      if(clean.length)pool=clean;
    }
    return pool;
  }

  E.songUnderlyingKey=underlyingKey;
  E.songUseKey=underlyingKey;
  E.isAlternateSongTitle=isAlternateTitle;
  E.modeReports=async function(){
    const data=await E.loadCatalogue(),reports={},required=Array.from({length:73},(_,i)=>1950+i),labels={ready:'Ready',beta:'Beta',preview:'Preview',building:'Building'},cardCounts=new Map();
    for(let cardId=1;cardId<=308;cardId++){const year=E.baseCardYear(cardId);cardCounts.set(year,(cardCounts.get(year)||0)+1)}
    for(const [id,info] of Object.entries(E.MODES||{})){
      const buckets=data?.modes?.[id]||{};
      const rawYears=Object.keys(buckets).map(Number).filter(y=>required.includes(y)&&Array.isArray(buckets[String(y)])&&buckets[String(y)].length).sort((a,b)=>a-b);
      const pools=Object.fromEntries(rawYears.map(year=>[year,usablePool(data,year,{...info,id})]));
      const years=rawYears.filter(year=>pools[year].length);
      const songs=rawYears.flatMap(y=>buckets[String(y)]),usableSongs=years.flatMap(year=>pools[year]);
      const minPool=years.length?Math.min(...years.map(year=>pools[year].length)):0;
      const yearSongKeys=Object.fromEntries(years.map(year=>[year,pools[year].map(underlyingKey)]));
      const songLegacyKeys=Object.fromEntries(years.map(year=>[year,Object.fromEntries(pools[year].filter(song=>Array.isArray(song.legacyKeys)&&song.legacyKeys.length).map(song=>[underlyingKey(song),song.legacyKeys.map(String)]))]));
      const canonical=!!songs.length&&songs.every(song=>song?.canonicalKey&&song?.musicbrainzId&&song?.yearEvidence==='MusicBrainz recording earliest first-release-date');
      const alternateLabels=songs.filter(song=>isAlternateTitle(song?.title)).length;
      const duplicateCount=field=>{const seen=new Set();let duplicates=0;for(const song of songs){const value=String(song?.[field]||'').trim();if(!value)continue;if(seen.has(value))duplicates++;seen.add(value)}return duplicates};
      const duplicatePlayback=duplicateCount('spotifyId')+duplicateCount('youtubeId');
      const duplicateCanonical=duplicateCount('canonicalKey')+duplicateCount('musicbrainzId');
      const complete=years.length===required.length;
      const fixedValid=info.repeatPolicy!=='fixed'||(complete&&years.every(year=>buckets[String(year)].length===1&&Number(buckets[String(year)][0]?.chartYear)===year));
      const chartEvidence=info.yearBasis!=='chart'||songs.every(song=>Number(song?.chartRank)===1&&String(song?.source||'').endsWith('eoy-1')&&String(song?.sourceLabel||'').trim());
      const greatestPoolValid=id!=='greatest'||(complete&&years.every(year=>pools[year].length>=Math.max(12,cardCounts.get(year)||0)));
      const readyEligible=complete&&canonical&&!alternateLabels&&!duplicatePlayback&&!duplicateCanonical&&fixedValid&&chartEvidence&&greatestPoolValid;
      const declaredStatus=String(info.status||'preview').toLowerCase();
      const status=declaredStatus==='ready'&&!readyEligible?'beta':declaredStatus;
      const statusLabel=labels[status]||'In development';
      const statusNote=status!==declaredStatus?`Readiness checks are incomplete. ${info.statusNote||''}`.trim():info.statusNote||'';
      reports[id]={id,status,statusLabel,coverage:years.length,totalYears:required.length,coverageLabel:`${years.length}/${required.length} years`,years,yearSongKeys,songLegacyKeys,songs:usableSongs.length,rawSongs:songs.length,rawCoverage:rawYears.length,minPool,canonical,alternateLabels,duplicatePlayback,duplicateCanonical,readyEligible,selectable:status!=='building'&&years.length>0,yearBasis:info.yearBasis||'release',repeatPolicy:info.repeatPolicy||'unique',statusNote};
    }
    return reports;
  };
  E.chooseSong=async function(year,modeId='greatest',usedKeys=[]){
    const info=E.MODES?.[modeId];
    if(!info||info.status==='building')throw new E.AppError('MODE_DISABLED','That music mode is not available.');
    const data=await E.loadCatalogue(),chartMode=info.yearBasis==='chart';
    const pool=usablePool(data,year,{...info,id:modeId});
    if(!pool.length)throw new E.AppError('MODE_YEAR_UNAVAILABLE',`${info.name} does not yet cover ${year}. ${chartMode?'Choose another mode.':'Scan or deal another card, or choose another mode.'}`);
    if(info.repeatPolicy==='fixed')return {...pool[0]};
    const used=new Set(usedKeys||[]),available=pool.filter(song=>{
      if(used.has(underlyingKey(song)))return false;
      return !(Array.isArray(song.legacyKeys)&&song.legacyKeys.some(key=>used.has(String(key))));
    });
    if(!available.length)throw new E.AppError('NO_UNUSED_SONG',`Every ${year} song in ${info.name} has already been used. Scan or deal a new card.`);
    return {...available[Math.floor(Math.random()*available.length)]};
  };
})();
