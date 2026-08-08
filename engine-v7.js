(() => {
  'use strict';

  const E=window.GSYEngine;
  if(!E)throw new Error('GSYEngine must load before engine-v7.js');

  const greatest=E.MODES?.greatest||{name:'Greatest Hits',short:'Hits',desc:'Big recognisable songs from the same year.'};
  E.MODES={greatest};

  const variant=/\b(karaoke|tribute|cover|live|remix|mix|acoustic|a cappella|acapella|backing|instrumental|bootleg|mashup|preview|playback|deluxe|remaster(?:ed)?|radio edit|radio version|single edit|single version|album version|extended(?: version| mix)?|club mix|dance mix|original mix|mono|stereo|sped up|slowed|re-record(?:ed)?|music video|video|take \d+|pt\.?\s*\d+|part \d+|third recording|special disco version)\b/i;
  const malformedArtist=/[a-zà-ÿ][A-Z]/;

  function norm(v){
    return String(v??'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
  }

  function baseTitle(v){
    let s=String(v??'').trim();
    // Remove only parenthetical/bracketed text that describes a version or featured-artist variant.
    s=s.replace(/[\[(]([^\])]+)[\])]/g,(whole,inside)=>{
      return variant.test(inside)||/^\s*(feat\.?|ft\.?|featuring|with)\b/i.test(inside)?' ':whole;
    });
    // Remove suffixes such as "- 2011 Remaster", "– Radio Edit" and "— Live".
    s=s.replace(/\s[-–—:]\s([^\n]+)$/,(whole,suffix)=>variant.test(suffix)?' ':whole);
    // Remove a trailing feature credit embedded in the title.
    s=s.replace(/\s+(feat\.?|ft\.?|featuring|with)\s+.+$/i,' ');
    return norm(s);
  }

  function primaryArtist(v){
    let s=String(v??'').trim();
    s=s.split(/\s+(?:feat\.?|ft\.?|featuring|with)\s+/i)[0];
    // Billboard sometimes credits a remix as "Lead Artist and Featured Artist".
    // Using the first credited artist intentionally groups that remix with the lead artist's original.
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
    if(!variant.test(String(song.title||'')))n+=4;
    if(!malformedArtist.test(String(song.artist||'')))n+=2;
    if(Number(song.mbScore||0)>=70)n+=1;
    // Prefer the catalogue's explicitly selected canonical/original entry.
    if(song.canonicalKey)n+=2;
    return n;
  }

  function dedupe(pool){
    const ranked=[...pool].sort((a,b)=>quality(b)-quality(a));
    const out=[],songs=new Set(),spotify=new Set(),youtube=new Set();
    for(const song of ranked){
      if(!song||!song.title||!song.artist)continue;
      const canonical=underlyingKey(song),sp=String(song.spotifyId||''),yt=String(song.youtubeId||'');
      if(!canonical||songs.has(canonical)||(sp&&spotify.has(sp))||(yt&&youtube.has(yt)))continue;
      songs.add(canonical);if(sp)spotify.add(sp);if(yt)youtube.add(yt);out.push(song);
    }
    return out;
  }

  E.songUnderlyingKey=underlyingKey;
  E.songUseKey=underlyingKey;
  E.chooseSong=async function(year,modeId='greatest',usedKeys=[]){
    if(modeId!=='greatest')throw new E.AppError('MODE_DISABLED','Only Greatest Hits is enabled in this version.');
    const data=await E.loadCatalogue();
    let pool=(data?.modes?.greatest?.[String(year)]||[]).filter(song=>Number(song?.year)===Number(year));
    pool=dedupe(pool);
    if(!pool.length)throw new E.AppError('NO_SONG',`No prebuilt Greatest Hits song is available for ${year}.`);

    const clean=pool.filter(song=>!variant.test(String(song.title||''))&&!malformedArtist.test(String(song.artist||'')));
    if(clean.length)pool=clean;

    const used=new Set(usedKeys||[]);
    const available=pool.filter(song=>!used.has(underlyingKey(song)));
    if(!available.length)throw new E.AppError('NO_UNUSED_SONG',`Every ${year} song in this game has already been used. Scan or deal a new card.`);

    return {...available[Math.floor(Math.random()*available.length)]};
  };
})();