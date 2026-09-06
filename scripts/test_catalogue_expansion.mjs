import assert from 'node:assert/strict';
import fs from 'node:fs';
const db=JSON.parse(fs.readFileSync('data/song-database.json','utf8'));
const ledger=JSON.parse(fs.readFileSync('verification/catalogue_expansion_v16.json','utf8'));
const keys=new Set(),superseded=[];
for(const a of ledger.additions){
  const key=[a.songId,a.mode,a.year].join('/');
  assert.ok(!keys.has(key),'Duplicate expansion decision');keys.add(key);
  const exact=db.memberships.find(m=>m.songId===a.songId&&m.mode===a.mode&&m.year===a.year);
  assert.equal(a.sourceUrl,'https://musicbrainz.org/recording/'+a.evidence.id);
  assert.equal(Number(a.evidence.firstReleaseDate.slice(0,4)),a.year);
  assert.ok(a.year>=1950&&a.year<=2022);
  assert.ok(a.evidence.officialReleaseObserved&&a.evidence.checkedAt);
  if(exact){
    assert.equal(exact.metadata.sourceUrl,a.sourceUrl);
    assert.equal(a.evidence.firstReleaseDate,exact.metadata.releaseDateEvidence);
    continue;
  }
  // Historical expansion evidence may later be superseded by a reviewed date correction.
  // In that case the old claim must remain auditable and the same master/mode must survive
  // at the current canonical answer year; disappearance is never accepted silently.
  const song=db.songs[a.songId];
  assert.ok(song,'Every historical expansion master still exists');
  const rejected=(song.release?.rejectedClaims||[]).find(c=>Number(c.year)===a.year&&c.sourceUrl===a.sourceUrl);
  assert.ok(rejected,'Missing historical membership must be represented by a rejected release claim');
  const currentYear=Number(song.release?.answerYear);
  assert.notEqual(currentYear,a.year,'Superseded historical evidence must lead to a different accepted answer year');
  const current=db.memberships.find(m=>m.songId===a.songId&&m.mode===a.mode&&Number(m.year)===currentYear);
  assert.ok(current,'Corrected historical expansion master/mode membership still exists at the accepted year');
  assert.notEqual(current.metadata?.sourceUrl,a.sourceUrl,'Corrected membership must not keep the rejected evidence as accepted source');
  superseded.push({songId:a.songId,oldYear:a.year,currentYear});
}
for(const m of db.memberships.filter(m=>m.metadata.source==='catalogue-expansion-recording-audit')){
  assert.ok(keys.has([m.songId,m.mode,m.year].join('/')),'New rows need retained source evidence');
}
assert.deepEqual(superseded.sort((a,b)=>a.songId.localeCompare(b.songId)),[
  {songId:'song_2305a63b8f720bd2d23a',oldYear:1982,currentYear:1983},
  {songId:'song_5789f221c273cdaae0dd',oldYear:1977,currentYear:1978}
].sort((a,b)=>a.songId.localeCompare(b.songId)),'Only the two reviewed Unexpected Years corrections supersede v16 expansion evidence');
console.log(`Expansion evidence checks passed: ${keys.size} historical decisions retained; ${superseded.length} later corrections remain auditable.`);
