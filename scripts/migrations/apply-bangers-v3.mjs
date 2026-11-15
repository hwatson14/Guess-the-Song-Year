// Reproducible, idempotent implementation of Harry's V3 Australian party-singalong selection.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {songId,compileDatabase} from '../song_database.mjs';
const dbPath='data/song-database.json',catPath='data/catalogue.json',modePath='data/modes.json';
const seed=JSON.parse(fs.readFileSync('verification/bangers-v3-seed.json','utf8'));
const db=JSON.parse(fs.readFileSync(dbPath,'utf8'));
const manifest=JSON.parse(fs.readFileSync(modePath,'utf8'));
const baseline=JSON.parse(fs.readFileSync(catPath,'utf8'));
assert.equal(seed.headliners.length,110);
assert.equal(seed.candidates.length,40);
assert.equal(seed.held.length,8);
const norm=s=>String(s||'').normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/^the /,'');
const candidate=new Map(seed.candidates.map(x=>[norm(x.title),x]));
const held=new Map(seed.held.map(x=>[norm(x.title),x]));
const chart=new Map(seed.chartOnly.map(x=>[norm(x.title),x]));
const fieldOrder=['title','artist','year','releaseYear','source','sourceLabel','sourceUrl','sourceProvider','releaseYearEvidence','evidenceState','sourceRetrievalDate','spotifyId','youtubeId','canonicalKey'];
if(manifest.modes.bangers){
  assert.ok(db.memberships.some(m=>m.mode==='bangers'));
  assert.deepEqual(compileDatabase(db,manifest),baseline,'Idempotent Bangers data is stale');
  console.log('Bangers already installed and synchronized');process.exit(0);
}
assert.deepEqual(compileDatabase(db,manifest),baseline,'Baseline source/catalogue must match before migration');
manifest.modes.bangers={
 name:'Bangers',short:'Bangers',
 desc:'Recognisable Australian-party group singalongs. Guess the year the intended recording was first released.',
 status:'preview',statusLabel:'Preview',
 statusNote:'Curated 110-song shortlist with eight year/version holds. Sparse coverage, playback recording audition pending. Virtual play recommended.',
 yearBasis:'release',repeatPolicy:'unique',
};
let included=[],heldOut=[],created=[],reused=0,upgraded=[];
for(const p of seed.headliners){
  const key=norm(p.title);
  if(held.has(key)){heldOut.push({...held.get(key),artist:p.artist});continue;}
  const matched=Object.values(db.songs).filter(x=>norm(x.title)===key);
  let song=matched.find(x=>norm(x.artist)===norm(p.artist)||norm(x.artist).includes(norm(p.artist))||norm(p.artist).includes(norm(x.artist)));
  if(!song&&key===norm("You're the One That I Want"))song=matched[0];
  let n=false,evidence;
  if(!song){
    const info=candidate.get(key);
    assert.ok(info,'Missing source for new song '+p.title);
    const canonicalKey=norm(p.title)+'|'+norm(p.artist);
    const id=songId(canonicalKey);
    assert.ok(!db.songs[id]&&!Object.values(db.songs).some(x=>x.canonicalKey===canonicalKey),'Master collision '+p.title);
    song={id,canonicalKey,title:p.title,artist:p.artist,
      release:{answerYear:info.year,year:info.year,state:'externally_observed',claims:[{year:info.year,state:'externally_observed',sourceUrl:info.sourceUrl,evidence:'Public source supports original issue; exact provider audio has not been independently auditioned.'}]},
      providers:{spotify:{preferredId:null,links:[]},youtube:{preferredId:null,links:[]}}};
    db.songs[id]=song;created.push(id);n=true;
  }else{
    reused++;
    if(song.release.answerYear==null){
      evidence=chart.get(key);assert.ok(evidence,'Null master release year '+p.title);
      song.release={answerYear:evidence.year,year:evidence.year,state:'externally_observed',
        claims:[{year:evidence.year,state:'externally_observed',sourceUrl:evidence.sourceUrl,evidence:evidence.evidence}]};
      upgraded.push({title:song.title,songId:song.id,year:evidence.year,sourceUrl:evidence.sourceUrl});
    }
  }
  const year=song.release.answerYear;
  assert.ok(Number.isInteger(year)&&year>=1950&&year<=2022,'Release year outside permitted game range '+p.title);
  const original=db.memberships.find(m=>m.songId===song.id&&m.mode==='greatest')||db.memberships.find(m=>m.songId===song.id&&m.mode==='australian');
  const sourceUrl=candidate.get(key)?.sourceUrl||song.release.claims?.find(c=>c.year===year&&c.sourceUrl)?.sourceUrl||null;
  const metadata={releaseYear:year,source:'bangers-singalong-v3',sourceLabel:'Australian singalong · proposed original recording',
    ...(sourceUrl?{sourceUrl}:{}),sourceProvider:'Source-backed curated review',
    releaseYearEvidence:'Original recording year candidate; exact provider track not auditioned.',
    evidenceState:song.release.state==='externally_observed'?'externally_observed':'bootstrap_only',
    sourceRetrievalDate:seed.date};
  db.memberships.push({songId:song.id,mode:'bangers',year,metadata,fieldOrder,
    providerRefs:{spotify:original?.providerRefs?.spotify??null,youtube:original?.providerRefs?.youtube??null}});
  included.push({title:p.title,artist:p.artist,songId:song.id,answerYear:year,origin:n?'new':'reused',
    sourceUrl,providerIdentity:'pending-audition'});
}
assert.equal(included.length,102);
assert.equal(created.length,40);
assert.equal(reused,62);
assert.equal(upgraded.length,3);
assert.equal(heldOut.length,8);
db.catalogue.sources.bangers='V3 Australian singalong curation: source-backed original issue, provider recording review pending.';
const compiled=compileDatabase(db,manifest);
assert.equal(Object.values(compiled.modes.bangers||{}).flat().length,102);
assert.equal(compiled.coverage.bangers,Object.keys(compiled.modes.bangers).length);
for(const [mode,rows] of Object.entries(baseline.modes))
  assert.deepEqual(compiled.modes[mode],rows,'Previously playable mode changed '+mode);
fs.writeFileSync(dbPath,JSON.stringify(db,null,2)+'\n');
fs.writeFileSync(catPath,JSON.stringify(compiled)+'\n');
fs.writeFileSync(modePath,JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync('verification/bangers-v3-implementation.json',JSON.stringify({
 schemaVersion:1,date:seed.date,proposedHeadliners:110,included,held:heldOut,newMasterIds:created,
 releaseYearEnrichments:upgraded,approval:'Implemented Preview; playback/recording source not independently audited',
 originalYearPolicy:'Earliest credible issue of intended recording, not chart peak or later remaster',
},null,2)+'\n');
console.log(JSON.stringify({included:included.length,held:heldOut.length,newMasters:created.length,reused,upgraded:upgraded.length,coverage:compiled.coverage.bangers}));
