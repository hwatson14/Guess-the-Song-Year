import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT,catalogueEngine,loadProductionCatalogue} from './catalogue_runtime.mjs';

export function integrateYearGaps(data,manifest,evidence){
  const E=catalogueEngine(data,manifest),added=[];
  for(const input of evidence){
    const {mode,...song}=input;
    delete song.canonicalKey;
    if(!data.modes[mode]||!Number.isInteger(song.releaseYear)||song.year!==song.releaseYear||
       !data.years.includes(song.year)||!song.releaseYearEvidence||!song.sourceUrl?.startsWith('https://'))
      throw new Error('Invalid release-gap evidence: '+song.title);
    song.canonicalKey=E.songUseKey(song);
    const existing=Object.entries(data.modes[mode]).flatMap(([year,pool])=>pool
      .filter(row=>E.songUseKey(row)===song.canonicalKey).map(row=>({year:Number(year),row})));
    if(existing.length){
      if(existing.length!==1||existing[0].year!==song.year||existing[0].row.source!=='release-gap-audit')
        throw new Error('Existing identity needs explicit reconciliation: '+song.canonicalKey);
      continue;
    }
    (data.modes[mode][song.year]??=[]).push(song);
    added.push({mode,title:song.title,year:song.year,key:song.canonicalKey});
  }
  for(const [mode,buckets] of Object.entries(data.modes)){
    data.coverage[mode]=Object.values(buckets).filter(pool=>pool.length).length;
    data.missing[mode]=data.years.filter(year=>!buckets[year]?.length);
  }
  return added;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const {data,manifest}=loadProductionCatalogue();
  const evidence=JSON.parse(fs.readFileSync(path.join(ROOT,'verification/year_gap_release_evidence.json'),'utf8'));
  const added=integrateYearGaps(data,manifest,evidence);
  if(process.argv.includes('--write')&&added.length){
    data.version=Number(data.version)+1;data.generatedAt=new Date().toISOString();
    data.sources.greatest='Legacy Greatest Hits with 76 revision-backed release-year rows and sourced gap additions; remaining records are under reconciliation. No cross-mode fallback.';
    data.sources.australian='Australian artists with sourced release-year gap additions and the existing repeat-year audit; remaining legacy records are under reconciliation. No cross-mode fallback.';
    fs.writeFileSync(path.join(ROOT,'data/catalogue.json'),JSON.stringify(data)+'\n');
  }
  console.log(JSON.stringify({write:process.argv.includes('--write'),added,coverage:data.coverage},null,2));
}
