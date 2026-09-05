#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cataloguePath=path.join(root,'data','catalogue.json');
const modesPath=path.join(root,'data','modes.json');

globalThis.window={GSYEngine:{MODES:{greatest:{},australian:{},unexpected:{},number1_us:{},number1_au:{}}}};
eval(fs.readFileSync(path.join(root,'engine-v7.js'),'utf8'));
const E=globalThis.window.GSYEngine;

function quality(song){
  let score=0;
  if(song.spotifyId)score+=8;
  if(song.youtubeId)score+=4;
  if(song.canonicalKey)score+=3;
  if(song.musicbrainzId&&song.yearEvidence)score+=3;
  if(song.evidenceState==='externally_observed')score+=2;
  if(!E.isAlternateSongTitle(song.title))score+=4;
  if(Number(song.mbScore||0)>=70)score+=1;
  return score;
}

function main(){
  const write=process.argv.includes('--write');
  const catalogue=JSON.parse(fs.readFileSync(cataloguePath,'utf8'));
  const manifest=JSON.parse(fs.readFileSync(modesPath,'utf8')).modes;
  const report={write,removed:0,modes:{}};

  for(const [modeId,buckets] of Object.entries(catalogue.modes)){
    if(manifest[modeId]?.repeatPolicy!=='unique')continue;
    const modeReport={removed:0,years:{}};
    for(const [year,rows] of Object.entries(buckets)){
      const groups=new Map();
      rows.forEach((song,index)=>{
        const key=E.songUnderlyingKey(song);
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push({song,index,score:quality(song)});
      });
      const kept=[];
      for(const candidates of groups.values()){
        candidates.sort((a,b)=>b.score-a.score||a.index-b.index);
        kept.push(candidates[0]);
      }
      kept.sort((a,b)=>a.index-b.index);
      const removed=rows.length-kept.length;
      if(removed){
        buckets[year]=kept.map(item=>item.song);
        modeReport.removed+=removed;
        modeReport.years[year]=removed;
      }
    }
    if(modeReport.removed){
      report.modes[modeId]=modeReport;
      report.removed+=modeReport.removed;
    }
  }

  if(write&&report.removed){
    catalogue.version=Number(catalogue.version||0)+1;
    catalogue.generatedAt=new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
    fs.writeFileSync(cataloguePath,JSON.stringify(catalogue)+'\n','utf8');
  }
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
}

main();
