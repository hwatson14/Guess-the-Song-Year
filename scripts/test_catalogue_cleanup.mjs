import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {applyCatalogueCleanup,cleanupId} from './cleanup_catalogue.mjs';
import {catalogueEngine,loadProductionCatalogue} from './catalogue_runtime.mjs';

const {data,manifest}=loadProductionCatalogue();
const decisions=JSON.parse(fs.readFileSync('verification/catalogue_cleanup_decisions.json','utf8'));
const archive=JSON.parse(fs.readFileSync('verification/catalogue_cleanup_archive.json','utf8')).entries;
const baseline=JSON.parse(fs.readFileSync('verification/catalogue_cleanup_baseline.json','utf8'));
const E=catalogueEngine(data,manifest),reports=await E.modeReports();
const fingerprint=row=>createHash('sha256').update(JSON.stringify(row)).digest('hex');
const originalHash=row=>{const clone=structuredClone(row);delete clone.legacyKeys;return fingerprint(clone)};

// All baseline rows must survive verbatim either in the game or in the archive.
for(const original of baseline.rows){
  const active=(data.modes[original.mode][original.year]||[]).some(row=>originalHash(row)===original.fingerprint);
  const archived=archive.some(row=>row.mode===original.mode&&row.year===original.year&&row.original&&fingerprint(row.original)===original.fingerprint);
  assert.equal(Number(active)+Number(archived),1,`Lost or duplicated baseline record: ${original.mode}/${original.year}/${original.key}`);
}
assert.equal(new Set(archive.map(x=>x.id)).size,archive.length,'archive IDs are unique');
assert.deepEqual(new Set(archive.map(x=>x.id)),new Set(decisions.map(cleanupId)));
assert.equal(archive.filter(x=>x.original).length,baseline.rows.filter(x=>archive.some(a=>a.original&&a.mode===x.mode&&a.year===x.year&&fingerprint(a.original)===x.fingerprint)).length);
for(const [mode,r] of Object.entries(reports)){
  assert.equal(r.songs,r.rawSongs,`${mode}: source and usable totals diverged`);
  assert.equal(r.coverage,baseline.coverage[mode],`${mode}: year coverage changed`);
}
for(const entry of archive){
  if(entry.replacement){
    const row=entry.replacement;
    assert.equal(row.releaseYear,row.year);
    assert.equal(row.evidenceState,'externally_observed');
    assert.ok(row.sourceUrl.startsWith('https://')&&row.releaseYearEvidence&&row.sourceProvider);
    assert.equal(row.spotifyId,'','Unverified playback IDs must not be promoted');
    assert.equal(row.youtubeId,'');
    const active=data.modes[entry.mode][row.year].find(x=>E.songUseKey(x)===E.songUseKey(row));
    assert.ok(active,'Sourced replacement missing');
    for(const [key,value] of Object.entries(row))assert.deepEqual(active[key],value);
  }
  if(entry.action==='archive_duplicate'||entry.action==='repair'){
    const target=entry.retained||{year:entry.replacement.year,key:E.songUseKey(entry.replacement)};
    const targetRow=data.modes[entry.mode][target.year].find(x=>E.songUseKey(x)===target.key);
    assert.ok(targetRow,'Duplicate/repair has no retained identity');
    const oldKey=entry.originalKey;
    if(oldKey!==target.key)assert.ok(targetRow.legacyKeys.includes(oldKey),'Saved-game alias was lost');
    const used=[...reports[entry.mode].yearSongKeys[target.year].filter(x=>x!==target.key),oldKey];
    await assert.rejects(E.chooseSong(target.year,entry.mode,used),{code:'NO_UNUSED_SONG'});
  }
}
const repeat=applyCatalogueCleanup(data,manifest,decisions,archive);
assert.equal(repeat.changes.length,0,'Cleanup is idempotent');
assert.deepEqual(repeat.data,data);
assert.deepEqual(repeat.archive,archive);

// Failed decisions cannot mutate the caller's catalogue or silently discard a row.
const fixture=structuredClone(data),mode='greatest',year=1950,original=fixture.modes[mode][year][0];
const snapshot=JSON.stringify(fixture);
assert.throws(()=>applyCatalogueCleanup(fixture,manifest,[{mode,year,original,action:'repair',reason:'fixture',replacement:{title:'Example',artist:'Artist',year}}]),/lacks release/);
assert.equal(JSON.stringify(fixture),snapshot);
assert.throws(()=>applyCatalogueCleanup(fixture,manifest,[{mode,year,original,action:'archive_duplicate',reason:'fixture',retained:{key:'missing',year}}]),/retained identity/);
assert.throws(()=>applyCatalogueCleanup(fixture,manifest,[{mode,year,original:{...original,title:'Absent'},action:'archive_unresolved',reason:'fixture'}]),/match exactly once/);
console.log(`Catalogue cleanup checks passed: ${baseline.rows.length} originals accounted for, ${archive.length} decisions, zero hidden exclusions, saved aliases and idempotency verified.`);
