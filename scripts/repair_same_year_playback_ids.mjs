#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cataloguePath=path.join(root,'data','catalogue.json');
const preferredArtistBySpotify={
  '4PEeZ2U4UfP2Jo8EtIOjus':'mysterians',
};

globalThis.window={GSYEngine:{MODES:{greatest:{},australian:{},unexpected:{},number1_us:{},number1_au:{}}}};
eval(fs.readFileSync(path.join(root,'engine-v7.js'),'utf8'));
const E=globalThis.window.GSYEngine;

function norm(value){
  return String(value||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
}

function score(song,spotifyId,index){
  let value=0;
  const preferred=preferredArtistBySpotify[spotifyId];
  if(preferred&&norm(song.artist).includes(preferred))value+=1000;
  if(!E.isAlternateSongTitle(song.title))value+=100;
  if(song.canonicalKey&&song.musicbrainzId&&song.yearEvidence)value+=50;
  if(song.evidenceState==='externally_observed')value+=20;
  if(!/[a-zÀ-ÿ][A-Z]/.test(String(song.artist||'')))value+=10;
  value+=Math.max(0,5-Math.floor(String(song.title||'').length/30));
  value-=index/1000;
  return value;
}

function main(){
  const write=process.argv.includes('--write');
  const catalogue=JSON.parse(fs.readFileSync(cataloguePath,'utf8'));
  const report={write,cleared:0,modes:{},skippedCrossYear:[]};

  for(const [modeId,buckets] of Object.entries(catalogue.modes)){
    const occurrences=new Map();
    for(const [year,rows] of Object.entries(buckets)){
      rows.forEach((song,index)=>{
        const spotifyId=String(song.spotifyId||'').trim();
        if(!spotifyId)return;
        if(!occurrences.has(spotifyId))occurrences.set(spotifyId,[]);
        occurrences.get(spotifyId).push({year,index,song});
      });
    }
    let cleared=0;
    for(const [spotifyId,items] of occurrences){
      if(items.length<2)continue;
      const years=new Set(items.map(item=>item.year));
      if(years.size>1){
        report.skippedCrossYear.push({modeId,spotifyId,years:[...years].sort()});
        continue;
      }
      items.sort((a,b)=>score(b.song,spotifyId,b.index)-score(a.song,spotifyId,a.index));
      for(const item of items.slice(1)){
        delete item.song.spotifyId;
        item.song.playbackEvidenceState='needs_reenrichment';
        item.song.playbackIssue='duplicate_spotify_id_reused_in_same_mode_year';
        cleared++;
      }
    }
    if(cleared){
      report.modes[modeId]={cleared};
      report.cleared+=cleared;
    }
  }

  if(write&&report.cleared){
    catalogue.version=Number(catalogue.version||0)+1;
    catalogue.generatedAt=new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
    fs.writeFileSync(cataloguePath,JSON.stringify(catalogue)+'\n','utf8');
  }
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
}

main();
