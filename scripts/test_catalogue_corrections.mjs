import assert from 'node:assert/strict';
import fs from 'node:fs';
const db=JSON.parse(fs.readFileSync('data/song-database.json','utf8'));
const corrections=JSON.parse(fs.readFileSync('verification/catalogue_v17_corrections.json','utf8'));
for(const c of corrections){
 const song=db.songs[c.songId],rows=db.memberships.filter(m=>m.songId===c.songId&&m.mode===c.originalMembership.mode);
 assert.equal(rows.length,1);assert.equal(rows[0].year,c.correctedYear);assert.equal(rows[0].metadata.releaseYear,c.correctedYear);
 assert.equal(song.release.year,c.correctedYear);
 assert.ok(song.release.rejectedClaims.some(x=>x.year===c.originalMembership.year),'Incorrect date evidence remains available for audit');
 assert.ok(c.evidence.some(x=>x.source==='Apple Music')&&c.evidence.some(x=>x.source==='Official Charts'));
 assert.equal(rows[0].metadata.source,'recording-date-correction-v17');
}
for(const y of db.catalogue.years)assert.ok(db.memberships.filter(m=>m.mode==='greatest'&&m.year===y).length>=12,'Corrections retain minimum year depth');
console.log('Reviewed date corrections retain prior evidence and full year-pool depth.');
