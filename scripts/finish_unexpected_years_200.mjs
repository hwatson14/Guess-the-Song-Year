import fs from 'node:fs';
import {compileDatabase} from './song_database.mjs';
import {catalogueEngine,loadProductionCatalogue} from './catalogue_runtime.mjs';

const databasePath='data/song-database.json';
const cataloguePath='data/catalogue.json';
const auditPath='verification/unexpected-years-200-selection.json';
const targetTotal=200;
const write=process.argv.includes('--write');
const db=JSON.parse(fs.readFileSync(databasePath,'utf8'));
const seed=JSON.parse(fs.readFileSync(auditPath,'utf8'));
const {data,manifest}=loadProductionCatalogue();
const E=catalogueEngine(data,manifest);

const corrections=[
  {
    songId:'song_5789f221c273cdaae0dd',
    title:'I Will Survive',
    year:1978,
    sourceUrl:'https://www.gloriagaynor.com/videos/i-will-survive/',
    sourceProvider:'Gloria Gaynor official website',
    releaseDateEvidence:'1978',
    evidence:'Gloria Gaynor’s official site labels I Will Survive as 1978; UMG recording metadata also carries a 1978 phonographic copyright. The prior accepted 1977 claim was rejected during the Unexpected Years review.'
  },
  {
    songId:'song_2305a63b8f720bd2d23a',
    title:'Sweet Dreams (Are Made Of This)',
    year:1983,
    sourceUrl:'https://www.eurythmics.com/history/',
    sourceProvider:'Eurythmics official website',
    releaseDateEvidence:'1983',
    evidence:'Eurythmics’ official history dates the Sweet Dreams (Are Made of This) album to 4 January 1983 and documents the title single in the February 1983 UK chart cycle. The prior accepted 1982 claim was rejected during the Unexpected Years review.'
  }
];

function correctReleaseTruth(correction){
  const song=db.songs[correction.songId];
  if(!song)throw new Error(`Missing correction target ${correction.songId}`);
  if(song.title!==correction.title)throw new Error(`Correction identity mismatch for ${correction.songId}: ${song.title}`);
  const previousYear=Number(song.release?.answerYear);
  const claims=(song.release?.claims||[]).filter(c=>!(c.state==='externally_observed'&&Number(c.year)!==correction.year));
  if(!claims.some(c=>c.state==='externally_observed'&&Number(c.year)===correction.year&&c.sourceUrl===correction.sourceUrl)){
    claims.push({year:correction.year,state:'externally_observed',sourceUrl:correction.sourceUrl,evidence:correction.evidence});
  }
  song.release={...song.release,answerYear:correction.year,year:correction.year,state:'externally_observed',claims};

  let legacyRowsUpdated=0;
  for(const membership of db.memberships.filter(m=>m.songId===correction.songId)){
    const info=manifest.modes[membership.mode];
    if(info?.yearBasis!=='release')continue;
    const meta=membership.metadata??={};
    const carriesLegacyReleaseEvidence=Object.hasOwn(meta,'releaseYear')||Object.hasOwn(meta,'releaseYearEvidence')||Object.hasOwn(meta,'evidenceState');
    if(!carriesLegacyReleaseEvidence)continue;
    meta.releaseYear=correction.year;
    meta.releaseYearEvidence=correction.evidence;
    meta.evidenceState='externally_observed';
    if(Object.hasOwn(meta,'sourceUrl'))meta.sourceUrl=correction.sourceUrl;
    if(Object.hasOwn(meta,'sourceProvider'))meta.sourceProvider=correction.sourceProvider;
    if(Object.hasOwn(meta,'releaseDateEvidence'))meta.releaseDateEvidence=correction.releaseDateEvidence;
    if(Object.hasOwn(meta,'yearEvidence'))meta.yearEvidence='Manually reviewed release-year correction';
    if(Object.hasOwn(meta,'musicbrainzId'))delete meta.musicbrainzId;
    legacyRowsUpdated++;
  }
  return {songId:correction.songId,title:correction.title,previousYear,answerYear:correction.year,sourceUrl:correction.sourceUrl,legacyRowsUpdated};
}

const correctionResults=corrections.map(correctReleaseTruth);

const currentUnexpected=db.memberships.filter(m=>m.mode==='unexpected');
const currentUnexpectedIds=new Set(currentUnexpected.map(m=>m.songId));
const seedChoices=Array.isArray(seed.selected)?seed.selected:[];
if(seedChoices.length!==160)throw new Error(`Expected 160 reviewed seed additions, found ${seedChoices.length}`);

const keyToIds=new Map();
function indexKey(key,id){
  if(!key)return;
  const value=String(key);
  if(!keyToIds.has(value))keyToIds.set(value,new Set());
  keyToIds.get(value).add(id);
}
for(const [id,song] of Object.entries(db.songs)){
  indexKey(song.canonicalKey,id);
  indexKey(E.songUseKey({title:song.title,artist:song.artist}),id);
  for(const key of song.legacyKeys||[])indexKey(key,id);
  for(const key of song.legacyCanonicalKeys||[])indexKey(key,id);
  for(const key of song.aliases||[])indexKey(key,id);
}
for(const [key,value] of Object.entries(db.aliases||{})){
  const ids=Array.isArray(value)?value:[value];
  for(const candidate of ids){
    const id=typeof candidate==='string'?candidate:candidate?.songId;
    if(id&&db.songs[id])indexKey(key,id);
  }
}

const unresolved=[];
const ambiguous=[];
const resolutions=[];
for(const choice of seedChoices){
  let id=db.songs[choice.songId]?choice.songId:null;
  let method=id?'stable_song_id':null;
  if(!id){
    const key=E.songUseKey({title:choice.title,artist:choice.artist});
    const matches=[...(keyToIds.get(key)||[])];
    if(matches.length===1){id=matches[0];method='canonical_or_legacy_key'}
    else if(matches.length>1){ambiguous.push({...choice,key,matches});continue}
    else {unresolved.push({...choice,key});continue}
  }
  const song=db.songs[id];
  resolutions.push({...choice,sourceSongId:choice.songId,songId:id,resolutionMethod:method,title:song.title,artist:song.artist,answerYear:Number(song.release?.answerYear),releaseState:song.release?.state});
}

const grouped=new Map();
for(const row of resolutions){
  if(!grouped.has(row.songId))grouped.set(row.songId,[]);
  grouped.get(row.songId).push(row);
}
const duplicateResolutions=[...grouped.entries()].filter(([,rows])=>rows.length>1).map(([songId,rows])=>({songId,rows:rows.map(r=>({sourceSongId:r.sourceSongId,title:r.title,artist:r.artist}))}));
const uniqueResolved=[...grouped.values()].map(rows=>rows[0]);
const overlaps=uniqueResolved.filter(row=>currentUnexpectedIds.has(row.songId));
const additions=uniqueResolved.filter(row=>!currentUnexpectedIds.has(row.songId));
const potentialTotal=currentUnexpectedIds.size+additions.length;

const diagnostics={
  write,
  canonicalMasters:Object.keys(db.songs).length,
  baselineUnexpected:currentUnexpectedIds.size,
  reviewedSeed:seedChoices.length,
  resolved:resolutions.length,
  uniqueResolved:uniqueResolved.length,
  unresolved:unresolved.length,
  ambiguous:ambiguous.length,
  duplicateResolutions:duplicateResolutions.length,
  overlapsExistingUnexpected:overlaps.length,
  netAdditions:additions.length,
  potentialTotal
};
console.log(JSON.stringify({diagnostics,unresolved,ambiguous,duplicateResolutions,overlaps:overlaps.map(x=>({sourceSongId:x.sourceSongId,songId:x.songId,title:x.title,artist:x.artist}))},null,2));

if(unresolved.length||ambiguous.length||duplicateResolutions.length||potentialTotal!==targetTotal){
  throw new Error(`Reviewed selection does not map cleanly to current canonical DB; potential Unexpected total=${potentialTotal}`);
}
for(const row of additions){
  const song=db.songs[row.songId];
  if(song.release?.state!=='externally_observed'||!Number.isInteger(Number(song.release?.answerYear)))throw new Error(`Selected master lacks accepted release truth: ${song.title}`);
  db.memberships.push({songId:row.songId,mode:'unexpected',year:Number(song.release.answerYear),metadata:{},fieldOrder:['title','artist','year']});
}

const finalUnexpected=db.memberships.filter(m=>m.mode==='unexpected');
if(finalUnexpected.length!==targetTotal)throw new Error(`Unexpected Years count ${finalUnexpected.length}, expected ${targetTotal}`);
if(new Set(finalUnexpected.map(m=>m.songId)).size!==targetTotal)throw new Error('Unexpected Years contains duplicate canonical song IDs');

const compiled=compileDatabase(db);
if(Number(compiled.coverage?.unexpected)!==65)throw new Error(`Unexpected Years coverage ${compiled.coverage?.unexpected}, expected 65`);

const acceptedClaim=song=>(song.release?.claims||[]).find(c=>c.state==='externally_observed'&&Number(c.year)===Number(song.release?.answerYear))||null;
const finalMembers=finalUnexpected.map(m=>{
  const song=db.songs[m.songId],claim=acceptedClaim(song);
  return {songId:song.id,title:song.title,artist:song.artist,answerYear:Number(song.release.answerYear),releaseState:song.release.state,releaseEvidence:claim?{sourceUrl:claim.sourceUrl??null,evidence:claim.evidence??null}:null};
}).sort((a,b)=>a.answerYear-b.answerYear||a.title.localeCompare(b.title));
const audit={
  schemaVersion:2,
  generatedAt:new Date().toISOString(),
  targetTotal,
  previousTotal:currentUnexpectedIds.size,
  additions:additions.length,
  coverage:Number(compiled.coverage.unexpected),
  selectionPolicy:[
    'Prefer recognisable songs with a defensible year trap: ahead/behind-era sound, later breakthrough, revival, cover confusion, title misdirection or deliberate retro styling.',
    'Reuse current canonical masters; never duplicate a song solely to add an Unexpected Years membership.',
    'Require accepted externally observed release truth for every added master.',
    'Preserve canonical identity and correct release truth even when the reviewed seed used a pre-dedupe song ID.'
  ],
  sourceIntegrity:{canonicalMasters:Object.keys(db.songs).length,totalMemberships:db.memberships.length,unexpectedMemberships:finalUnexpected.length,newMasterSongs:0,remappedSeedIds:resolutions.filter(r=>r.sourceSongId!==r.songId).length},
  releaseCorrections:correctionResults,
  selectedAdditions:additions.map(row=>({sourceSongId:row.sourceSongId,songId:row.songId,resolutionMethod:row.resolutionMethod,signal:row.signal,reason:row.reason,title:row.title,artist:row.artist,answerYear:row.answerYear})),
  finalMembers
};

if(write){
  fs.writeFileSync(databasePath,JSON.stringify(db,null,2)+'\n');
  fs.writeFileSync(cataloguePath,JSON.stringify(compiled)+'\n');
  fs.writeFileSync(auditPath,JSON.stringify(audit,null,2)+'\n');
}
console.log(JSON.stringify({write,unexpected:finalUnexpected.length,coverage:compiled.coverage.unexpected,totalMemberships:db.memberships.length,corrections:correctionResults},null,2));
