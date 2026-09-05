import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {ROOT,catalogueEngine,loadProductionCatalogue} from './catalogue_runtime.mjs';

export const cleanupId=entry=>createHash('sha256').update(JSON.stringify([entry.mode,entry.year,entry.original??entry.replacement])).digest('hex').slice(0,20);
export function applyCatalogueCleanup(input,manifest,decisions,priorArchive=[]){
  const data=structuredClone(input),archive=structuredClone(priorArchive),E=catalogueEngine(data,manifest);
  const changes=[],known=new Set(archive.map(entry=>entry.id));
  const addAlias=(row,key)=>{
    if(key&&key!==E.songUseKey(row))row.legacyKeys=[...new Set([...(row.legacyKeys||[]),key])].sort();
  };
  // Remove all reviewed originals before inserting replacements: an excluded alternate
  // may share the replacement's identity and is itself archived in this same transaction.
  for(const decision of decisions){
    if(known.has(cleanupId(decision))||decision.action==='add')continue;
    const {mode,year,original}=decision,pool=data.modes[mode]?.[year];
    const matches=(pool||[]).map((row,index)=>({row,index})).filter(({row})=>JSON.stringify(row)===JSON.stringify(original));
    if(matches.length!==1)throw new Error('Cleanup original must match exactly once: '+mode+'/'+year+'/'+original?.title);
    pool.splice(matches[0].index,1);
  }
  for(const decision of decisions){
    const {mode,year,original,action,reason,replacement}=decision,id=cleanupId(decision);
    if(known.has(id))continue;
    if(!['add','repair','archive_duplicate','archive_unresolved'].includes(action)||!reason||!data.modes[mode])throw new Error('Invalid cleanup decision '+id);
    if(action==='add'){
      if(original)throw new Error('Addition cannot remove an original');
    }
    if(replacement){
      if(!['repair','add'].includes(action)||!Number.isInteger(replacement.year)||!data.years.includes(replacement.year)||
        !replacement.title||!replacement.artist||!replacement.releaseYearEvidence||!replacement.sourceUrl?.startsWith('https://')||
        !replacement.sourceProvider||replacement.evidenceState!=='externally_observed'||
        replacement.releaseYear!==replacement.year)throw new Error('Repair lacks release/identity evidence: '+(original?.title||replacement.title));
      const identity=E.songUseKey(replacement);
      if(Object.values(data.modes[mode]).flat().some(row=>E.songUseKey(row)===identity))
        throw new Error('Repair would duplicate retained identity: '+identity);
      const row=structuredClone(replacement);
      if(action==='repair')addAlias(row,decision.originalKey||E.songUseKey(original));
      (data.modes[mode][replacement.year]??=[]).push(row);
    }else if(['repair','add'].includes(action))throw new Error('Repair/addition requires a replacement: '+id);
    if(action==='archive_duplicate'){
      const target=decision.retained;
      const candidates=Object.values(data.modes[mode]).flat().filter(row=>E.songUseKey(row)===target?.key);
      if(candidates.length!==1||candidates[0].year!==target.year)throw new Error('Duplicate must point to one retained identity: '+id);
      addAlias(candidates[0],decision.originalKey||E.songUseKey(original));
    }
    archive.push({id,...structuredClone(decision)});
    known.add(id);changes.push({id,mode,year,action,title:original?.title||replacement?.title,replacementYear:replacement?.year});
  }
  for(const [mode,buckets] of Object.entries(data.modes)){
    for(const year of Object.keys(buckets))if(!buckets[year].length)delete buckets[year];
    data.coverage[mode]=Object.keys(buckets).length;
    data.missing[mode]=data.years.filter(year=>!buckets[year]?.length);
  }
  return {data,archive,changes};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const {data:before,manifest}=loadProductionCatalogue();
  const decisionFile=path.join(ROOT,'verification/catalogue_cleanup_decisions.json'),archiveFile=path.join(ROOT,'verification/catalogue_cleanup_archive.json');
  const decisions=JSON.parse(fs.readFileSync(decisionFile,'utf8'));
  const previous=fs.existsSync(archiveFile)?JSON.parse(fs.readFileSync(archiveFile,'utf8')).entries:[];
  const result=applyCatalogueCleanup(before,manifest,decisions,previous);
  const reports=await catalogueEngine(result.data,manifest).modeReports();
  for(const [mode,report] of Object.entries(reports)){
    if(report.rawSongs!==report.songs)throw new Error('Cleanup leaves filtered rows in '+mode);
    if(report.coverage<before.coverage[mode])throw new Error('Cleanup would lose year coverage in '+mode);
  }
  if(process.argv.includes('--write')&&result.changes.length){
    result.data.version=Number(before.version)+1;result.data.generatedAt=new Date().toISOString();
    // Preserve every full source row before changing the shipped catalogue.
    fs.writeFileSync(archiveFile,JSON.stringify({schemaVersion:1,sourceCatalogueVersion:14,entries:result.archive},null,2)+'\n');
    fs.writeFileSync(path.join(ROOT,'data/catalogue.json'),JSON.stringify(result.data)+'\n');
  }
  console.log(JSON.stringify({write:process.argv.includes('--write'),changes:result.changes.length,
    actions:result.changes.reduce((out,x)=>(out[x.action]=(out[x.action]||0)+1,out),{}),
    archivedOriginals:result.archive.filter(x=>x.original).length,
    modes:Object.fromEntries(Object.entries(reports).map(([mode,r])=>[mode,{stored:r.rawSongs,usable:r.songs,coverage:r.coverage}]))},null,2));
}
