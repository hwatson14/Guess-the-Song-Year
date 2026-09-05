import assert from 'node:assert/strict';
import fs from 'node:fs';
const db=JSON.parse(fs.readFileSync('data/song-database.json','utf8'));
const ledger=JSON.parse(fs.readFileSync('verification/catalogue_expansion_v16.json','utf8'));
const keys=new Set();
for(const a of ledger.additions){
  const key=[a.songId,a.mode,a.year].join('/');
  assert.ok(!keys.has(key),'Duplicate expansion decision');keys.add(key);
  const m=db.memberships.find(m=>m.songId===a.songId&&m.mode===a.mode&&m.year===a.year);
  assert.ok(m,'Every retained addition exists in the shared database');
  assert.equal(m.metadata.sourceUrl,a.sourceUrl);
  assert.equal(a.sourceUrl,'https://musicbrainz.org/recording/'+a.evidence.id);
  assert.equal(Number(a.evidence.firstReleaseDate.slice(0,4)),a.year);
  assert.equal(a.evidence.firstReleaseDate,m.metadata.releaseDateEvidence);
  assert.ok(a.year>=1950&&a.year<=2022);
  assert.ok(a.evidence.officialReleaseObserved&&a.evidence.checkedAt);
}
for(const m of db.memberships.filter(m=>m.metadata.source==='catalogue-expansion-recording-audit')){
  assert.ok(keys.has([m.songId,m.mode,m.year].join('/')),'New rows need retained source evidence');
}
console.log(`Expansion evidence checks passed: ${keys.size} memberships with retained recording metadata.`);
