(() => {
  'use strict';

  const E=window.GSYEngine;
  if(!E)throw new Error('GSYEngine must load before mode-expansion.js');

  const modeMeta={
    movie_themes:{name:'Movie Themes',short:'Movies',desc:"Hear a recognisable movie song or theme and place the movie's release year.",status:'preview',statusLabel:'Preview',statusNote:'Reviewed preview relationships only; more seed candidates are being verified.',yearBasis:'screen',repeatPolicy:'unique'},
    tv_themes:{name:'TV Themes',short:'TV',desc:"Hear a TV theme or signature song and place the show's Season 1 / premiere year.",status:'preview',statusLabel:'Preview',statusNote:'Reviewed preview relationships only; more seed candidates are being verified.',yearBasis:'screen',repeatPolicy:'unique'},
    screen_themes:{name:'TV & Movie Themes',short:'Screen',desc:'Movie and TV theme relationships combined from the two source modes.',status:'preview',statusLabel:'Preview',statusNote:'Derived automatically from reviewed Movie Themes and TV Themes relationships.',yearBasis:'screen',repeatPolicy:'unique',compositeOf:['movie_themes','tv_themes']},
    remix_original_year:{name:'Remix: Original Year',short:'Remix',desc:"Hear a reviewed remix, but place the original song's release year.",status:'preview',statusLabel:'Preview',statusNote:'Only explicit reviewed remix recordings are playable; original song identity and year remain canonical.',yearBasis:'original',repeatPolicy:'unique'}
  };
  Object.assign(E.MODES,modeMeta);

  const baseLoadCatalogue=E.loadCatalogue.bind(E);
  const baseResolveSong=E.resolveSong.bind(E);
  let overlayPromise=null,expandedPromise=null,diagnostics=null;

  const norm=value=>String(value??'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
  const primaryArtist=value=>norm(String(value??'').split(/feat\.|ft\.|featuring|&|,| and /i)[0]).replace(/^the\s+/,'');
  const titleOptions=rel=>[rel.title,...(Array.isArray(rel.titleAliases)?rel.titleAliases:[])].map(norm).filter(Boolean);
  const artistOptions=rel=>[rel.artist,...(Array.isArray(rel.artistAliases)?rel.artistAliases:[])].map(primaryArtist).filter(Boolean);
  const songIdentity=song=>String(song?.songId||song?.canonicalKey||`${norm(song?.title)}|${primaryArtist(song?.artist)}`);

  function candidateScore(song){
    let n=0;
    if(song?.songId)n+=8;
    if(song?.canonicalKey)n+=4;
    if(song?.musicbrainzId)n+=3;
    if(song?.yearEvidence==='MusicBrainz recording earliest first-release-date')n+=3;
    if(!song?.chartYear)n+=2;
    if(song?.spotifyId)n+=1;
    if(song?.youtubeId)n+=1;
    return n;
  }

  function canonicalIndex(data){
    const best=new Map();
    for(const buckets of Object.values(data?.modes||{}))for(const bucket of Object.values(buckets||{}))for(const song of Array.isArray(bucket)?bucket:[]){
      if(!song?.title||!song?.artist)continue;
      const id=songIdentity(song),prior=best.get(id);
      if(!prior||candidateScore(song)>candidateScore(prior))best.set(id,song);
    }
    return [...best.values()];
  }

  function findCanonical(rows,rel,expectedYear=null){
    const titles=new Set(titleOptions(rel)),artists=new Set(artistOptions(rel));
    let matches=rows.filter(song=>titles.has(norm(song.title))&&artists.has(primaryArtist(song.artist)));
    if(Number.isFinite(Number(expectedYear))){
      const yearMatches=matches.filter(song=>Number(song.year)===Number(expectedYear));
      if(yearMatches.length)matches=yearMatches;
    }
    const identities=new Map();
    for(const song of matches){const id=songIdentity(song),prior=identities.get(id);if(!prior||candidateScore(song)>candidateScore(prior))identities.set(id,song)}
    return [...identities.values()].sort((a,b)=>candidateScore(b)-candidateScore(a));
  }

  function addBucket(target,year,song){
    const key=String(Number(year));
    if(!target[key])target[key]=[];
    target[key].push(song);
  }

  function screenSong(base,rel,modeId){
    const releaseAnswerYear=Number(base.year)||null,workAnswerYear=Number(rel.workAnswerYear);
    return {
      ...base,
      year:workAnswerYear,
      relationshipId:rel.relationshipId,
      relationshipType:'screen-work-theme',
      screenMode:modeId,
      screenWorkId:rel.workId,
      screenWorkTitle:rel.workTitle,
      screenWorkType:modeId==='movie_themes'?'movie':'tv',
      workAnswerYear,
      canonicalReleaseAnswerYear:releaseAnswerYear,
      themeRole:rel.role||'theme',
      yearEvidence:`Screen-work answer year: ${rel.evidence?.label||rel.workTitle}`,
      workYearEvidence:rel.evidence||null,
      source:`mode-expansion:${modeId}`,
      sourceLabel:`${rel.workTitle} · ${workAnswerYear}`
    };
  }

  function remixSong(base,rel){
    return {
      ...base,
      year:Number(rel.originalAnswerYear),
      relationshipId:rel.relationshipId,
      relationshipType:'reviewed-remix',
      playbackVariant:'remix',
      remixTitle:rel.remixTitle,
      remixer:rel.remixer,
      spotifyId:String(rel.spotifyId||''),
      youtubeId:String(rel.youtubeId||''),
      originalAnswerYear:Number(rel.originalAnswerYear),
      originalYearEvidence:rel.yearEvidence||null,
      remixPlaybackEvidence:rel.playbackEvidence||null,
      source:'mode-expansion:remix-original-year',
      sourceLabel:`${rel.remixTitle} · answer ${rel.originalAnswerYear}`
    };
  }

  async function loadOverlay(){
    if(overlayPromise)return overlayPromise;
    overlayPromise=fetch('./data/mode-expansion.json?v=1.0.0',{cache:'no-store'}).then(async response=>{
      if(!response.ok)throw new E.AppError('MODE_EXPANSION_UNAVAILABLE','The extra mode catalogue is unavailable.',response.status);
      const data=await response.json();
      if(Number(data?.schemaVersion)!==1)throw new E.AppError('MODE_EXPANSION_INVALID','The extra mode catalogue is invalid.');
      return data;
    });
    return overlayPromise;
  }

  async function buildExpandedCatalogue(){
    const [base,overlay]=await Promise.all([baseLoadCatalogue(),loadOverlay()]);
    const rows=canonicalIndex(base),modes={...base.modes},unresolved=[],ambiguous=[];
    const built={movie_themes:{},tv_themes:{},screen_themes:{},remix_original_year:{}};

    for(const modeId of ['movie_themes','tv_themes'])for(const rel of overlay?.screenRelationships?.[modeId]||[]){
      const matches=findCanonical(rows,rel);
      if(!matches.length){unresolved.push(rel.relationshipId);continue}
      if(matches.length>1){ambiguous.push({relationshipId:rel.relationshipId,identities:matches.map(songIdentity)});continue}
      addBucket(built[modeId],rel.workAnswerYear,screenSong(matches[0],rel,modeId));
    }

    for(const modeId of ['movie_themes','tv_themes'])for(const [year,pool] of Object.entries(built[modeId]))for(const song of pool)addBucket(built.screen_themes,year,{...song,screenMode:'screen_themes',sourceMode:modeId});

    for(const rel of overlay?.remixRelationships||[]){
      const matches=findCanonical(rows,rel,rel.originalAnswerYear);
      if(!matches.length){unresolved.push(rel.relationshipId);continue}
      if(matches.length>1){ambiguous.push({relationshipId:rel.relationshipId,identities:matches.map(songIdentity)});continue}
      if(!rel.spotifyId||!rel.youtubeId){unresolved.push(`${rel.relationshipId}:provider`);continue}
      addBucket(built.remix_original_year,rel.originalAnswerYear,remixSong(matches[0],rel));
    }

    diagnostics={
      unresolved,
      ambiguous,
      counts:Object.fromEntries(Object.entries(built).map(([id,buckets])=>[id,Object.values(buckets).reduce((n,pool)=>n+pool.length,0)])),
      reviewedAt:overlay.reviewedAt||null
    };
    if(unresolved.length||ambiguous.length)console.warn('Mode expansion relationships excluded',diagnostics);
    Object.assign(modes,built);
    return {...base,modes};
  }

  E.loadCatalogue=async function(){
    if(!expandedPromise)expandedPromise=buildExpandedCatalogue().catch(error=>{expandedPromise=null;throw error});
    return expandedPromise;
  };

  E.modeExpansionDiagnostics=()=>diagnostics?JSON.parse(JSON.stringify(diagnostics)):null;

  E.resolveSong=async function(song,kind=E.getProvider()){
    if(song?.playbackVariant==='remix'){
      const explicit=kind==='spotify'?song.spotifyId:kind==='youtube'?song.youtubeId:'';
      if(!explicit)throw new E.AppError('REMIX_PROVIDER_UNAVAILABLE',`No reviewed ${kind} recording is available for this remix.`);
    }
    return baseResolveSong(song,kind);
  };
})();
