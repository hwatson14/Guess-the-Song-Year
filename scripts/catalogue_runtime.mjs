import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function catalogueEngine(data,manifest){
  const match=fs.readFileSync(path.join(ROOT,'engine.js'),'utf8').match(/const YEAR_MAP=(\[[^;]+\]);/);
  if(!match)throw new Error('YEAR_MAP not found');
  const years=JSON.parse(match[1]);
  class AppError extends Error{constructor(code,message){super(message);this.code=code}}
  const engine={MODES:structuredClone(manifest.modes),AppError,baseCardYear:id=>years[id],loadCatalogue:async()=>data};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT,'engine-v7.js'),'utf8'),{window:{GSYEngine:engine}});
  return engine;
}
export function loadProductionCatalogue(){
  return {
    data:JSON.parse(fs.readFileSync(path.join(ROOT,'data/catalogue.json'),'utf8')),
    manifest:JSON.parse(fs.readFileSync(path.join(ROOT,'data/modes.json'),'utf8')),
  };
}
