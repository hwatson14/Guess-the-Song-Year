import assert from 'node:assert/strict';
import {catalogueEngine,loadProductionCatalogue} from './catalogue_runtime.mjs';

const {data,manifest}=loadProductionCatalogue(),E=catalogueEngine(data,manifest),reports=await E.modeReports();
assert.deepEqual(Object.keys(data.modes).sort(),Object.keys(manifest.modes).sort());
const summary={};
for(const [mode,meta] of Object.entries(manifest.modes)){
  const report=reports[mode],usedAcrossYears=new Set();
  if(meta.status==='building'){assert.equal(report.selectable,false);continue}
  assert.equal(report.rawSongs,report.songs,`${mode}: shipped rows must all be usable; archive unresolved variants`);
  if(meta.status==='ready')assert.equal(report.readyEligible,true,`${mode} does not satisfy Ready gates`);
  for(let year=1950;year<=2022;year++){
    const keys=report.yearSongKeys[year]||[];
    if(!keys.length){await assert.rejects(E.chooseSong(year,mode),{code:'MODE_YEAR_UNAVAILABLE'});continue}
    assert.equal(new Set(keys).size,keys.length,`${mode}/${year}: duplicate usable identity`);
    const used=[];
    for(let count=0;count<(meta.repeatPolicy==='fixed'?1:keys.length);count++){
      const song=await E.chooseSong(year,mode,used),key=E.songUseKey(song);
      assert.equal(song.year,year);
      assert.ok(keys.includes(key),`${mode}/${year}: selection missing from coverage`);
      if(meta.yearBasis==='release'){
        assert.equal(E.isAlternateSongTitle(song.title),false,`${mode}/${year}: alternate selected`);
        assert.ok(!usedAcrossYears.has(key),`${mode}/${year}: repeated underlying identity ${key}`);
        usedAcrossYears.add(key);
        const label=String(song.sourceLabel||'');
        if(/release.year verified/i.test(label))assert.ok(song.yearEvidence||song.releaseYearEvidence,`${mode}/${year}: unsupported verification label`);
      }
      used.push(key);
    }
    if(meta.repeatPolicy!=='fixed')await assert.rejects(E.chooseSong(year,mode,used),{code:'NO_UNUSED_SONG'});
  }
  summary[mode]={status:report.statusLabel,usableYears:report.coverage,usableIdentities:report.songs,excludedRows:report.rawSongs-report.songs};
}
console.log('status-aware runtime variant audit passed',JSON.stringify(summary));
