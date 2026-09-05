#!/usr/bin/env node
import fs from 'node:fs';

const catalogue=JSON.parse(fs.readFileSync(new URL('../data/catalogue.json',import.meta.url),'utf8'));
for(const [modeId,buckets] of Object.entries(catalogue.modes)){
  for(const [year,rows] of Object.entries(buckets)){
    for(const field of ['spotifyId','youtubeId']){
      const values=rows.map(song=>String(song[field]||'').trim()).filter(Boolean);
      if(new Set(values).size!==values.length){
        throw new Error(`${modeId} ${year} reuses ${field}`);
      }
    }
  }
}
console.log('same-year playback-ID uniqueness checks passed');
