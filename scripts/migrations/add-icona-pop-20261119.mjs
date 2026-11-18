import assert from 'node:assert/strict';
import fs from 'node:fs';

const readJSON = path => JSON.parse(fs.readFileSync(path,'utf8'));
const writeJSON = (path,data) => fs.writeFileSync(path,JSON.stringify(data,null,2)+'\n');
const replaceOne=(path,oldText,newText)=>{
  const original=fs.readFileSync(path,'utf8');
  assert.equal(original.split(oldText).length-1,1,'Expected one occurrence of '+oldText+' in '+path);
  fs.writeFileSync(path,original.replace(oldText,newText));
};
const db=readJSON('data/song-database.json');
const songId='song_15fb77d7a64343999f05';
assert.ok(!Object.values(db.songs).some(song=>song.title.toLowerCase()==='i love it' && /icona pop/i.test(song.artist)),'Track already exists under a different ID');
assert.ok(!db.songs[songId],'ID collision');
assert.equal(db.memberships.filter(m=>m.mode==='bangers').length,102,'Expected original Bangers baseline');
db.songs[songId]={
  id:songId,
  canonicalKey:'i love it|icona pop feat charli xcx',
  title:'I Love It',
  artist:'Icona Pop feat. Charli XCX',
  release:{
    answerYear:2012,year:2012,state:'externally_observed',
    claims:[{
      year:2012,state:'externally_observed',
      sourceUrl:'https://music.apple.com/us/song/821412562',
      evidence:'Apple Music lists 9 May 2012 for the song. The original Spotify single is also dated 2012 (https://open.spotify.com/album/5hf74KpfuwSJXVs85k3dVI). Playback recording has not been auditioned.'
    }]
  },
  providers:{
    spotify:{preferredId:null,links:[]},
    youtube:{preferredId:null,links:[]}
  }
};
db.memberships.push({
  songId,mode:'bangers',year:2012,
  metadata:{
    releaseYear:2012,source:'family-request-2026-11-19',
    sourceLabel:'Family singalong · original release',
    sourceUrl:'https://music.apple.com/us/song/821412562',
    sourceProvider:'Apple Music; Spotify corroboration',
    releaseYearEvidence:'First released in 2012, supported by Apple Music and Spotify; exact playback track not yet auditioned.',
    evidenceState:'externally_observed',sourceRetrievalDate:'2026-11-19'
  },
  fieldOrder:['title','artist','year','releaseYear','source','sourceLabel','sourceUrl','sourceProvider','releaseYearEvidence','evidenceState','sourceRetrievalDate','spotifyId','youtubeId','canonicalKey'],
  providerRefs:{spotify:null,youtube:null}
});
assert.equal(Object.keys(db.songs).length,1211);
assert.equal(db.memberships.length,1646);
writeJSON('data/song-database.json',db);
replaceOne('scripts/test_bangers_mode.mjs','assert.equal(rows.length,102);','assert.equal(rows.length,103);');
replaceOne('scripts/test_bangers_mode.mjs','assert.equal(new Set(rows.map(x=>x.songId)).size,102);',"assert.equal(new Set(rows.map(x=>x.songId)).size,103);\nassert.ok(rows.some(x=>x.songId==='song_15fb77d7a64343999f05'&&x.title==='I Love It'&&x.artist==='Icona Pop feat. Charli XCX'&&x.year===2012),'Requested Icona Pop track missing or incorrect');");
replaceOne('scripts/test_bangers_mode.mjs','assert.equal(reports.bangers.songs,102);','assert.equal(reports.bangers.songs,103);');
replaceOne('scripts/test_greatest_hits_v20.mjs','assert.equal(Object.keys(db.songs).length,1170+bangers.newMasterIds.length);','assert.equal(Object.keys(db.songs).length,1170+bangers.newMasterIds.length+1);');
replaceOne('scripts/test_greatest_hits_v20.mjs','assert.equal(db.memberships.length,1543+bangers.included.length);','assert.equal(db.memberships.length,1543+bangers.included.length+1);');
replaceOne('README.md','102 hugely recognisable Australian-friendly group singalongs; eight year/version conflicts held','103 hugely recognisable Australian-friendly group singalongs; eight earlier year/version conflicts held');
replaceOne('README.md','1,210 master song records across 1,645 active mode placements (including 102 Bangers memberships)','1,211 master song records across 1,646 active mode placements (including 103 Bangers memberships)');
replaceOne('AGENTS.md','1,170 master songs and 1,543 mode memberships/placements','1,211 master songs and 1,646 mode memberships/placements');
replaceOne('AGENTS.md','v20 has five currently playable/selectable modes: Greatest Hits, Australian, Unexpected Years, #1 US, and #1 Australia.','v20 has six currently playable/selectable modes: Greatest Hits, Bangers, Australian, Unexpected Years, #1 US, and #1 Australia.');
replaceOne('AGENTS.md','The current v20 runtime counts are 944 Greatest Hits songs, with at least 12 per year, 253 Australian, 200 Unexpected Years, and 73 in each chart mode.','The current v20 runtime counts are 944 Greatest Hits songs (at least 12 per year), 103 Bangers, 253 Australian, 200 Unexpected Years, and 73 in each chart mode.');
console.log('Added Icona Pop canonical master and Bangers membership with verified 2012 release-year source.');
