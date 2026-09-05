import assert from 'node:assert/strict';
import {catalogueEngine} from './catalogue_runtime.mjs';

const song=(title,year,extra={})=>({title,artist:'Example Artist',year,...extra});
const manifest={modes:{
  greatest:{name:'Greatest Hits',status:'beta',yearBasis:'release',repeatPolicy:'unique'},
  number1_us:{name:'#1 US',status:'beta',yearBasis:'chart',repeatPolicy:'fixed'},
}};
const data={modes:{greatest:{
  2000:[song('First',2000),song('First (Live)',2000),song('First',2000),song('Second',2000)],
  2001:[song('Only (Remix)',2001)],
  2002:[song('Wrong bucket',2003)],
  2003:[song('Radio Ga Ga',2003)],
  2004:[
    song('Plain original song (from The Film original motion picture soundtrack)',2004,{artist:'Paul McCartney'}),
    song('La Belle',2004,{artist:'LaBelle'}),
    song('McDonald song',2004,{artist:'McDonald'}),
    song('Plain original song (Remix)',2004,{artist:'McCartney'}),
  ],
  2005:[song('Alias song',2005,{legacyKeys:['legacy-alias']})],
},number1_us:{2001:[song('Only (Remix)',2001,{chartYear:2001})]}}};
const E=catalogueEngine(data,manifest),reports=await E.modeReports();
assert.deepEqual([...reports.greatest.years],[2000,2003,2004,2005]);
assert.equal(reports.greatest.songs,7);
assert.equal(reports.greatest.rawCoverage,6);
assert.equal(reports.greatest.yearSongKeys[2000].length,2);
assert.equal(E.isAlternateSongTitle('Plain original song (from The Film original motion picture soundtrack)'),false);
assert.equal(E.isAlternateSongTitle('Plain original song (Remix)'),true);
for (const marker of ['Mixed','video','Call Out #1','Jamie XX Shuffle','GDP','Space Jesus','Restrung','Rumba 22']) assert.equal(E.isAlternateSongTitle(`Alias song (${marker})`),true);
assert.equal(E.isAlternateSongTitle('Live Forever'),false);
assert.equal(E.isAlternateSongTitle('Another Brick in the Wall (Part II)'),false);
assert.equal(reports.greatest.yearSongKeys[2004].length,3,'legitimate McCartney, LaBelle, and McDonald credits remain selectable');
const chosen2004=[];
for(const key of reports.greatest.yearSongKeys[2004]) chosen2004.push(E.songUseKey(await E.chooseSong(2004,'greatest',chosen2004)));
assert.deepEqual(new Set(chosen2004),new Set(reports.greatest.yearSongKeys[2004]),'reported pool and chosen identities agree');
await assert.rejects(E.chooseSong(2005,'greatest',['legacy-alias']),{code:'NO_UNUSED_SONG'});
for(const year of [2001,2002])await assert.rejects(E.chooseSong(year,'greatest'),{code:'MODE_YEAR_UNAVAILABLE'});
for(const year of reports.greatest.years){
  const unused=[...reports.greatest.yearSongKeys[year]],used=[];
  while(unused.length){
    const picked=await E.chooseSong(year,'greatest',used),key=E.songUseKey(picked);
    assert.ok(unused.includes(key),'reported identity is selectable exactly once');
    unused.splice(unused.indexOf(key),1);used.push(key);
  }
  await assert.rejects(E.chooseSong(year,'greatest',used),{code:'NO_UNUSED_SONG'});
}
assert.equal(reports.number1_us.coverage,1,'chart leaders allow their documented recording titles');
const chart=await E.chooseSong(2001,'number1_us',reports.number1_us.yearSongKeys[2001]);
assert.equal(chart.title,'Only (Remix)','ordinary fixed leader repeats remain supported');
console.log('runtime coverage, identity counts, filtering and exhaustion regressions passed');

const namesData={modes:{greatest:{2013:[
 song('Counting Stars',2013,{artist:'OneRepublic'}),
 song('Malformed credit',2013,{artist:'ArtistGuest'}),
 song('Control',2013)
]}}};
const namesEngine=catalogueEngine(namesData,manifest),namesReport=(await namesEngine.modeReports()).greatest;
assert.equal(namesReport.songs,2,'Legitimate OneRepublic spelling remains usable; joined credits do not');
assert.ok(namesReport.yearSongKeys[2013].includes('counting stars|onerepublic'));
