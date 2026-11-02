// Add two mandatory high-recognition Greatest Hits with sourced first-release years.
// Idempotent materialization into the canonical database and its generated runtime view.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {songId,compileDatabase} from '../song_database.mjs';

const required=[
  {
    title:'Somebody Told Me',artist:'The Killers',canonicalKey:'somebody told me|killers',year:2004,
    sourceUrl:'https://www.officialcharts.com/songs/killers-somebody-told-me/',
    sourceProvider:'Official Charts',
    evidence:'First charted on 27 March 2004 in the UK, establishing the original 2004 single before its 2005 re-release.',
    spotifyId:'59XNy4523UcEvQfYM8fdQB',spotifyTitle:'Somebody Told Me',
  },
  {
    title:'Blue (Da Ba Dee)',artist:'Eiffel 65',canonicalKey:'blue da ba dee|eiffel 65',year:1998,
    sourceUrl:'https://musicbrainz.org/release-group/9eb4d6dd-ac77-3f10-8459-7948471d73e8',
    sourceProvider:'MusicBrainz release group',
    evidence:'Documented original Italian single release in 1998, ahead of the international 1999 chart breakout.',
    spotifyId:'08VeSelC8QYD1MIsK9gAmY',spotifyTitle:'Blue (Da Ba Dee) - DJ Ponte Ice Pop Radio',
  },
];
const fieldOrder=['title','artist','year','releaseYear','source','sourceLabel',
  'sourceUrl','sourceProvider','releaseYearEvidence','releaseDateEvidence',
  'evidenceState','sourceRetrievalDate','spotifyId','youtubeId','canonicalKey'];
const sourcePath='data/song-database.json',outputPath='data/catalogue.json';
const db=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
const current=JSON.parse(fs.readFileSync(outputPath,'utf8'));
assert.equal(db.schemaVersion,2);
assert.equal(db.catalogue.version,19);
assert.deepEqual(compileDatabase(db),current,'Start from a synchronized authoritative source');
let additions=0;
for(const item of required){
  const id=songId(item.canonicalKey);
  const existing=db.songs[id];
  if(existing){
    assert.equal(existing.canonicalKey,item.canonicalKey);
    assert.equal(existing.release.answerYear,item.year);
    assert.ok(db.memberships.some(m=>m.songId===id&&m.mode==='greatest'&&m.year===item.year),'Required song has no Greatest Hits membership');
    continue;
  }
  assert.ok(!Object.values(db.songs).some(song=>song.canonicalKey===item.canonicalKey),'Existing canonical song has another ID');
  assert.ok(!Object.values(db.songs).some(song=>song.providers.spotify.links.some(link=>link.id===item.spotifyId)),'Spotify candidate is already bound to another song');
  const spotifyUrl='https://open.spotify.com/track/'+item.spotifyId;
  db.songs[id]={
    id,canonicalKey:item.canonicalKey,title:item.title,artist:item.artist,
    release:{answerYear:item.year,year:item.year,state:'externally_observed',
      claims:[{year:item.year,state:'externally_observed',sourceUrl:item.sourceUrl,evidence:item.evidence}]},
    providers:{
      spotify:{preferredId:null,links:[{id:item.spotifyId,url:spotifyUrl,state:'unverified',
        origin:'public-spotify-track-page',sourceUrl:spotifyUrl,
        sourceTitle:item.spotifyTitle,sourceArtist:item.artist}]},
      youtube:{preferredId:null,links:[]},
    },
  };
  db.memberships.push({
    songId:id,mode:'greatest',year:item.year,
    metadata:{releaseYear:item.year,source:'required-greatest-hits-2026-11-02',
      sourceLabel:'Sourced original release · required Greatest Hits',
      sourceUrl:item.sourceUrl,sourceProvider:item.sourceProvider,
      releaseYearEvidence:item.evidence,releaseDateEvidence:String(item.year),
      evidenceState:'externally_observed',sourceRetrievalDate:'2026-11-02'},
    fieldOrder,providerRefs:{spotify:item.spotifyId,youtube:null},
  });
  additions++;
}
const compiled=compileDatabase(db);
for(const item of required){
  const id=songId(item.canonicalKey);
  assert.ok((compiled.modes.greatest[item.year]||[]).some(s=>s.songId===id&&s.spotifyId===item.spotifyId&&s.year===item.year));
}
for(const mode of Object.keys(current.modes)){
  if(mode!=='greatest')assert.deepEqual(compiled.modes[mode],current.modes[mode],'Unrelated mode was changed');
}
for(const year of Object.keys(current.modes.greatest)){
  if(year!=='1998'&&year!=='2004')assert.deepEqual(compiled.modes.greatest[year],current.modes.greatest[year],'Unrelated Greatest Hits year was changed');
}
assert.deepEqual(compiled.coverage,current.coverage);
assert.deepEqual(compiled.missing,current.missing);
if(additions){
  fs.writeFileSync(sourcePath,JSON.stringify(db,null,2)+'\n');
  fs.writeFileSync(outputPath,JSON.stringify(compiled)+'\n');
}
console.log(JSON.stringify({added: additions,masterSongs:Object.keys(db.songs).length,memberships:db.memberships.length,years:required.map(({title,year})=>({title,year}))}));
