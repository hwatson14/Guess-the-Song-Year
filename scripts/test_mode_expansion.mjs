import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileDatabase} from './song_database.mjs';
import {catalogueEngine,loadProductionCatalogue} from './catalogue_runtime.mjs';

const {data:production,manifest}=loadProductionCatalogue();
const database=JSON.parse(fs.readFileSync('data/song-database.json','utf8'));
const expected=['movie_themes','tv_themes','screen_themes','remix_original_year','one_hit_wonders'];
for(const id of expected)assert.ok(manifest.modes[id],`manifest declares ${id}`);
assert.equal(manifest.modes.one_hit_wonders.yearBasis,'release');
assert.equal(manifest.modes.movie_themes.yearBasis,'screen');
assert.deepEqual(manifest.modes.screen_themes.compositeOf,['movie_themes','tv_themes']);
assert.equal(manifest.modes.remix_original_year.playbackVariant,'membership_explicit');

// Production acceptance: each new mode has a deliberately small reviewed Preview pool.
const E=catalogueEngine(production,manifest);
const reports=await E.modeReports();
const expectedCounts={movie_themes:14,tv_themes:7,screen_themes:21,remix_original_year:4,one_hit_wonders:7};
for(const [id,count] of Object.entries(expectedCounts)){
  assert.ok(E.MODES[id],`runtime retains ${id}`);
  assert.ok(reports[id],`runtime reports ${id}`);
  assert.equal(reports[id].status,'preview',`${id} is explicitly Preview`);
  assert.equal(reports[id].selectable,true,`${id} is playable once reviewed rows exist`);
  assert.equal(reports[id].songs,count,`${id} reviewed pool count changes must be intentional`);
}

const movieRows=Object.values(production.modes.movie_themes||{}).flat();
const tvRows=Object.values(production.modes.tv_themes||{}).flat();
const screenRows=Object.values(production.modes.screen_themes||{}).flat();
const remixRows=Object.values(production.modes.remix_original_year||{}).flat();
const oneHitRows=Object.values(production.modes.one_hit_wonders||{}).flat();
assert.equal(movieRows.length,14);
assert.equal(tvRows.length,7);
assert.equal(screenRows.length,movieRows.length+tvRows.length,'combined screen mode is exactly the derived source union');
assert.equal(remixRows.length,4);
assert.equal(oneHitRows.length,7);

for(const row of [...movieRows,...tvRows]){
  assert.ok(row.songId&&row.canonicalKey,'screen relationship retains canonical song identity');
  assert.ok(row.screenWorkId&&row.workTitle&&['movie','tv'].includes(row.workType),'screen relationship has stable work identity');
  assert.equal(Number(row.year),Number(row.workAnswerYear),'screen answer uses represented work year');
  assert.equal(row.relationshipState,'reviewed');
  assert.ok(String(row.workEvidenceUrl||'').startsWith('https://'),'screen relationship has row-level work-year evidence');
}
assert.ok([...movieRows,...tvRows].some(row=>{
  const song=database.songs[row.songId];return song&&Number(song.release.answerYear)!==Number(row.workAnswerYear);
}),'screen mode proves work year is independent of canonical song release year');
for(const row of screenRows)assert.ok(['movie_themes','tv_themes'].includes(row.sourceMode),'combined rows identify their source relationship mode');

for(const row of remixRows){
  const song=database.songs[row.songId];
  assert.ok(song,'remix membership points to canonical original song');
  assert.equal(row.playbackPolicy,'membership-explicit');
  assert.ok(row.spotifyId&&row.youtubeId,'every promoted remix has explicit reviewed playback on both providers');
  assert.ok(row.playedVersion&&row.remixer,'reveal metadata identifies the played remix');
  assert.equal(Number(row.year),Number(song.release.answerYear),'remix answer year remains canonical original release year');
  assert.equal(Number(row.originalAnswerYear),Number(song.release.answerYear));
  assert.ok(row.originalYearEvidenceUrl&&row.spotifyEvidenceUrl&&row.youtubeEvidenceUrl,'remix membership retains original-year and provider evidence');
  for(const [provider,id] of [['spotify',row.spotifyId],['youtube',row.youtubeId]]){
    const asset=song.providers?.[provider]?.links?.find(link=>link.id===id);
    assert.ok(asset&&asset.state==='verified'&&asset.evidence?.recordingMatch===true,`${provider} remix asset is reviewed and attached to the canonical master`);
  }
}

for(const row of oneHitRows){
  assert.equal(row.qualificationState,'core');
  assert.equal(row.qualificationDisposition,'approved');
  assert.ok(String(row.qualificationBasis||'').trim(),'one-hit membership records its qualification rationale');
  assert.ok(String(row.qualificationEvidenceUrl||'').startsWith('https://'),'one-hit membership has row-level qualification evidence');
  const song=database.songs[row.songId];
  assert.ok(song&&Number(row.year)===Number(song.release.answerYear),'One Hit Wonders uses canonical release answer year');
}
assert.equal(database.memberships.filter(m=>m.mode==='screen_themes').length,0,'combined screen mode has no independent source memberships');
assert.equal(database.memberships.filter(m=>m.mode==='one_hit_wonders'&&['review','review_recent'].includes(m.metadata?.qualificationState)).length,0,'disputed/recent One Hit Wonder seed rows are never auto-promoted');

// Same canonical audio can represent two different hidden screen answers; runtime identity must preserve the relationship.
assert.notEqual(E.songUnderlyingKey({songId:'song_x',screenWorkId:'movie/work-a'}),E.songUnderlyingKey({songId:'song_x',screenWorkId:'movie/work-b'}));

// Compiler semantics remain guarded independently of production content.
const emptyProviders=()=>({spotify:{preferredId:null,links:[]},youtube:{preferredId:null,links:[]}});
const remixId='1234567890123456789012';
const fixture={
  schemaVersion:2,
  catalogue:{version:10,years:[1999,2000],sources:{}},
  songs:{
    song_release:{id:'song_release',canonicalKey:'original|artist',title:'Original',artist:'Artist',release:{answerYear:1999,year:null,state:'unresolved',claims:[]},providers:{spotify:{preferredId:null,links:[{id:remixId,url:`https://open.spotify.com/track/${remixId}`,state:'unverified'}]},youtube:{preferredId:null,links:[]}}},
    song_movie:{id:'song_movie',canonicalKey:'movie theme|composer',title:'Movie Theme',artist:'Composer',release:{answerYear:1985,year:null,state:'unresolved',claims:[]},providers:emptyProviders()},
    song_tv:{id:'song_tv',canonicalKey:'tv theme|composer',title:'TV Theme',artist:'Composer',release:{answerYear:1995,year:null,state:'unresolved',claims:[]},providers:emptyProviders()},
  },
  memberships:[
    {songId:'song_release',mode:'one_hit_wonders',year:2000,metadata:{qualificationState:'core',qualificationBasis:'fixture'}},
    {songId:'song_release',mode:'remix_original_year',year:2000,metadata:{playedVersion:'Later Remix'},providerRefs:{spotify:remixId,youtube:null}},
    {songId:'song_movie',mode:'movie_themes',year:1999,metadata:{screenWorkId:'movie/example',workType:'movie',workTitle:'Example Movie',workAnswerYear:2000,themeRole:'main-theme'}},
    {songId:'song_tv',mode:'tv_themes',year:2000,metadata:{screenWorkId:'tv/example',workType:'tv',workTitle:'Example Show',workAnswerYear:1999,themeRole:'main-theme'}},
  ],
};
const compiled=compileDatabase(fixture,manifest);
assert.ok(compiled.modes.one_hit_wonders[1999],`One Hit Wonders uses the canonical release year, not membership.year`);
assert.ok(!compiled.modes.one_hit_wonders[2000]);
assert.equal(compiled.modes.remix_original_year[1999][0].spotifyId,remixId,'remix membership overrides normal playback with reviewed explicit asset');
assert.equal(compiled.modes.remix_original_year[1999][0].youtubeId,'','missing remix provider stays explicitly empty');
assert.equal(compiled.modes.remix_original_year[1999][0].playbackPolicy,'membership-explicit');
assert.equal(compiled.modes.movie_themes[2000][0].year,2000,'movie mode uses represented work release year');
assert.equal(compiled.modes.tv_themes[1999][0].year,1999,'TV mode uses series-premiere year');
assert.equal(compiled.modes.screen_themes[2000][0].sourceMode,'movie_themes');
assert.equal(compiled.modes.screen_themes[1999][0].sourceMode,'tv_themes');
assert.equal(Object.values(compiled.modes.screen_themes).flat().length,2,'combined mode is derived from Movie + TV source relationships');
const directComposite=structuredClone(fixture);
directComposite.memberships.push({songId:'song_movie',mode:'screen_themes',year:2000,metadata:{screenWorkId:'movie/example',workType:'movie',workTitle:'Example Movie',workAnswerYear:2000}});
assert.throws(()=>compileDatabase(directComposite,manifest),/Composite mode cannot have direct memberships/);
const badScreen=structuredClone(fixture);delete badScreen.memberships.find(m=>m.mode==='movie_themes').metadata.screenWorkId;
assert.throws(()=>compileDatabase(badScreen,manifest),/screenWorkId/);
const badMode=structuredClone(fixture);badMode.memberships[0].mode='invented_mode';
assert.throws(()=>compileDatabase(badMode,manifest),/Invalid mode membership/);

console.log('mode expansion production and compiler contracts passed',expectedCounts);