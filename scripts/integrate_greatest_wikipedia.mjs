#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const cataloguePath=path.join(root,'data','catalogue.json');
const denied=new Set(['candle in the wind|elton john']);

globalThis.window={GSYEngine:{MODES:{greatest:{},australian:{},unexpected:{},number1_us:{},number1_au:{}}}};
eval(fs.readFileSync(path.join(root,'engine-v7.js'),'utf8'));
const E=globalThis.window.GSYEngine;

function fail(message){throw new Error(message)}

function loadEvidence(file){
  const rows=fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const accepted=[];
  for(const row of rows){
    const disposition=row.variantDisposition||row.disposition;
    if(disposition!=='verified')continue;
    const key=E.songUnderlyingKey(row);
    if(denied.has(key))continue;
    if(!Number.isInteger(row.releaseYear)||row.releaseYear<1950||row.releaseYear>2022)fail(`invalid release year for ${row.title}`);
    if(!String(row.sourceUrl||'').startsWith('https://en.wikipedia.org/wiki/'))fail(`missing source URL for ${row.title}`);
    if(!Number.isInteger(row.revisionId)||!row.revisionTimestamp)fail(`missing revision evidence for ${row.title}`);
    if(!String(row.artistEvidence||'').trim())fail(`missing performer evidence for ${row.title}`);
    accepted.push({...row,key});
  }
  return accepted;
}

function main(){
  const evidencePath=process.argv.slice(2).find(value=>!value.startsWith('--'));
  if(!evidencePath)fail('usage: integrate_greatest_wikipedia.mjs <proposal.jsonl> [--write]');
  const write=process.argv.includes('--write');
  const catalogue=JSON.parse(fs.readFileSync(cataloguePath,'utf8'));
  const buckets=catalogue.modes.greatest;
  const evidence=loadEvidence(evidencePath);
  const locations=new Map();
  for(const [year,songs] of Object.entries(buckets)){
    songs.forEach((song,index)=>locations.set(E.songUnderlyingKey(song),{year,index,song}));
  }
  const report={write,evidenceRows:evidence.length,updatedInPlace:0,rebucketed:0,rebuckets:[],missingMatches:[]};

  for(const row of evidence){
    const found=locations.get(row.key);
    if(!found){report.missingMatches.push({title:row.title,artist:row.artist,key:row.key});continue}
    const song=found.song;
    const oldYear=Number(found.year);
    const newYear=row.releaseYear;
    Object.assign(song,{
      year:newYear,
      releaseYear:newYear,
      canonicalKey:row.key,
      evidenceState:'externally_observed',
      evidenceDisposition:oldYear===newYear?'exact':'substantive_correction',
      releaseYearEvidence:'Wikipedia song/single infobox release date',
      releaseDateEvidence:row.releaseDate,
      source:'release-year-verified',
      sourceLabel:'Wikipedia release-year verified',
      sourceProvider:'Wikipedia',
      sourceUrl:row.sourceUrl,
      sourceTitle:row.title,
      sourceArtist:row.artistEvidence,
      sourceRevisionId:row.revisionId,
      sourceRevisionTimestamp:row.revisionTimestamp,
    });
    if(oldYear===newYear){
      report.updatedInPlace++;
      continue;
    }
    buckets[String(oldYear)]=buckets[String(oldYear)].filter(candidate=>candidate!==song);
    if(!buckets[String(newYear)])buckets[String(newYear)]=[];
    if(buckets[String(newYear)].some(candidate=>E.songUnderlyingKey(candidate)===row.key))fail(`target bucket already contains ${row.key}`);
    buckets[String(newYear)].push(song);
    report.rebucketed++;
    report.rebuckets.push({title:song.title,artist:song.artist,from:oldYear,to:newYear});
  }

  for(const year of Object.keys(buckets)){
    if(!buckets[year].length)delete buckets[year];
    else buckets[year].sort((a,b)=>String(a.title).localeCompare(String(b.title)));
  }
  const covered=new Set(Object.keys(buckets).map(Number));
  const missing=Array.from({length:73},(_,index)=>1950+index).filter(year=>!covered.has(year));
  catalogue.coverage.greatest=covered.size;
  catalogue.missing.greatest=missing;
  report.coverage=covered.size;
  report.missingYears=missing;

  if(report.missingMatches.length)fail(`${report.missingMatches.length} verified evidence rows did not match the live catalogue`);
  if(write){
    catalogue.version=Number(catalogue.version||0)+1;
    catalogue.generatedAt=new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
    fs.writeFileSync(cataloguePath,JSON.stringify(catalogue)+'\n','utf8');
  }
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
}

main();
