import fs from 'node:fs';

const DB_PATH='data/song-database.json';
const MODES_PATH='data/modes.json';
const REVIEW_PATH='verification/mode-expansion/reviewed-mode-relationships.json';
const REPORT_PATH='verification/mode-expansion/promotion-report.json';
const SOURCE='reviewed-mode-expansion-v1';

const db=JSON.parse(fs.readFileSync(DB_PATH,'utf8'));
const manifest=JSON.parse(fs.readFileSync(MODES_PATH,'utf8'));
const review=JSON.parse(fs.readFileSync(REVIEW_PATH,'utf8'));
if(db.schemaVersion!==2)throw new Error('Expected schemaVersion 2 song database');
if(review.schemaVersion!==1)throw new Error('Expected reviewed mode expansion schemaVersion 1');

const norm=value=>String(value??'').replace(/&/g,' and ').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
const titleOptions=rel=>new Set([rel.title,...(rel.titleAliases||[])].map(norm).filter(Boolean));
const artistOptions=rel=>new Set([rel.artist,...(rel.artistAliases||[])].map(norm).filter(Boolean));
const songs=Object.values(db.songs||{});
const pairsBySong=new Map(songs.map(song=>[song.id,new Set([`${norm(song.title)}|${norm(song.artist)}`])]));
for(const membership of db.memberships||[]){
  const song=db.songs[membership.songId];if(!song)continue;
  const title=membership.displayOverrides?.title??song.title;
  const artist=membership.displayOverrides?.artist??song.artist;
  pairsBySong.get(song.id)?.add(`${norm(title)}|${norm(artist)}`);
}

function matchesFor(rel){
  const titles=titleOptions(rel),artists=artistOptions(rel),matches=[];
  for(const song of songs){
    const pairs=pairsBySong.get(song.id)||new Set();
    if([...pairs].some(pair=>{const split=pair.lastIndexOf('|');return titles.has(pair.slice(0,split))&&artists.has(pair.slice(split+1))}))matches.push(song);
  }
  return matches;
}

function ensureProviderLink(song,provider,id,evidence,reviewedAt){
  if(!id)return;
  song.providers??={};
  const bucket=song.providers[provider]??={preferredId:null,links:[]};
  bucket.links=Array.isArray(bucket.links)?bucket.links:[];
  const url=provider==='spotify'?`https://open.spotify.com/track/${id}`:`https://www.youtube.com/watch?v=${id}`;
  let asset=bucket.links.find(item=>item.id===id);
  const verifiedEvidence={recordingMatch:true,checkedAt:`${reviewedAt}T00:00:00Z`,sourceUrl:evidence?.url||null,label:evidence?.label||null};
  if(!asset){asset={id,url,state:'verified',origin:SOURCE,evidence:verifiedEvidence};bucket.links.push(asset)}
  else{asset.url=url;asset.state='verified';asset.origin=asset.origin||SOURCE;asset.evidence={...(asset.evidence||{}),...verifiedEvidence}}
}

// Rebuild only memberships previously created by this deterministic promotion source.
db.memberships=(db.memberships||[]).filter(m=>m.metadata?.curationSource!==SOURCE);
const report={reviewedAt:review.reviewedAt||null,source:SOURCE,promoted:{movie_themes:0,tv_themes:0,screen_themes:0,remix_original_year:0},years:{},unresolved:[],ambiguous:[],conflicts:[]};
const yearSets={movie_themes:new Set(),tv_themes:new Set(),remix_original_year:new Set()};

for(const mode of ['movie_themes','tv_themes']){
  for(const rel of review.screenRelationships?.[mode]||[]){
    const matches=matchesFor(rel);
    if(matches.length===0){report.unresolved.push({relationshipId:rel.relationshipId,mode,title:rel.title,artist:rel.artist});continue}
    if(matches.length>1){report.ambiguous.push({relationshipId:rel.relationshipId,mode,songIds:matches.map(s=>s.id)});continue}
    const song=matches[0],workType=mode==='movie_themes'?'movie':'tv',workAnswerYear=Number(rel.workAnswerYear);
    db.memberships.push({
      songId:song.id,mode,year:workAnswerYear,
      metadata:{
        relationshipId:rel.relationshipId,relationshipType:'screen-work-theme',curationSource:SOURCE,
        screenWorkId:rel.workId,workType,workTitle:rel.workTitle,workAnswerYear,
        // Compatibility display aliases; canonical compiler semantics use workType/workTitle above.
        screenWorkType:workType,screenWorkTitle:rel.workTitle,
        themeRole:rel.role||'theme',workYearEvidence:rel.evidence||null,
        source:`mode-expansion:${mode}`,sourceLabel:`${rel.workTitle} · ${workAnswerYear}`
      }
    });
    report.promoted[mode]++;yearSets[mode].add(workAnswerYear);
  }
}

for(const rel of review.remixRelationships||[]){
  const matches=matchesFor(rel);
  if(matches.length===0){report.unresolved.push({relationshipId:rel.relationshipId,mode:'remix_original_year',title:rel.title,artist:rel.artist});continue}
  if(matches.length>1){report.ambiguous.push({relationshipId:rel.relationshipId,mode:'remix_original_year',songIds:matches.map(s=>s.id)});continue}
  const song=matches[0],answerYear=Number(rel.originalAnswerYear),canonicalYear=Number(song.release?.answerYear);
  if(canonicalYear!==answerYear){report.conflicts.push({relationshipId:rel.relationshipId,songId:song.id,reviewedYear:answerYear,canonicalYear});continue}
  if(!rel.spotifyId&&!rel.youtubeId){report.unresolved.push({relationshipId:rel.relationshipId,mode:'remix_original_year',reason:'no reviewed provider recording'});continue}
  ensureProviderLink(song,'spotify',String(rel.spotifyId||''),rel.playbackEvidence,review.reviewedAt);
  ensureProviderLink(song,'youtube',String(rel.youtubeId||''),rel.playbackEvidence,review.reviewedAt);
  const providerRefs={};if(rel.spotifyId)providerRefs.spotify=String(rel.spotifyId);if(rel.youtubeId)providerRefs.youtube=String(rel.youtubeId);
  db.memberships.push({
    songId:song.id,mode:'remix_original_year',year:answerYear,providerRefs,
    metadata:{
      relationshipId:rel.relationshipId,relationshipType:'reviewed-remix',curationSource:SOURCE,
      playbackVariant:'remix',remixTitle:rel.remixTitle,remixer:rel.remixer||null,
      originalAnswerYear:answerYear,originalYearEvidence:rel.yearEvidence||null,remixPlaybackEvidence:rel.playbackEvidence||null,
      source:'mode-expansion:remix-original-year',sourceLabel:`${rel.remixTitle} · answer ${answerYear}`
    }
  });
  report.promoted.remix_original_year++;yearSets.remix_original_year.add(answerYear);
}

report.promoted.screen_themes=report.promoted.movie_themes+report.promoted.tv_themes;
report.years.movie_themes=[...yearSets.movie_themes].sort((a,b)=>a-b);
report.years.tv_themes=[...yearSets.tv_themes].sort((a,b)=>a-b);
report.years.screen_themes=[...new Set([...yearSets.movie_themes,...yearSets.tv_themes])].sort((a,b)=>a-b);
report.years.remix_original_year=[...yearSets.remix_original_year].sort((a,b)=>a-b);

function preview(id,count,note){
  const mode=manifest.modes?.[id];if(!mode)throw new Error(`Missing mode definition ${id}`);
  if(count<=0)return;
  mode.status='preview';mode.statusLabel='Preview';mode.statusNote=note;
}
preview('movie_themes',report.promoted.movie_themes,`${report.promoted.movie_themes} reviewed movie relationships are playable; remaining seed candidates stay excluded pending evidence/canonical review.`);
preview('tv_themes',report.promoted.tv_themes,`${report.promoted.tv_themes} reviewed TV relationships are playable; remaining seed candidates stay excluded pending evidence/canonical review.`);
preview('screen_themes',report.promoted.screen_themes,`Derived automatically from the ${report.promoted.movie_themes} reviewed Movie and ${report.promoted.tv_themes} reviewed TV relationships; no independent source catalogue.`);
preview('remix_original_year',report.promoted.remix_original_year,`${report.promoted.remix_original_year} reviewed remix recordings are playable; answer year and no-repeat identity stay tied to the canonical original.`);

if(!report.promoted.movie_themes||!report.promoted.tv_themes||!report.promoted.remix_original_year)throw new Error(`Promotion did not produce all required source previews: ${JSON.stringify(report.promoted)}`);

fs.writeFileSync(DB_PATH,JSON.stringify(db,null,2)+'\n');
fs.writeFileSync(MODES_PATH,JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(REPORT_PATH,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
