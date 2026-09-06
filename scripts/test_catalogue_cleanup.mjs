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
const originalHash=row=>{const clone=structuredClone(row);delete clone.legacyKeys;delete clone.songId;return fingerprint(clone)};
const reviewKey=row=>String(row?.canonicalKey||E.songUseKey({...row,songId:null}));
const identityKeys=row=>new Set([reviewKey(row),...(Array.isArray(row?.legacyKeys)?row.legacyKeys:[])].map(String).filter(Boolean));

// Historical cleanup accounting first preserves an exact archived original. If the
// original was not archived, exactly one active canonical identity or preserved alias
// must remain. Later canonical master merges deliberately collapse old identities, and
// corrected release-year identities may move buckets; chart-year placements may not.
for(const original of baseline.rows){
  const archived=archive.some(row=>row.mode===original.mode&&row.year===original.year&&row.original&&fingerprint(row.original)===original.fingerprint)?1:0;
  const buckets=data.modes[original.mode]||{};
  const rows=manifest.modes?.[original.mode]?.yearBasis==='release'?Object.values(buckets).flat():(buckets[original.year]||[]);
  const active=archived?0:rows.filter(row=>identityKeys(row).has(original.key)).length;
  assert.equal(active+archived,1,`Lost or duplicated baseline identity: ${original.mode}/${original.year}/${original.key}`);
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
    const active=data.modes[entry.mode][row.year].find(x=>reviewKey(x)===reviewKey(row));
    assert.ok(active,'Sourced replacement missing');
    for(const [key,value] of Object.entries(row))assert.deepEqual(active[key],value);
  }
  if(entry.action==='archive_duplicate'||entry.action==='repair'){
    const target=entry.retained||{year:entry.replacement.year,key:reviewKey(entry.replacement)};
    const targetBuckets=data.modes[entry.mode]||{};
    const targetRows=manifest.modes?.[entry.mode]?.yearBasis==='release'?Object.values(targetBuckets).flat():(targetBuckets[target.year]||[]);
    const targetRow=targetRows.find(x=>reviewKey(x)===target.key||identityKeys(x).has(target.key));
    assert.ok(targetRow,'Duplicate/repair has no retained identity');
    const runtimeKey=E.songUseKey(targetRow),oldKey=entry.originalKey;
    if(oldKey!==reviewKey(targetRow))assert.ok(identityKeys(targetRow).has(oldKey),'Saved-game alias was lost');
    const runtimeYear=Number(targetRow.year);
    const used=[...reports[entry.mode].yearSongKeys[runtimeYear].filter(x=>x!==runtimeKey),oldKey];
    await assert.rejects(E.chooseSong(runtimeYear,entry.mode,used),{code:'NO_UNUSED_SONG'});
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