// Greatest Hits v20: sourced first-release years and canonical membership reuse.
// Keep this migration idempotent, offline and constrained to Greatest Hits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {songId,compileDatabase} from '../song_database.mjs';

const ledger=JSON.parse(fs.readFileSync('verification/greatest-hits-v20-reviewed.json','utf8'));
const source='data/song-database.json',output='data/catalogue.json';
const db=JSON.parse(fs.readFileSync(source,'utf8'));
const baseline=JSON.parse(fs.readFileSync(output,'utf8'));
const normalize=v=>String(v||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
const stripLead=v=>String(v||'').replace(/^the\s+/i,'').split(/\s+(?:feat\.?|ft\.?|featuring)\s+/i)[0];
const canonicalKey=(title,artist)=>normalize(title)+'|'+normalize(stripLead(artist));
const fieldOrder=['title','artist','year','releaseYear','source','sourceLabel','sourceUrl','sourceProvider',
  'releaseYearEvidence','releaseDateEvidence','evidenceState','sourceRetrievalDate','spotifyId','youtubeId','canonicalKey'];
const existingIds=new Map();
for(const song of Object.values(db.songs))for(const link of song.providers.spotify.links){
  const other=existingIds.get(link.id);
  assert.ok(!other||other===song.id,'Baseline Spotify provider ID is assigned to different masters');
  existingIds.set(link.id,song.id);
}
const count=()=>Object.values(db.memberships).filter(m=>m.mode==='greatest').length;
if(db.catalogue.version===ledger.targetCatalogueVersion){
  assert.equal(count(),886+ledger.approvedBenchmarkPromotions.length+ledger.approvedAustralianCrossovers.length);
  assert.deepEqual(compileDatabase(db),baseline,'Previously materialized v20 catalogue is stale');
  console.log('Greatest Hits v20 already materialized and synchronized.');
  process.exit(0);
}
assert.equal(db.schemaVersion,2);
assert.equal(db.catalogue.version,19,'Only migrate the current canonical v19 database');
assert.equal(baseline.version,19);
assert.deepEqual(compileDatabase(db),baseline,'Source and compiled catalogue diverge at baseline');
assert.equal(ledger.schemaVersion,1);
assert.equal(ledger.approvedBenchmarkPromotions.length,46);
assert.equal(ledger.approvedAustralianCrossovers.length,12);
assert.equal(count(),886);
const beforeMasters=Object.keys(db.songs).length,beforeMemberships=db.memberships.length;
let mastersCreated=0,mastersReused=0,additions=0;
function addMembership(song,item,origin,spotifyRef=null){
  assert.ok(!db.memberships.some(m=>m.mode==='greatest'&&m.songId===song.id),'Greatest Hits duplicate: '+song.title);
  assert.equal(song.release.answerYear,item.year);
  assert.equal(song.release.year,item.year);
  assert.equal(song.release.state,'externally_observed');
  assert.ok(song.release.claims.some(c=>Number(c.year)===item.year&&c.state==='externally_observed'&&c.sourceUrl),'Missing original release claim: '+song.title);
  assert.ok(item.sourceUrl&&item.evidence,'Missing curation evidence: '+song.title);
  const metadata={
    releaseYear:item.year,source:'reviewed-greatest-hits-v20-2026-11-04',
    sourceLabel:'Reviewed original release · recognisable Greatest Hits',
    sourceUrl:item.sourceUrl,sourceProvider:item.sourceProvider||'Existing sourced Australian master',
    releaseYearEvidence:item.evidence,releaseDateEvidence:String(item.year),
    evidenceState:'externally_observed',sourceRetrievalDate:'2026-11-04',
  };
  const ref=spotifyRef??null;
  db.memberships.push({songId:song.id,mode:'greatest',year:item.year,metadata,
    fieldOrder,providerRefs:{spotify:ref,youtube:null}});
  additions++;
}
for(const item of ledger.approvedBenchmarkPromotions){
  assert.equal(item.reviewState,'approved_original_release','Unreviewed benchmark entry cannot be promoted');
  assert.ok(Number.isInteger(item.year)&&item.year>=1950&&item.year<=2022);
  assert.ok(item.sourceUrl?.startsWith('https://'),'Requires explicit release source URL');
  assert.match(item.spotifyTrackIdCandidate,/^[A-Za-z0-9]{22}$/,'Spotify candidate must be a real referenced ID');
  const key=canonicalKey(item.title,item.artist);
  let song;
  if(item.existingMasterId){
    song=db.songs[item.existingMasterId];
    assert.ok(song,'Referenced canonical master missing: '+item.title);
    assert.equal(song.release.answerYear,item.year,'Cannot rewrite an existing master release year');
    // Promote the one pre-existing but unresolved master (Deee-Lite) only after
    // this ledger supplies explicit original-release evidence for the same year.
    if(song.release.state==='unresolved'){
      assert.ok(item.sourceUrl&&item.evidence,'Cannot promote an unresolved master without source evidence');
      song.release.year=item.year;
      song.release.state='externally_observed';
      song.release.claims.push({
        year:item.year,state:'externally_observed',
        sourceUrl:item.sourceUrl,evidence:item.evidence
      });
    }
    mastersReused++;
  }else{
    assert.ok(!Object.values(db.songs).some(s=>s.canonicalKey===key||(
      normalize(s.title)===normalize(item.title)&&normalize(stripLead(s.artist))===normalize(stripLead(item.artist))
    )),'Found an existing candidate master requiring reconciliation: '+item.title);
    const id=songId(key);
    assert.ok(!db.songs[id]&&!db.aliases?.[key],'Immutable master collision');
    song={
      id,canonicalKey:key,title:item.title,artist:item.artist,
      release:{answerYear:item.year,year:item.year,state:'externally_observed',
        claims:[{year:item.year,state:'externally_observed',sourceUrl:item.sourceUrl,evidence:item.evidence}]},
      providers:{spotify:{preferredId:null,links:[]},youtube:{preferredId:null,links:[]}},
    };
    db.songs[id]=song;
    mastersCreated++;
  }
  const id=item.spotifyTrackIdCandidate;
  assert.ok(!existingIds.has(id)||existingIds.get(id)===song.id,
    'Provider candidate belongs to another canonical master: '+item.title);
  if(!song.providers.spotify.links.some(link=>link.id===id)){
    song.providers.spotify.links.push({
      id,url:'https://open.spotify.com/track/'+id,
      state:'unverified',origin:'hitster-uk-candidate',
      sourceUrl:'https://open.spotify.com/playlist/0Mpj1KwRmY2pHzmj7mfbdh',
      sourceTitle:item.title,sourceArtist:item.artist
    });
  }
  existingIds.set(id,song.id);
  addMembership(song,item,'benchmark',id);
}
for(const item of ledger.approvedAustralianCrossovers){
  assert.equal(item.reviewState,'approved_existing_master');
  const song=db.songs[item.songId];
  assert.ok(song,'Australian canonical master not found: '+item.title);
  assert.equal(song.title,item.title);
  assert.equal(song.artist,item.artist);
  mastersReused++;
  addMembership(song,item,'australian',null);
}
assert.equal(mastersCreated,44);
assert.equal(mastersReused,14);
assert.equal(additions,58);
assert.equal(Object.keys(db.songs).length,beforeMasters+mastersCreated);
assert.equal(db.memberships.length,beforeMemberships+additions);
db.catalogue.version=ledger.targetCatalogueVersion;
db.catalogue.generatedAt='2026-11-04';
db.catalogue.sources.greatest='Source-backed Australian-recognisable Greatest Hits v20; 58 curated memberships added without treating chart/remaster years as original release years.';
const compiled=compileDatabase(db);
assert.equal(Object.values(compiled.modes.greatest).flat().length,944);
assert.equal(compiled.coverage.greatest,73);
assert.deepEqual(compiled.coverage,baseline.coverage,'Other mode year coverage must stay unchanged');
assert.deepEqual(compiled.missing,baseline.missing,'No other mode gained or lost years');
for(const [mode,years] of Object.entries(baseline.modes)){
  if(mode!=='greatest')assert.deepEqual(compiled.modes[mode],years,'Unrelated mode was modified: '+mode);
}
for(const [year,rows] of Object.entries(baseline.modes.greatest)){
  const additionsThisYear=ledger.approvedBenchmarkPromotions.filter(x=>String(x.year)===year).length+
    ledger.approvedAustralianCrossovers.filter(x=>String(x.year)===year).length;
  assert.equal(compiled.modes.greatest[year].length,rows.length+additionsThisYear,
    'Wrong number of Greatest Hits rows in '+year);
  assert.deepEqual(compiled.modes.greatest[year].slice(0,rows.length),rows,
    'Existing Greatest Hits rows must remain identical in '+year);
}
fs.writeFileSync(source,JSON.stringify(db,null,2)+'\n');
fs.writeFileSync(output,JSON.stringify(compiled)+'\n');
console.log(JSON.stringify({version:20,mastersCreated,mastersReused,addedMemberships:additions,
  totalMasters:Object.keys(db.songs).length,totalMemberships:db.memberships.length,
  greatest:Object.values(compiled.modes.greatest).flat().length,coverage:compiled.coverage.greatest}));
