(() => {
  'use strict';

  const E=window.GSYEngine;
  if(!E)throw new Error('GSYEngine must load before engine-v7.js');

  const greatest=E.MODES?.greatest||{name:'Greatest Hits',short:'Hits',desc:'Big recognisable songs from the same year.'};
  E.MODES={greatest};

  // These words indicate a version only when they occur in version annotations/suffixes.
  // A blanket /live/ check would incorrectly reject genuine titles such as "Live and Let Die".
  const versionMarker=/\b(karaoke|tribute|demo|live|remix|re[- ]?mix|mix|acoustic|a cappella|acapella|backing(?: track)?|instrumental|bootleg|mashup|preview|playback|deluxe|remaster(?:ed)?(?:\s*\d{4})?|radio edit|radio version|single edit|single version|album version|extended(?: version| mix)?|club mix|dance mix|original mix|mono|stereo|sped up|slowed|re[- ]?record(?:ed)?|music video|video version|take \d+|special disco version|clean version)\b/i;
  const strongTrailingVersion=/\b(remix|re[- ]?mix|remaster(?:ed)?(?:\s*\d{4})?|radio edit|radio version|single edit|single version|album version|extended version|club mix|dance mix|original mix|acoustic version|live version|instrumental version|sped up|slowed|re[- ]?record(?:ed)?|clean version)\s*$/i;
  const malformedArtist=/[a-zà-ÿ][A-Z]/;

  function norm(v){
    return String(v??'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
  }

  function isAlternateTitle(v){
    const s=String(v??'').trim();
    if(!s)return false;
    for(const m of s.matchAll(/\(([^)]*)\)|\[([^\]]*)\]/g)){
      if(versionMarker.test(m[1]??m[2]??''))return true;
    }
    const suffix=s.match(/\s[-–—:]\s(.+)$/);
    if(suffix&&versionMarker.test(suffix[1]))return true;
    return strongTrailingVersion.test(s);
  }

  function baseTitle(v){
    let s=String(v??'').trim();
    s=s.replace(/\(([^)]*)\)/g,(whole,inside)=>versionMarker.test(inside)||/^\s*(feat\.?|ft\.?|featuring|with)\b/i.test(inside)?' ':whole);
    s=s.replace(/\[([^\]]*)\]/g,(whole,inside)=>versionMarker.test(inside)||/^\s*(feat\.?|ft\.?|featuring|with)\b/i.test(inside)?' ':whole);
    s=s.replace(/\s[-–—:]\s([^\n]+)$/,(whole,suffix)=>versionMarker.test(suffix)?' ':whole);
    s=s.replace(/\s+(feat\.?|ft\.?|featuring|with)\s+.+$/i,' ');
    if(strongTrailingVersion.test(s))s=s.replace(strongTrailingVersion,' ');
    return norm(s);
  }

  function primaryArtist(v){
    let s=String(v??'').trim();
    s=s.split(/\s+(?:feat\.?|ft\.?|featuring|with)\s+/i)[0];
    // Billboard can credit a later remix as "Lead Artist and Guest". For repeat identity,
    // use the lead artist so that remix cannot masquerade as a new song.
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
    if(!malformedArtist.test(String(song.artist||'')))n+=2;
    if(Number(song.mbScore||0)>=70)n+=1;
    if(song.canonicalKey)n+=2;
    return n;
  }

  function dedupe(pool){
    const ranked=[...pool].sort((a,b)=>quality(b)-quality(a));
    const out=[],songs=new Set(),spotify=new Set(),youtube=new Set();
    for(const song of ranked){
      if(!song||!song.title||!song.artist||isAlternateTitle(song.title))continue;
      const canonical=underlyingKey(song),sp=String(song.spotifyId||''),yt=String(song.youtubeId||'');
      if(!canonical||songs.has(canonical)||(sp&&spotify.has(sp))||(yt&&youtube.has(yt)))continue;
      songs.add(canonical);if(sp)spotify.add(sp);if(yt)youtube.add(yt);out.push(song);
    }
    return out;
  }

  E.songUnderlyingKey=underlyingKey;
  E.songUseKey=underlyingKey;
  E.isAlternateSongTitle=isAlternateTitle;
  E.chooseSong=async function(year,modeId='greatest',usedKeys=[]){
    if(modeId!=='greatest')throw new E.AppError('MODE_DISABLED','Only Greatest Hits is enabled in this version.');
    const data=await E.loadCatalogue();
    let pool=(data?.modes?.greatest?.[String(year)]||[]).filter(song=>Number(song?.year)===Number(year));
    pool=dedupe(pool);
    if(!pool.length)throw new E.AppError('NO_SONG',`No prebuilt Greatest Hits song is available for ${year}.`);

    const clean=pool.filter(song=>!isAlternateTitle(song.title)&&!malformedArtist.test(String(song.artist||'')));
    if(clean.length)pool=clean;

    const used=new Set(usedKeys||[]);
    const available=pool.filter(song=>!used.has(underlyingKey(song)));
    if(!available.length)throw new E.AppError('NO_UNUSED_SONG',`Every ${year} song in this game has already been used. Scan or deal a new card.`);

    return {...available[Math.floor(Math.random()*available.length)]};
  };
})();