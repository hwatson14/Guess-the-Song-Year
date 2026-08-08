(() => {
  'use strict';

  const E=window.GSYEngine;
  if(!E)throw new Error('GSYEngine must load before engine-v7.js');

  const greatest=E.MODES?.greatest||{name:'Greatest Hits',short:'Hits',desc:'Big recognisable songs from the same year.'};
  E.MODES={greatest};

  const variant=/\b(karaoke|tribute|cover|live|remix|mix|acoustic|a cappella|acapella|backing|instrumental|bootleg|mashup|preview|playback|deluxe|radio edit|single edit|single version|album version|music video|video|take \d+|third recording|special disco version)\b/i;
  const malformedArtist=/[a-zà-ÿ][A-Z]/;

  function useKey(song){
    return E.songKey(song);
  }

  function quality(song){
    let n=0;
    if(song.spotifyId)n+=4;
    if(song.youtubeId)n+=2;
    if(!variant.test(String(song.title||'')))n+=3;
    if(!malformedArtist.test(String(song.artist||'')))n+=2;
    if(Number(song.mbScore||0)>=70)n+=1;
    return n;
  }

  function dedupe(pool){
    const ranked=[...pool].sort((a,b)=>quality(b)-quality(a));
    const out=[],songs=new Set(),spotify=new Set(),youtube=new Set();
    for(const song of ranked){
      if(!song||!song.title||!song.artist)continue;
      const canonical=useKey(song),sp=String(song.spotifyId||''),yt=String(song.youtubeId||'');
      if(songs.has(canonical)||(sp&&spotify.has(sp))||(yt&&youtube.has(yt)))continue;
      songs.add(canonical);if(sp)spotify.add(sp);if(yt)youtube.add(yt);out.push(song);
    }
    return out;
  }

  E.songUseKey=useKey;
  E.chooseSong=async function(year,modeId='greatest',usedKeys=[]){
    if(modeId!=='greatest')throw new E.AppError('MODE_DISABLED','Only Greatest Hits is enabled in this version.');
    const data=await E.loadCatalogue();
    let pool=(data?.modes?.greatest?.[String(year)]||[]).filter(song=>Number(song?.year)===Number(year));
    pool=dedupe(pool);
    if(!pool.length)throw new E.AppError('NO_SONG',`No prebuilt Greatest Hits song is available for ${year}.`);

    const clean=pool.filter(song=>!variant.test(String(song.title||''))&&!malformedArtist.test(String(song.artist||'')));
    if(clean.length)pool=clean;

    const used=new Set(usedKeys||[]);
    const available=pool.filter(song=>!used.has(useKey(song)));
    if(!available.length)throw new E.AppError('NO_UNUSED_SONG',`Every ${year} song in this game has already been used. Scan or deal a new card.`);

    return {...available[Math.floor(Math.random()*available.length)]};
  };
})();
