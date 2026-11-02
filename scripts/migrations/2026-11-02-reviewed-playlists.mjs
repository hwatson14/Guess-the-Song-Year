// Deterministic correction of the canonical song database using the explicitly
// reviewed source ledger. Never let a chart year overwrite an original release.
const norm=value=>String(value||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
const emptyProviders=()=>({spotify:{preferredId:null,links:[]},youtube:{preferredId:null,links:[]}});
const sourceMeta=(item,year)=>({
  releaseYear:year,
  source:'reviewed-playlist-curation-2026-11-02',
  sourceLabel:'Reviewed original release · source-backed',
  sourceUrl:item.sourceUrl,
  sourceProvider:item.sourceProvider||'Reviewed primary or chart source',
  releaseYearEvidence:item.evidence,
  releaseDateEvidence:String(year),
  evidenceState:'externally_observed',
  sourceRetrievalDate:'2026-11-02'
});
function membership(db,id,mode,year,item){
  if(db.memberships.some(m=>m.songId===id&&m.mode===mode)){
    throw new Error('Duplicate mode membership '+id+'/'+mode);
  }
  db.memberships.push({
    songId:id,mode,year,metadata:sourceMeta(item,year),
    fieldOrder:['title','artist','year','releaseYear','source','sourceLabel','sourceUrl','sourceProvider','releaseYearEvidence','releaseDateEvidence','evidenceState','sourceRetrievalDate','spotifyId','youtubeId','canonicalKey'],
    providerRefs:{spotify:null,youtube:null}
  });
}
export function applyReviewedPlaylistCorrections(db,spec){
  if(db.schemaVersion!==2||spec.schemaVersion!==1)throw new Error('Unexpected ledger/database schema');
  if(db.catalogue.version!==18)throw new Error('Expected unmodified v18 source; do not reapply to a completed migration');
  const result={corrections:[],newMasters:[],reused:[],retired:[],addedMemberships:[]};

  for(const item of spec.recordingYearCorrections){
    const song=db.songs[item.id];
    if(!song||song.release?.answerYear!==item.oldYear)throw new Error('Correction baseline mismatch '+item.id);
    const previous=structuredClone(song.release);
    song.release.rejectedClaims=[
      ...(previous.rejectedClaims||[]),
      ...(previous.claims||[]).map(claim=>({...claim,rejectedAt:'2026-11-02',reason:'superseded by source-specific original-release review'}))
    ];
    song.release.answerYear=item.year;
    song.release.year=item.year;
    song.release.state='externally_observed';
    song.release.claims=[{year:item.year,state:'externally_observed',sourceUrl:item.sourceUrl,evidence:item.evidence}];
    if(item.artist){
      const prior=String(song.canonicalKey);
      song.artist=item.artist;
      song.canonicalKey=item.canonicalKey;
      if(db.aliases[prior]&&db.aliases[prior]!==item.id)throw new Error('Legacy key already belongs to another master');
      db.aliases[prior]=item.id;
    }
    const matches=db.memberships.filter(m=>m.songId===item.id&&['greatest','australian','unexpected'].includes(m.mode));
    if(!matches.length)throw new Error('Corrected master lacks release-mode membership '+item.id);
    for(const m of matches){
      if(m.year!==item.oldYear)throw new Error('Correction membership-year mismatch '+item.id);
      m.year=item.year;
      const metadata=m.metadata||{};
      // Retire stale automated MusicBrainz release claims from the accepted
      // membership metadata. The old full source is retained in rejectedClaims.
      for(const field of ['musicbrainzId','yearEvidence','sourceRevisionId','sourceRevisionTimestamp','sourcePageId','evidenceDisposition']){
        delete metadata[field];
      }
      Object.assign(metadata,sourceMeta(item,item.year));
      m.metadata=metadata;
    }
    result.corrections.push({id:item.id,title:song.title,oldYear:item.oldYear,year:item.year,modes:matches.map(m=>m.mode)});
  }

  for(const item of spec.retiredNonSongs){
    const song=db.songs[item.songId],rows=db.memberships.filter(m=>m.songId===item.songId);
    if(!song||rows.length!==1||rows[0].mode!==item.mode)throw new Error('Retirement baseline mismatch '+item.songId);
    const aliasRefs=Object.entries(db.aliases).filter(([,id])=>id===item.songId);
    result.retired.push({...item,song:structuredClone(song),membership:structuredClone(rows[0]),aliases:aliasRefs});
    db.memberships=db.memberships.filter(m=>m.songId!==item.songId);
    for(const [key] of aliasRefs)delete db.aliases[key];
    delete db.songs[item.songId];
  }

  for(const item of spec.newCanonicalSongs){
    if(db.songs[item.id])throw new Error('New ID collides with existing master '+item.id);
    const canonicalKey=norm(item.title)+'|'+norm(item.artist);
    if(Object.values(db.songs).some(s=>s.canonicalKey===canonicalKey))throw new Error('Duplicate canonical song '+canonicalKey);
    db.songs[item.id]={
      id:item.id,canonicalKey,title:item.title,artist:item.artist,
      release:{answerYear:item.year,year:item.year,state:'externally_observed',
        claims:[{year:item.year,state:'externally_observed',sourceUrl:item.sourceUrl,evidence:item.evidence}]},
      providers:emptyProviders()
    };
    for(const mode of item.modes){
      membership(db,item.id,mode,item.year,item);
      result.addedMemberships.push({id:item.id,title:item.title,mode,year:item.year});
    }
    result.newMasters.push({id:item.id,title:item.title,year:item.year});
  }
  for(const item of spec.existingMasterMemberships){
    const song=db.songs[item.songId];
    if(!song||song.release.answerYear!==item.year)throw new Error('Reuse year mismatch '+item.songId);
    if(song.release.state==='unresolved'&&item.status==='source-verified'){
      song.release.year=item.year;
      song.release.state='externally_observed';
      song.release.claims=[...(song.release.claims||[]).filter(c=>c.year!==item.year||c.state!=='legacy_unverified'),
        {year:item.year,state:'externally_observed',sourceUrl:item.sourceUrl,evidence:item.evidence}];
    }
    membership(db,item.songId,item.mode,item.year,{...item,sourceProvider:'Official artist/discography source'});
    result.addedMemberships.push({id:item.songId,title:song.title,mode:item.mode,year:item.year});
    result.reused.push({id:item.songId,title:song.title,year:item.year});
  }

  db.catalogue.version=spec.targetCatalogueVersion;
  db.catalogue.generatedAt='2026-11-02';
  db.catalogue.sources.australian='Sourced Australian-first repertoire including corrected legacy years and wider mainstream artist coverage; unresolved legacy members remain Beta.';
  db.catalogue.sources.greatest='Original-release year hits, with reviewed corrections and balanced 12-plus minimum yearly pools; residual year and playback checks remain Beta.';
  return result;
}
