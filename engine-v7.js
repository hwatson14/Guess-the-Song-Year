(() => {
  'use strict';

  const E=window.GSYEngine;
  if(!E)throw new Error('GSYEngine must load before engine-v7.js');

  const greatest=E.MODES?.greatest||{name:'Greatest Hits',short:'Hits',desc:'Big recognisable songs from the same year.'};
  E.MODES={greatest};

  // Version words matter only in metadata-like annotations/suffixes. Genuine titles such as
  // "Live and Let Die" and "Another Brick in the Wall (Part II)" remain valid songs.
  const versionMarker=/\b(karaoke|tribute|demo|live|remix|re[- ]?mix|mix|edit|version|recording|master|radio|single|album|vocal|acoustic|unplugged|a cappella|acapella|backing(?: track)?|instrumental|strumentale|base musicale|bootleg|mashup|refix|rework|preview|playback|deluxe|bonus|voice note|alternate|alternative|original|rehearsal|session|concert|remaster(?:ed)?(?:\s*\d{4})?|radio edit|radio version|single edit|single version|album version|extended(?: version| edit| mix)?|club mix|dance mix|original mix|dub(?: version| mix)?|mono|stereo|sped up|slowed|re[- ]?record(?:ed)?|music video|video version|solo vocal|take \d+|pt\.?\s*\d+|special disco version|clean version)\b/i;
  const strongTrailingVersion=/\b(remix|re[- ]?mix|remaster(?:ed)?(?:\s*\d{4})?|radio edit|radio version|single edit|single version|album version|extended(?: version| edit| mix)?|club mix|dance mix|original mix|dub(?: version| mix)?|acoustic(?: version)?|unplugged|live version|instrumental(?: version)?|a cappella|acapella|sped up|slowed|re[- ]?record(?:ed)?|refix|rework|voice note|alternate version|alternative version|clean version)\s*$/i;
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