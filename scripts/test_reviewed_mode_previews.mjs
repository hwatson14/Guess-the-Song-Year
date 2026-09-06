import assert from 'node:assert/strict';
import fs from 'node:fs';
import {catalogueEngine,loadProductionCatalogue} from './catalogue_runtime.mjs';

const db=JSON.parse(fs.readFileSync('data/song-database.json','utf8'));
const report=JSON.parse(fs.readFileSync('verification/mode-expansion/promotion-report.json','utf8'));
const {data,manifest}=loadProductionCatalogue();
const E=catalogueEngine(data,manifest);
const reports=await E.modeReports();
const rows=mode=>Object.values(data.modes?.[mode]||{}).flat();
const memberships=mode=>db.memberships.filter(m=>m.mode===mode);

for(const mode of ['movie_themes','tv_themes','screen_themes','remix_original_year']){
  assert.equal(manifest.modes[mode].status,'preview',`${mode} should be a reviewed Preview`);
  assert.ok(rows(mode).length>0,`${mode} should have playable rows`);
  assert.equal(reports[mode].selectable,true,`${mode} should be selectable`);
}
assert.equal(manifest.modes.one_hit_wonders.status,'building','One Hit Wonders remains separately curated');
assert.equal(memberships('screen_themes').length,0,'combined screen mode must never have direct source memberships');
assert.equal(rows('screen_themes').length,rows('movie_themes').length+rows('tv_themes').length,'combined screen mode is exactly the source relationship union');

for(const mode of ['movie_themes','tv_themes'])for(const membership of memberships(mode)){
  const meta=membership.metadata||{};
  assert.ok(meta.screenWorkId&&meta.workTitle&&['movie','tv'].includes(meta.workType));
  assert.equal(meta.workAnswerYear,membership.year);
  const generated=(data.modes[mode]?.[String(meta.workAnswerYear)]||[]).find(row=>row.songId===membership.songId&&row.screenWorkId===meta.screenWorkId);
  assert.ok(generated,`screen membership must compile: ${meta.relationshipId}`);
  assert.equal(generated.year,meta.workAnswerYear);
  assert.equal(generated.screenWorkTitle,meta.workTitle,'reveal compatibility alias should be retained');
  assert.equal(generated.screenWorkType,meta.workType,'reveal compatibility work type should be retained');
}

for(const membership of memberships('remix_original_year')){
  const song=db.songs[membership.songId],year=Number(song.release.answerYear);
  assert.equal(year,Number(membership.metadata.originalAnswerYear),'remix answer is canonical original release year');
  const generated=(data.modes.remix_original_year?.[String(year)]||[]).find(row=>row.songId===membership.songId&&row.relationshipId===membership.metadata.relationshipId);
  assert.ok(generated,`remix membership must compile: ${membership.metadata.relationshipId}`);
  assert.equal(generated.year,year);
  assert.equal(generated.playbackPolicy,'membership-explicit');
  assert.equal(generated.playbackVariant,'remix');
  for(const provider of ['spotify','youtube'])if(membership.providerRefs?.[provider]){
    assert.equal(generated[provider+'Id'],membership.providerRefs[provider]);
    assert.ok(song.providers[provider].links.some(link=>link.id===membership.providerRefs[provider]&&link.state==='verified'));
    assert.notEqual(song.providers[provider].preferredId,membership.providerRefs[provider],'remix asset must not become normal preferred playback');
    for(const [mode,buckets] of Object.entries(data.modes))if(mode!=='remix_original_year')for(const row of Object.values(buckets).flat()){
      if(row.songId===membership.songId)assert.notEqual(row[provider+'Id'],membership.providerRefs[provider],`normal ${mode} row must not inherit remix ${provider} playback`);
    }
  }
}

assert.equal(report.promoted.movie_themes,memberships('movie_themes').length);
assert.equal(report.promoted.tv_themes,memberships('tv_themes').length);
assert.equal(report.promoted.remix_original_year,memberships('remix_original_year').length);
assert.equal(report.promoted.screen_themes,rows('screen_themes').length);
console.log(`Reviewed mode previews passed: ${report.promoted.movie_themes} movie, ${report.promoted.tv_themes} TV, ${report.promoted.screen_themes} combined, ${report.promoted.remix_original_year} remixes.`);
