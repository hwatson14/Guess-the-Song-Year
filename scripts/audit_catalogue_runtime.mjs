import assert from 'node:assert/strict';
import {catalogueEngine,loadProductionCatalogue} from './catalogue_runtime.mjs';

const {data,manifest}=loadProductionCatalogue(),E=catalogueEngine(data,manifest),reports=await E.modeReports();
const catalogueModes=new Set(Object.keys(data.modes)),declaredModes=new Set(Object.keys(manifest.modes));
for(const mode of catalogueModes)assert.ok(declaredModes.has(mode),`catalogue contains undeclared mode ${mode}`);
for(const [mode,meta] of Object.entries(manifest.modes)){
  if(catalogueModes.has(mode))continue;
  assert.equal(meta.status,'building',`${mode}: only building modes may be declared without catalogue rows`);
}
const summary={};
for(const [mode,meta] of Object.entries(manifest.modes)){
  const report=reports[mode],usedAcrossYears=new Set();
  assert.ok(report,`${mode}: manifest-declared mode has no runtime report`);
  if(meta.status==='building'){
    assert.equal(report.selectable,false,`${mode}: building mode must not be selectable`);
    if(!catalogueModes.has(mode)){
      assert.equal(report.songs,0,`${mode}: absent building mode unexpectedly reports songs`);
      assert.equal(report.coverage,0,`${mode}: absent building mode unexpectedly reports coverage`);
    }
    continue;
  }
  assert.ok(catalogueModes.has(mode),`${mode}: non-building mode must have catalogue rows`);
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