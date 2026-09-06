import fs from 'node:fs';
import assert from 'node:assert/strict';
import {catalogueEngine,loadProductionCatalogue} from './catalogue_runtime.mjs';
import {integrateYearGaps} from './integrate_year_gaps.mjs';
const evidence=JSON.parse(fs.readFileSync('verification/year_gap_release_evidence.json','utf8'));
const {data,manifest}=loadProductionCatalogue(),E=catalogueEngine(data,manifest),reports=await E.modeReports();
const expected={greatest:[1964,1994,2022],australian:[1950,1955,1960,1961,1962,2011,2016]};
assert.equal(evidence.length,15);
for(const input of evidence){
  const {mode,...song}=input;delete song.canonicalKey;
  const matchingKey=E.songUseKey(song),rows=Object.values(data.modes[mode]).flat().filter(s=>String(s.canonicalKey||'')===matchingKey);
  assert.equal(rows.length,1,input.title+' must have one canonical match within its mode');
  const runtimeKey=E.songUseKey(rows[0]);
  assert.equal(rows[0].year,input.releaseYear);
  assert.ok(rows[0].releaseYearEvidence&&rows[0].sourceProvider&&rows[0].sourceRetrievalDate);
  assert.ok(reports[mode].yearSongKeys[input.year].includes(runtimeKey),'new row must pass the actual runtime filter');
  const excluded=reports[mode].yearSongKeys[input.year].filter(candidate=>candidate!==runtimeKey);
  assert.equal(E.songUseKey(await E.chooseSong(input.year,mode,excluded)),runtimeKey);
}
for(const [mode,years] of Object.entries(expected))for(const year of years)assert.ok(reports[mode].years.includes(year));
const before=JSON.stringify(data);assert.deepEqual(integrateYearGaps(data,manifest,evidence),[]);
assert.equal(JSON.stringify(data),before,'a repeat integration must be a no-op');
console.log('Year-gap evidence, runtime eligibility, identity and idempotence checks passed (15 additions)');
