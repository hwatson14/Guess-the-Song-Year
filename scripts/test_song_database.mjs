import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileDatabase,migrateCatalogue,songId} from './song_database.mjs';
import {catalogueEngine,loadProductionCatalogue} from './catalogue_runtime.mjs';
const db=JSON.parse(fs.readFileSync('data/song-database.json','utf8'));
const {data,manifest}=loadProductionCatalogue(),E=catalogueEngine(data,manifest);
assert.deepEqual(compileDatabase(db),data,'Generated runtime view matches the authoritative database');
const used=new Set(db.memberships.map(m=>m.songId));
assert.equal(used.size,Object.keys(db.songs).length,'No orphan master records');
for(const [id,song] of Object.entries(db.songs)){
  assert.equal(id,song.id);assert.equal(id,songId(song.canonicalKey));
  for(const [provider,p] of Object.entries(song.providers)){
    assert.equal(new Set(p.links.map(x=>x.id)).size,p.links.length);
    for(const asset of p.links){
      assert.ok(provider==='spotify'?/^[A-Za-z0-9]{22}$/.test(asset.id):/^[A-Za-z0-9_-]{11}$/.test(asset.id));
      assert.equal(asset.url,provider==='spotify'?`https://open.spotify.com/track/${asset.id}`:`https://www.youtube.com/watch?v=${asset.id}`);
      assert.ok(['unverified','metadata_checked','verified','unavailable'].includes(asset.state));
      if(asset.state==='verified')assert.ok(asset.evidence?.recordingMatch&&asset.evidence?.checkedAt,'Verification requires recording evidence');
    }
  }
}
// Migration preserves chart years, release evidence, empty-vs-absent IDs and legacy keys.
assert.deepEqual(compileDatabase(migrateCatalogue(data,manifest)),data);
const example={version:1,years:[1999,2000],modes:{greatest:{1999:[{title:'Example',artist:'Artist',year:1999,canonicalKey:'example|artist'}]},number1_us:{2000:[{title:'Example',artist:'Artist',year:2000,chartYear:2000,chartRank:1,canonicalKey:'example|artist'}]}},coverage:{greatest:1,number1_us:1},missing:{greatest:[2000],number1_us:[1999]}};
const migrated=migrateCatalogue(example,manifest);
assert.equal(Object.keys(migrated.songs).length,1,'One shared record for multiple mode tags');
assert.equal(migrated.memberships.length,2);
Object.values(migrated.songs)[0].title='Corrected title';
const corrected=compileDatabase(migrated);
assert.equal(corrected.modes.greatest[1999][0].title,'Corrected title');
assert.equal(corrected.modes.number1_us[2000][0].title,'Corrected title');
assert.equal(corrected.modes.number1_us[2000][0].chartYear,2000);
// A verified centrally preferred provider is inherited by every membership,
// including memberships that explicitly carry a null legacy reference.
const preferredDb=structuredClone(migrated),preferredSong=Object.values(preferredDb.songs)[0];
preferredSong.providers.spotify.links.push({id:'4DTO96EvOW9JT6OIUNFpZW',url:'https://open.spotify.com/track/4DTO96EvOW9JT6OIUNFpZW',state:'verified',evidence:{recordingMatch:true,checkedAt:'2026-09-05T00:00:00Z'}});
preferredSong.providers.spotify.preferredId='4DTO96EvOW9JT6OIUNFpZW';
for(const m of preferredDb.memberships)m.providerRefs={...(m.providerRefs||{}),spotify:null};
preferredSong.providers.spotify.links.push({id:'0zII0Soax7wbm3Avw7iVAd',url:'https://open.spotify.com/track/0zII0Soax7wbm3Avw7iVAd',state:'unverified',origin:'legacy-catalogue'});
preferredDb.memberships[1].providerRefs.spotify='0zII0Soax7wbm3Avw7iVAd';
const preferred=compileDatabase(preferredDb);
assert.equal(preferred.modes.greatest[1999][0].spotifyId,'4DTO96EvOW9JT6OIUNFpZW');
assert.equal(preferred.modes.number1_us[2000][0].spotifyId,'4DTO96EvOW9JT6OIUNFpZW');
const unverifiedDb=structuredClone(preferredDb);unverifiedDb.songs[preferredSong.id].providers.spotify.links[0].state='verified';delete unverifiedDb.songs[preferredSong.id].providers.spotify.links[0].evidence;
assert.throws(()=>compileDatabase(unverifiedDb),/verified recording evidence/);
assert.throws(()=>compileDatabase({...migrated,memberships:[{...migrated.memberships[0],songId:'missing'}]}),/Dangling song/);
assert.throws(()=>compileDatabase({...migrated,memberships:[...migrated.memberships,migrated.memberships[0]]}),/Duplicate membership/);
for(const m of db.memberships)assert.ok(manifest.modes[m.mode]&&data.years.includes(m.year));
assert.equal(new Set(Object.values(data.modes).flatMap(b=>Object.values(b).flat()).map(E.songUseKey)).size,Object.keys(db.songs).length);
console.log(`Shared database checks passed: ${Object.keys(db.songs).length} master records and ${db.memberships.length} memberships; lossless generation and shared edits verified.`);
