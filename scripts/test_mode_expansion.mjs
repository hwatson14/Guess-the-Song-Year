import assert from 'node:assert/strict';
import {compileDatabase} from './song_database.mjs';
import {catalogueEngine,loadProductionCatalogue} from './catalogue_runtime.mjs';

const {data:production,manifest}=loadProductionCatalogue();
const expected=['movie_themes','tv_themes','screen_themes','remix_original_year','one_hit_wonders'];
for(const id of expected)assert.ok(manifest.modes[id],`manifest declares ${id}`);
assert.equal(manifest.modes.one_hit_wonders.yearBasis,'release');
assert.equal(manifest.modes.movie_themes.yearBasis,'screen');
assert.deepEqual(manifest.modes.screen_themes.compositeOf,['movie_themes','tv_themes']);
assert.equal(manifest.modes.remix_original_year.playbackVariant,'membership_explicit');

// Browser/runtime reporting must retain manifest-declared modes instead of deleting unknown IDs.
const E=catalogueEngine(production,manifest);
const reports=await E.modeReports();
for(const id of expected){
  assert.ok(E.MODES[id],`runtime retains ${id}`);
  assert.ok(reports[id],`runtime reports ${id}`);
  assert.equal(reports[id].selectable,false,`${id} remains disabled until it has a reviewed playable pool`);
}

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

console.log('mode expansion manifest, release/screen/composite and explicit-remix semantics passed');
