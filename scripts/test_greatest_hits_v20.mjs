import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileDatabase,songId} from './song_database.mjs';

const ledger=JSON.parse(fs.readFileSync('verification/greatest-hits-v20-reviewed.json','utf8'));
const audit=JSON.parse(fs.readFileSync('verification/greatest-hits-v20-gap-priorities.json','utf8'));
const db=JSON.parse(fs.readFileSync('data/song-database.json','utf8'));
const cat=JSON.parse(fs.readFileSync('data/catalogue.json','utf8'));
const normalize=v=>String(v||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
const stripLead=v=>String(v||'').replace(/^the\s+/i,'').split(/\s+(?:feat\.?|ft\.?|featuring)\s+/i)[0];
const key=(title,artist)=>normalize(title)+'|'+normalize(stripLead(artist));
assert.equal(db.catalogue.version,20);
assert.equal(cat.version,20);
assert.deepEqual(compileDatabase(db),cat,'v20 canonical materialization matches compiler');
assert.equal(ledger.schemaVersion,1);
assert.equal(audit.schemaVersion,1);
assert.equal(ledger.approvedBenchmarkPromotions.length,46);
assert.equal(ledger.approvedAustralianCrossovers.length,12);
assert.equal(audit.summary.exactNormalizedAbsent,192,'Historical baseline gap audit retains 192 candidate rows');
assert.equal(audit.summary.top150,150);
assert.equal(audit.rankedCandidates.length,192);
assert.equal(audit.rankedCandidates.filter(x=>x.priorityBand==='top_150').length,150);
assert.equal(Object.keys(db.songs).length,1170);
assert.equal(db.memberships.length,1543);
assert.equal(Object.values(cat.modes.greatest).flat().length,944);
assert.equal(cat.coverage.greatest,73);
for(const candidate of [...ledger.approvedBenchmarkPromotions,...ledger.approvedAustralianCrossovers]){
  const id=candidate.songId||candidate.existingMasterId||songId(key(candidate.title,candidate.artist));
  const song=db.songs[id];
  assert.ok(song,'Approved song missing: '+candidate.title);
  assert.equal(song.release.answerYear,candidate.year);
  assert.equal(song.release.year,candidate.year);
  assert.equal(song.release.state,'externally_observed');
  assert.ok(song.release.claims.some(c=>c.year===candidate.year&&c.sourceUrl),'First-release year claim missing');
  const members=db.memberships.filter(m=>m.mode==='greatest'&&m.songId===id);
  assert.equal(members.length,1,'Duplicate or missing Greatest Hits membership');
  assert.equal(members[0].year,candidate.year);
  assert.ok(members[0].metadata.sourceUrl&&members[0].metadata.releaseYearEvidence);
  const bucket=cat.modes.greatest[candidate.year]||[];
  const present=bucket.filter(x=>x.songId===id);
  assert.equal(present.length,1,'Missing or repeated generated Greatest Hits song');
  if(candidate.spotifyTrackIdCandidate){
    const idProvider=candidate.spotifyTrackIdCandidate;
    assert.ok(song.providers.spotify.links.some(x=>x.id===idProvider&&x.state==='unverified'),
      'Unreviewed provider candidate must not be falsely promoted');
    assert.equal(members[0].providerRefs.spotify,idProvider);
  }
}
assert.ok(cat.modes.greatest[1969].some(s=>s.title==='Get Back'&&s.artist==='The Beatles'));
assert.ok(cat.modes.greatest[1979].some(s=>s.title==='Funkytown'));
assert.ok(cat.modes.greatest[1987].some(s=>s.title==="Sweet Child O' Mine"));
assert.ok(cat.modes.greatest[1991].some(s=>s.title==='November Rain'));
for(const name of ["Take on Me","Royals","Relax"]){
  assert.ok(ledger.excludedHighPriorityUntilReviewed.some(x=>x.title===name));
}
console.log('Greatest Hits v20: 58 sourced additions, 44 new/14 reused masters, 150 ranked next candidates and protected original-year decisions.');
