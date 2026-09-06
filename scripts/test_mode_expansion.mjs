import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalogue=JSON.parse(fs.readFileSync(path.join(ROOT,'data/catalogue.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'data/modes.json'),'utf8'));
const overlay=JSON.parse(fs.readFileSync(path.join(ROOT,'data/mode-expansion.json'),'utf8'));
const yearMapMatch=fs.readFileSync(path.join(ROOT,'engine.js'),'utf8').match(/const YEAR_MAP=(\[[^;]+\]);/);
assert.ok(yearMapMatch,'YEAR_MAP must be available');
const yearMap=JSON.parse(yearMapMatch[1]);
class AppError extends Error{constructor(code,message,status=0){super(message);this.code=code;this.status=status}}
const baseModes=Object.fromEntries(Object.entries(manifest.modes).filter(([id])=>['greatest','australian','unexpected','number1_us','number1_au'].includes(id)));
const engine={
  MODES:structuredClone(baseModes),AppError,
  baseCardYear:id=>Number(yearMap[id])||0,
  loadCatalogue:async()=>catalogue,
  resolveSong:async(song,kind)=>({kind,id:kind==='spotify'?song.spotifyId:song.youtubeId}),
  getProvider:()=> 'spotify',
};
const context={
  window:{GSYEngine:engine},
  console,
  fetch:async url=>({ok:true,status:200,json:async()=>{
    if(String(url).includes('mode-expansion.json'))return structuredClone(overlay);
    throw new Error(`unexpected fetch ${url}`);
  }}),
};
vm.runInNewContext(fs.readFileSync(path.join(ROOT,'engine-v7.js'),'utf8'),context);
vm.runInNewContext(fs.readFileSync(path.join(ROOT,'mode-expansion.js'),'utf8'),context);

const expanded=await engine.loadCatalogue();
const diagnostics=engine.modeExpansionDiagnostics();
assert.deepEqual(diagnostics.unresolved,[],'every promoted relationship must resolve to a canonical song');
assert.deepEqual(diagnostics.ambiguous,[],'every promoted relationship must resolve unambiguously');
assert.ok(diagnostics.counts.movie_themes>=10,'movie preview must contain a useful reviewed pool');
assert.ok(diagnostics.counts.tv_themes>=6,'TV preview must contain a useful reviewed pool');
assert.ok(diagnostics.counts.remix_original_year>=3,'remix preview must contain reviewed provider recordings');
assert.equal(diagnostics.counts.screen_themes,diagnostics.counts.movie_themes+diagnostics.counts.tv_themes,'combined screen mode must be the exact derived union');

const all=buckets=>Object.values(buckets||{}).flat();
const movies=all(expanded.modes.movie_themes),tv=all(expanded.modes.tv_themes),screen=all(expanded.modes.screen_themes),remixes=all(expanded.modes.remix_original_year);
assert.equal(screen.length,movies.length+tv.length,'screen catalogue must not have an independently curated third list');
assert.ok(movies.every(row=>row.relationshipType==='screen-work-theme'&&row.screenWorkType==='movie'));
assert.ok(tv.every(row=>row.relationshipType==='screen-work-theme'&&row.screenWorkType==='tv'));
assert.ok([...movies,...tv].every(row=>Number(row.year)===Number(row.workAnswerYear)),'screen relationship answer year must equal work release/premiere year');
assert.ok([...movies,...tv].every(row=>row.songId&&Number.isFinite(Number(row.canonicalReleaseAnswerYear))),'screen relationships must retain canonical song identity and original release truth');
assert.ok([...movies,...tv].some(row=>Number(row.year)!==Number(row.canonicalReleaseAnswerYear)),'screen mode must prove work year can differ from song release year');
assert.ok(remixes.every(row=>row.songId&&row.playbackVariant==='remix'&&row.spotifyId&&row.youtubeId),'remix rows require canonical identity and explicit reviewed provider assets');
assert.ok(remixes.every(row=>Number(row.year)===Number(row.originalAnswerYear)),'remix answer year must remain the original song year');

const reports=await engine.modeReports();
for(const id of ['movie_themes','tv_themes','screen_themes','remix_original_year']){
  assert.equal(reports[id].status,'preview');
  assert.equal(reports[id].selectable,true,`${id} should only be exposed when playable`);
  assert.ok(reports[id].songs>0);
}
assert.equal(reports.movie_themes.yearBasis,'screen');
assert.equal(reports.tv_themes.yearBasis,'screen');
assert.equal(reports.screen_themes.yearBasis,'screen');
assert.equal(reports.remix_original_year.yearBasis,'original');

const remix=remixes[0];
assert.equal((await engine.resolveSong(remix,'spotify')).id,remix.spotifyId);
assert.equal((await engine.resolveSong(remix,'youtube')).id,remix.youtubeId);
await assert.rejects(engine.resolveSong({...remix,youtubeId:''},'youtube'),{code:'REMIX_PROVIDER_UNAVAILABLE'});

console.log('mode expansion contracts passed',diagnostics.counts);
