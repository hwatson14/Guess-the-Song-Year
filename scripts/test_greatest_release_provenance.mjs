#!/usr/bin/env node
import fs from 'node:fs';

const catalogue=JSON.parse(fs.readFileSync(new URL('../data/catalogue.json',import.meta.url),'utf8'));
const buckets=catalogue.modes.greatest;
const all=Object.entries(buckets).flatMap(([bucket,songs])=>songs.map(song=>({bucket:Number(bucket),song})));
const wikipedia=all.filter(({song})=>song.releaseYearEvidence==='Wikipedia song/single infobox release date');
if(wikipedia.length!==76)throw new Error(`expected 76 distinct Wikipedia-verified Greatest rows, found ${wikipedia.length}`);
for(const {bucket,song} of wikipedia){
  if(song.year!==bucket||song.releaseYear!==bucket)throw new Error(`${song.title} is in the wrong release bucket`);
  if(!String(song.sourceUrl||'').startsWith('https://en.wikipedia.org/wiki/'))throw new Error(`${song.title} lacks a Wikipedia source`);
  if(!song.sourceRevisionId||!song.sourceRevisionTimestamp)throw new Error(`${song.title} lacks revision evidence`);
}

const expect=(title,year)=>{
  const matches=all.filter(({song})=>song.title===title);
  if(matches.length!==1||matches[0].bucket!==year)throw new Error(`${title} must be in ${year}`);
};
expect('I Want to Hold Your Hand',1963);
expect('Need You Tonight',1987);
expect('Footloose',1984);
expect('Heat Waves',2020);
expect('Candle in the Wind 1997',1997);

const tears=buckets['1966'].find(song=>song.title==='96 Tears'&&String(song.artist).includes('Mysterians'));
if(!tears||tears.releaseYearEvidence!=='Wikipedia song/single infobox release date')throw new Error('the original 96 Tears recording lacks release evidence');
const candle=buckets['1997'].find(song=>song.title==='Candle in the Wind 1997'&&song.artist==='Elton John');
if(!candle||candle.evidenceState!=='externally_observed'||!String(candle.sourceUrl||'').startsWith('https://www.officialcharts.com/'))throw new Error('Candle in the Wind 1997 must carry accepted 1997 release evidence');
const covered=Object.keys(buckets).map(Number).filter(year=>buckets[year].length);
const missing=Array.from({length:73},(_,i)=>1950+i).filter(year=>!covered.includes(year));
if(catalogue.coverage.greatest!==covered.length||JSON.stringify(catalogue.missing.greatest)!==JSON.stringify(missing))throw new Error("Greatest coverage metadata must agree with the actual catalogue");
console.log('Greatest release-year provenance checks passed (76 Wikipedia rows plus accepted supplemental evidence)');