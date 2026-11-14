import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileDatabase,songId} from './song_database.mjs';

const source=JSON.parse(fs.readFileSync('data/song-database.json','utf8'));
const cat=JSON.parse(fs.readFileSync('data/catalogue.json','utf8'));
const audit=JSON.parse(fs.readFileSync('verification/playlist-quality-2026-11-15.json','utf8'));
assert.deepEqual(compileDatabase(source),cat,'newly generated catalogue must match canonical master and memberships');
assert.equal(audit.schemaVersion,1);
assert.equal(audit.reviewDate,'2026-11-15');
assert.equal(audit.newMasters.length,18);
assert.equal(audit.reusedMasters.length,4);
assert.equal(audit.corrections.length,6);
assert.equal(Object.keys(source.songs).length,audit.expected.masterSongs);
assert.equal(source.memberships.length,audit.expected.memberships);

const count=mode=>Object.values(cat.modes[mode]||{}).flat().length;
assert.equal(count('australian'),275);
assert.equal(count('greatest'),960);
assert.equal(count('unexpected'),200);
for(const mode of ['number1_au','number1_us'])assert.equal(count(mode),73);
for(const mode of ['greatest','australian','number1_au','number1_us'])assert.equal(cat.coverage[mode],73);
assert.equal(cat.coverage.unexpected,65);
for(let y=1950;y<=2022;y++){
  assert.ok((cat.modes.greatest[y]||[]).length>=12,'Greatest year pool '+y);
  assert.ok((cat.modes.australian[y]||[]).length>=1,'Australian year coverage '+y);
  for(const mode of ['number1_au','number1_us'])assert.equal((cat.modes[mode][y]||[]).length,1,'fixed chart '+mode+' '+y);
}
assert.equal(new Set(Object.values(cat.modes.australian).flat().map(s=>s.artist)).size,61);

for(const item of audit.newMasters){
  const song=source.songs[item.songId];
  assert.ok(song,'missing canonical song '+item.title);
  assert.equal(song.id,songId(song.canonicalKey),'stable canonical hash '+item.title);
  assert.equal(song.title,item.title);
  assert.equal(song.artist,item.artist);
  assert.equal(song.release.answerYear,item.year);
  assert.equal(song.release.year,item.year);
  assert.equal(song.release.state,'externally_observed');
  assert.ok(song.release.claims.some(c=>c.year===item.year&&c.state==='externally_observed'&&c.sourceUrl===item.sourceUrl));
  for(const provider of ['spotify','youtube']){
    assert.equal(song.providers[provider].preferredId,null,'no invented provider preferred ID: '+item.title);
    assert.deepEqual(song.providers[provider].links,[],'no invented provider links: '+item.title);
  }
  for(const mode of item.modes){
    const m=source.memberships.filter(m=>m.songId===item.songId&&m.mode===mode);
    assert.equal(m.length,1,'one membership for '+mode+' '+item.title);
    assert.equal(m[0].year,item.year);
    assert.equal(m[0].metadata.sourceUrl,item.sourceUrl);
    assert.equal(m[0].metadata.releaseYear,item.year);
    assert.ok((cat.modes[mode][item.year]||[]).some(s=>s.songId===item.songId),'runtime catalogue has '+item.title);
  }
}
for(const item of audit.reusedMasters){
  const song=source.songs[item.songId];
  assert.ok(song,'missing reused master '+item.title);
  assert.equal(song.release.answerYear,item.year);
  assert.equal(song.release.state,'externally_observed');
  assert.equal(source.memberships.filter(m=>m.songId===item.songId&&m.mode==='australian').length,1);
  if(item.alsoGreatest)assert.equal(source.memberships.filter(m=>m.songId===item.songId&&m.mode==='greatest').length,1);
}
assert.equal(source.memberships.filter(m=>m.songId==='song_57c40e39925003e06729'&&m.mode==='number1_au'&&m.year===1971).length,1,'Eagle Rock chart-year leader stays intact');
for(const item of audit.corrections){
  const song=source.songs[item.songId];
  assert.ok(song,'missing corrected song '+item.title);
  assert.equal(song.release.answerYear,item.newYear);
  assert.equal(song.release.year,item.newYear);
  assert.equal(song.release.state,'externally_observed');
  assert.ok(song.release.claims.some(c=>c.year===item.newYear&&c.sourceUrl===item.sourceUrl));
  assert.ok((song.release.rejectedClaims||[]).some(c=>c.year===item.oldYear),'old date evidence must remain for audit');
  for(const m of source.memberships.filter(m=>m.songId===item.songId&&['greatest','australian','unexpected'].includes(m.mode))){
    assert.equal(m.year,item.newYear);
    assert.equal(m.metadata.releaseYear,item.newYear);
    assert.equal(m.metadata.sourceUrl,item.sourceUrl);
    assert.ok((cat.modes[m.mode][item.newYear]||[]).some(s=>s.songId===item.songId));
    assert.ok(!(cat.modes[m.mode][item.oldYear]||[]).some(s=>s.songId===item.songId),'wrong answer removed '+item.title);
  }
}
assert.equal(audit.reviewHolds.length,3);
console.log('15 Nov song-list curation verified: +22 AU, +16 Greatest, 18 new masters, 6 sourced date corrections, chart and preview contracts preserved.');
