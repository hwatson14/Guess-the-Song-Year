import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileDatabase} from './song_database.mjs';

const db=JSON.parse(fs.readFileSync('data/song-database.json','utf8'));
const audit=JSON.parse(fs.readFileSync('verification/unexpected-years-200-selection.json','utf8'));
const compiled=compileDatabase(db);
const unexpected=db.memberships.filter(m=>m.mode==='unexpected');

assert.equal(unexpected.length,200,'Unexpected Years has exactly 200 memberships');
assert.equal(new Set(unexpected.map(m=>m.songId)).size,200,'Unexpected Years has 200 unique canonical masters');
assert.equal(compiled.coverage.unexpected,65,'Unexpected Years spans 65 release years');
for(const m of unexpected){
  const song=db.songs[m.songId];
  assert.ok(song,'Unexpected membership resolves to a canonical master');
  assert.equal(song.release?.state,'externally_observed',`${song.title}: Unexpected Years requires accepted release evidence`);
  assert.ok(Number.isInteger(Number(song.release?.answerYear)),`${song.title}: accepted answer year is integral`);
  assert.equal(Number(m.year),Number(song.release.answerYear),`${song.title}: membership mirror follows canonical release truth`);
}

const corrected=[
  {id:'song_5789f221c273cdaae0dd',year:1978,rejectedYear:1977},
  {id:'song_2305a63b8f720bd2d23a',year:1983,rejectedYear:1982}
];
for(const c of corrected){
  const song=db.songs[c.id];
  assert.ok(song);
  assert.equal(Number(song.release.answerYear),c.year);
  assert.ok((song.release.rejectedClaims||[]).some(x=>Number(x.year)===c.rejectedYear),'Superseded release evidence remains auditable');
}

const pass=Object.values(db.songs).find(song=>song.canonicalKey==='pass the dutchie|musical youth');
assert.ok(pass,'Pass The Dutchie is a canonical 1982 master');
assert.equal(Number(pass.release.answerYear),1982);
assert.equal(pass.release.state,'externally_observed');
assert.ok(db.memberships.some(m=>m.songId===pass.id&&m.mode==='greatest'&&Number(m.year)===1982),'Pass The Dutchie backfills 1982 Greatest Hits');
assert.ok(pass.providers.spotify.links.some(x=>x.id==='1BkY0N8ChFk2mdLbAUu8ZK'&&x.state==='unverified'),'Spotify candidate retained without false verification');
assert.ok(pass.providers.youtube.links.some(x=>x.id==='s7-B-JXmhOs'&&x.state==='unverified'),'YouTube candidate retained without false verification');

assert.equal(audit.targetTotal,200);
assert.equal(audit.coverage,65);
assert.equal(audit.finalMembers.length,200);
assert.equal(new Set(audit.finalMembers.map(x=>x.songId)).size,200);
for(const year of db.catalogue.years)assert.ok((compiled.modes.greatest?.[year]||[]).length>=12,`Greatest Hits ${year} retains >=12 songs`);
console.log('Unexpected Years 200 contract passed: 200 unique songs, 65 years, corrected release truth and Greatest depth preserved.');
