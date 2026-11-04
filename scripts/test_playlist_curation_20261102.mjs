import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileDatabase} from './song_database.mjs';

const db=JSON.parse(fs.readFileSync('data/song-database.json','utf8'));
const cat=JSON.parse(fs.readFileSync('data/catalogue.json','utf8'));
const plan=JSON.parse(fs.readFileSync('verification/playlist-curation-2026-11-02.json','utf8'));
const retired=JSON.parse(fs.readFileSync('verification/playlist-retirements-2026-11-02.json','utf8'));
assert.deepEqual(compileDatabase(db),cat,'generated catalogue must exactly match the canonical database');
assert.equal(cat.version,20);
assert.equal(plan.recordingYearCorrections.length,13);
assert.equal(plan.newCanonicalSongs.length,20);
assert.equal(plan.retiredNonSongs.length,3);
assert.equal(plan.existingMasterMemberships.length,4);

const releaseModes=new Set(['greatest','australian','unexpected']);
for(const decision of plan.recordingYearCorrections){
  const song=db.songs[decision.id];
  assert.ok(song,'immutable corrected song ID must survive '+decision.id);
  assert.equal(song.release.answerYear,decision.year,song.title);
  assert.equal(song.release.state,'externally_observed',song.title);
  assert.equal(song.release.year,decision.year,song.title);
  assert.ok(song.release.claims.some(c=>c.year===decision.year&&c.sourceUrl===decision.sourceUrl),'accepted original-release evidence '+song.title);
  assert.ok((song.release.rejectedClaims||[]).some(c=>c.year===decision.oldYear),'previous erroneous year retained for audit '+song.title);
  for(const m of db.memberships.filter(m=>m.songId===decision.id&&releaseModes.has(m.mode))){
    assert.equal(m.year,decision.year,'release-membership mirror year '+song.title);
    assert.equal(m.metadata.releaseYear,decision.year,'membership metadata release year '+song.title);
    assert.equal(m.metadata.sourceUrl,decision.sourceUrl,'reviewed source '+song.title);
    assert.ok(!m.metadata.yearEvidence,'invalid prior recording earliest-date claim still appears as accepted');
  }
}
const fernando=db.songs.song_9148f3ec2a1a04612d5e;
assert.equal(fernando.release.answerYear,1976);
assert.equal(db.memberships.find(m=>m.songId===fernando.id&&m.mode==='number1_au').year,1976,
  'independent #1 chart-year semantics must survive a canonical music-year correction');

for(const decision of plan.newCanonicalSongs){
  const song=db.songs[decision.id];
  assert.ok(song,'new sourced master '+decision.title);
  assert.equal(song.title,decision.title);
  assert.equal(song.artist,decision.artist);
  assert.equal(song.release.answerYear,decision.year);
  assert.equal(song.release.year,decision.year);
  assert.equal(song.release.state,'externally_observed');
  assert.ok(song.release.claims.some(c=>c.sourceUrl===decision.sourceUrl&&c.year===decision.year));
  for(const provider of ['spotify','youtube']){
    assert.equal(song.providers[provider].preferredId,null,'never promote unreviewed provider IDs');
    assert.equal(song.providers[provider].links.length,0,'never invent provider recordings');
  }
  for(const mode of decision.modes)assert.equal(db.memberships.filter(m=>m.songId===decision.id&&m.mode===mode).length,1);
}
for(const item of plan.existingMasterMemberships){
  assert.ok(db.songs[item.songId]);
  assert.equal(db.memberships.filter(m=>m.songId===item.songId&&m.mode===item.mode&&m.year===item.year).length,1);
}
assert.equal(retired.entries.length,3);
for(const item of retired.entries){
  assert.equal(item.membership.songId,item.songId);
  assert.equal(item.song.id,item.songId);
  assert.equal(db.songs[item.songId],undefined,'retired invalid master must not remain playable');
  assert.ok(!db.memberships.some(m=>m.songId===item.songId),'retired membership must be removed');
  assert.ok(item.reason&&item.sourceUrl&&item.song.title,'retirement preserves reviewed explanation and original data');
}

for(const mode of ['greatest','australian'])assert.equal(cat.coverage[mode],73,mode+' must cover all card years');
for(let year=1950;year<=2022;year++){
  assert.ok((cat.modes.greatest[year]||[]).length>=12,'Greatest Hits 12-song minimum for '+year);
  assert.ok((cat.modes.australian[year]||[]).length>=1,'Australian year '+year+' must be playable');
}
// The 884-song historical curation baseline has two subsequent required original-release additions.
assert.equal(Object.values(cat.modes.greatest).flat().length,944);
assert.equal(Object.values(cat.modes.australian).flat().length,253);
assert.equal(new Set(Object.values(cat.modes.australian).flat().map(s=>s.artist)).size,45);
assert.equal(cat.modes.australian[2022].length,2,'2022 must be backfilled after the Troye Sivan correction');
assert.ok(cat.modes.australian[2007].some(s=>s.title==='Straight Lines'));
assert.ok(cat.modes.australian[2007].some(s=>s.title==='Untouched'));
assert.ok(cat.modes.greatest[1975].some(s=>s.title.startsWith("It's a Long Way")));
assert.ok(cat.modes.greatest[2010].some(s=>s.title==='Only Girl (In the World)'));
console.log('Reviewed playlist corrections: 13 dates, 20 new masters, 4 reused masters, 3 audited retirements, all original year coverage preserved.');
