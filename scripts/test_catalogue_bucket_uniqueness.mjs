#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
globalThis.window={GSYEngine:{MODES:{greatest:{},australian:{},unexpected:{},number1_us:{},number1_au:{}}}};
eval(fs.readFileSync(path.join(root,'engine-v7.js'),'utf8'));
const E=globalThis.window.GSYEngine;
const catalogue=JSON.parse(fs.readFileSync(path.join(root,'data','catalogue.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data','modes.json'),'utf8')).modes;

for(const [modeId,buckets] of Object.entries(catalogue.modes)){
  for(const [year,rows] of Object.entries(buckets)){
    if(manifest[modeId]?.repeatPolicy==='unique'){
      const keys=rows.map(song=>E.songUnderlyingKey(song));
      if(new Set(keys).size!==keys.length)throw new Error(`${modeId} ${year} contains repeated underlying songs`);
    }
    if(manifest[modeId]?.repeatPolicy==='fixed'&&rows.length!==1){
      throw new Error(`${modeId} ${year} must contain exactly one fixed chart leader`);
    }
  }
}

console.log('catalogue bucket uniqueness checks passed');
