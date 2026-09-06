import assert from 'node:assert/strict';
import {applyReviewedLinks} from './promote_reviewed_links.mjs';
import {compileDatabase} from './song_database.mjs';
const url='https://open.spotify.com/track/0000000000000000000000',sourceUrl='https://musicbrainz.org/recording/recording';
const db={schemaVersion:2,catalogue:{years:[2000]},songs:{song:{id:'song',canonicalKey:'example|artist',title:'Example',artist:'Artist',release:{answerYear:2000,year:2000,state:'externally_observed',claims:[{sourceUrl}]},providers:{spotify:{preferredId:null,links:[{id:'0000000000000000000000',url,origin:'musicbrainz-recording-url-relation',recordingId:'recording',sourceUrl,state:'metadata_checked',metadataCheck:{state:'metadata_checked',title:'Example',artists:['Artist'],playable:true,checkedAt:'2026-09-05'}}]},youtube:{preferredId:null,links:[]}}}},memberships:[{songId:'song',mode:'greatest',year:2000,metadata:{},providerRefs:{spotify:null}}]};
const recordings={recording:{id:'recording',title:'Example',video:false,disambiguation:'','first-release-date':'2000',relations:[{url:{resource:url}}]}};
const decisions=[{songId:'song',provider:'spotify',id:'0000000000000000000000',reviewBasis:'Fixture review',reviewedAt:'2026-09-05'}];
const result=applyReviewedLinks(db,decisions,recordings);
assert.equal(compileDatabase(result).modes.greatest[2000][0].spotifyId,decisions[0].id);
assert.equal(db.songs.song.providers.spotify.preferredId,null,'Review application does not mutate its input');
for(const patch of [{video:true},{disambiguation:'live'},{title:'Different song'},{'first-release-date':'1999'},{relations:[]}]){
 assert.throws(()=>applyReviewedLinks(db,decisions,{recording:{...recordings.recording,...patch}}));
}
const wrong=structuredClone(db);wrong.songs.song.providers.spotify.links[0].metadataCheck.artists=['Different Artist'];
assert.throws(()=>applyReviewedLinks(wrong,decisions,recordings),/identity mismatch/);
assert.deepEqual(applyReviewedLinks(result,decisions,recordings),result,'Reviewed selection is idempotent');
console.log('Reviewed playback selection rejects conflicting identity, version, date and source evidence.');
