import fs from 'node:fs';
import {songId,compileDatabase} from './song_database.mjs';
import {catalogueEngine} from './catalogue_runtime.mjs';
const file='data/song-database.json',db=JSON.parse(fs.readFileSync(file,'utf8'));
const manifest=JSON.parse(fs.readFileSync('data/modes.json','utf8'));
const E=catalogueEngine(compileDatabase(db),manifest);
const input=process.argv.find(x=>x.endsWith('.json'))||'output/expansion/musicbrainz-reviewed.json';
const research=JSON.parse(fs.readFileSync(input,'utf8'));
const ledgerFile='verification/catalogue_expansion_v16.json';
const ledger=fs.existsSync(ledgerFile)?JSON.parse(fs.readFileSync(ledgerFile,'utf8')):{sourceVersion:15,version:16,additions:[]};
const skipped=[],added=[];
const australianArtists=new Set(db.memberships.filter(m=>m.mode==='australian').map(m=>db.songs[m.songId].canonicalKey.split('|')[1]));
const membershipYear=m=>manifest.modes[m.mode]?.yearBasis==='release'?Number(db.songs[m.songId]?.release?.answerYear):Number(m.year);
const count=(mode,year)=>db.memberships.filter(m=>m.mode===mode&&membershipYear(m)===year).length;
const songsByCanonical=new Map(Object.values(db.songs).map(song=>[String(song.canonicalKey),song]));
for(const candidate of research.accepted){
  const rawKey=E.songUseKey(candidate),matched=db.songs[db.aliases?.[rawKey]]||songsByCanonical.get(rawKey),id=matched?.id||songId(rawKey),key=matched?.canonicalKey||rawKey,year=candidate.releaseYear;
  if(!Number.isInteger(year)||year<1950||year>2022||E.isAlternateSongTitle(candidate.title)||candidate.evidenceState!=='externally_observed'||!candidate.musicbrainzId||candidate.sourceUrl!==`https://musicbrainz.org/recording/${candidate.musicbrainzId}`){skipped.push({key,reason:'invalid evidence or alternate recording'});continue}
  // Verify the referenced cached response actually contains the asserted recording/date.
  const cached=JSON.parse(fs.readFileSync(candidate.searchCache,'utf8'));
  const entity=cached.recordings.find(r=>r.id===candidate.musicbrainzId);
  if(!entity||entity['first-release-date']!==candidate.releaseDateEvidence||Number(entity['first-release-date'].slice(0,4))!==year)throw new Error('Evidence mismatch '+key);
  const existing=db.songs[id];
  if(existing&&((existing.release.year&&existing.release.year!==year)||(existing.release.answerYear&&existing.release.answerYear!==year))){skipped.push({key,reason:'conflicts with the existing canonical release year; review required'});continue}
  const modes=['greatest',...(australianArtists.has(key.split('|')[1])?['australian']:[])].filter(mode=>
    !db.memberships.some(m=>m.mode===mode&&m.songId===id)&&(mode!=='greatest'||count(mode,year)<12));
  if(!modes.length)continue;
  const row={title:candidate.title,artist:candidate.artist,year,releaseYear:year,canonicalKey:key,
    musicbrainzId:candidate.musicbrainzId,yearEvidence:'MusicBrainz recording earliest first-release-date',
    source:'catalogue-expansion-recording-audit',sourceLabel:'MusicBrainz recording release evidence',
    sourceUrl:candidate.sourceUrl,sourceProvider:candidate.sourceProvider,sourceRetrievalDate:candidate.sourceRetrievalDate,
    releaseYearEvidence:candidate.releaseYearEvidence,releaseDateEvidence:candidate.releaseDateEvidence,
    evidenceState:'externally_observed',spotifyId:'',youtubeId:''};
  const claim={year,state:'externally_observed',sourceUrl:row.sourceUrl,evidence:row.releaseYearEvidence};
  const song=db.songs[id]??={id,canonicalKey:key,title:row.title,artist:row.artist,release:{answerYear:year,year,state:'externally_observed',claims:[]},providers:{spotify:{preferredId:null,links:[]},youtube:{preferredId:null,links:[]}}};
  song.release.answerYear=Number(song.release.answerYear??year);
  if(!song.release.claims.some(x=>x.sourceUrl===claim.sourceUrl)){song.release.claims.push(claim);song.release.year=year;song.release.state='externally_observed'}
  for(const mode of modes){
    const metadata=Object.fromEntries(Object.entries(row).filter(([k])=>!['title','artist','year','canonicalKey','songId','spotifyId','youtubeId'].includes(k)));
    db.memberships.push({songId:id,mode,year,metadata,fieldOrder:Object.keys(row),
      ...(row.title!==song.title||row.artist!==song.artist?{displayOverrides:{title:row.title,artist:row.artist}}:{}),providerRefs:{spotify:null,youtube:null}});
    const entry={songId:id,mode,year,title:row.title,artist:row.artist,sourceUrl:row.sourceUrl,searchCache:candidate.searchCache.replaceAll('\\','/'),evidence:{id:entity.id,title:entity.title,firstReleaseDate:entity['first-release-date'],officialReleaseObserved:entity.releases.some(r=>r.status==='Official'),checkedAt:candidate.sourceRetrievalDate},
      ...(mode==='australian'?{tagEvidence:'Lead artist already belongs to the curated Australian artist roster'}:{})};
    added.push(entry);ledger.additions.push(entry);
  }
}
if(process.argv.includes('--write')&&added.length){
  db.catalogue.version=Math.max(Number(db.catalogue.version)||0,16);db.catalogue.generatedAt=new Date().toISOString();
  const compiled=compileDatabase(db),reports=await catalogueEngine(compiled,manifest).modeReports();
  for(const r of Object.values(reports))if(r.songs!==r.rawSongs)throw new Error('Expansion creates excluded rows '+JSON.stringify(Object.values(compiled.modes[r.id]).flat().filter(x=>!r.yearSongKeys[x.year]?.includes(E.songUseKey(x)))));
  fs.writeFileSync(ledgerFile,JSON.stringify(ledger,null,2)+'\n');
  fs.writeFileSync(file,JSON.stringify(db,null,2)+'\n');
  fs.writeFileSync('data/catalogue.json',JSON.stringify(compiled)+'\n');
}
const depth=Object.fromEntries(db.catalogue.years.map(year=>[year,count('greatest',year)]));
console.log(JSON.stringify({write:process.argv.includes('--write'),researchProcessed:research.processed,researchTotal:research.total,
  newMemberships:added.length,newGreatest:added.filter(x=>x.mode==='greatest').length,newAustralian:added.filter(x=>x.mode==='australian').length,
  songs:Object.keys(db.songs).length,memberships:db.memberships.length,greatest:Object.values(depth).reduce((a,b)=>a+b,0),
  yearsAtTarget:Object.values(depth).filter(x=>x>=12).length,remainingToTarget:Object.values(depth).reduce((n,c)=>n+Math.max(0,12-c),0),depth,skipped},null,2));
