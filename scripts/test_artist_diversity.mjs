import assert from 'node:assert/strict';
import {catalogueEngine} from './catalogue_runtime.mjs';

const song=(id,year,artist)=>({songId:id,title:id,artist,year,canonicalKey:`${id}|${artist.toLowerCase()}`});
const buckets={};
// Fifty successive card years, each containing four Hoodoo Gurus tracks and
// one different act. This is intentionally worse than the production bias.
for(let year=1950;year<2000;year++){
  buckets[year]=[
    ...Array.from({length:4},(_,i)=>song(`hoodoo-${year}-${i}`,year,'Hoodoo Gurus')),
    song(`other-${year}`,year,`Artist ${year}`)
  ];
}
buckets[2000]=[song('only-hoodoo',2000,'Hoodoo Gurus')];
buckets[2001]=[
  song('beatles',2001,'The Beatles'),
  song('beatles-two',2001,'The Beatles'),
  song('alternative',2001,'Another Artist')
];
const oneHit=[song('one-hit-hoodoo',1999,'Hoodoo Gurus'),song('one-hit-other',1999,'One Hit Act')];
const chartSong=song('chart-only',2000,'Chart Artist');
const data={modes:{
  greatest:buckets,
  one_hit_wonders:{1999:oneHit},
  number1_au:{2000:[{...chartSong,chartYear:2000,chartRank:1}]}
}};
const manifest={modes:{
  greatest:{name:'Greatest Hits',status:'beta',yearBasis:'release',repeatPolicy:'unique'},
  one_hit_wonders:{name:'One Hit Wonders',status:'preview',yearBasis:'release',repeatPolicy:'unique'},
  number1_au:{name:'#1 AU',status:'beta',yearBasis:'chart',repeatPolicy:'fixed'}
}};
const E=catalogueEngine(data,manifest);
const used=[],picked=[];
for(let year=1950;year<2000;year++){
  const chosen=await E.chooseSong(year,'greatest',used);
  assert.equal(chosen.year,year,'never change the requested card year for variety');
  assert.ok(!used.includes(E.songUseKey(chosen)),'no repeated song');
  used.push(E.songUseKey(chosen));
  picked.push(chosen);
}
assert.ok(picked.filter(s=>s.artist==='Hoodoo Gurus').length<=1,
  'a dominating act must not recur in 50 rounds while alternatives exist');
assert.notEqual(picked[0].artist,picked[1].artist,
  'the same act must not appear as the first two tracks when alternatives exist');

// Before the fix, a 4-to-1 song pool produced about 80% Hoodoo Gurus plays.
// Artist-level uniform sampling should produce around 50% on fresh matches.
let hoodooDraws=0;
for(let i=0;i<4000;i++){
  const chosen=await E.chooseSong(1950,'greatest',[]);
  if(chosen.artist==='Hoodoo Gurus')hoodooDraws++;
}
assert.ok(hoodooDraws>1600&&hoodooDraws<2400,
  `artist sampling looks row-weighted: ${hoodooDraws}/4000 Hoodoo draws`);

// Exhausted artist variety must fall back within the requested year, not deal
// a different mode/year or incorrectly declare unused songs unavailable.
const only=await E.chooseSong(2000,'greatest',used);
assert.equal(only.songId,'only-hoodoo');
await assert.rejects(E.chooseSong(2000,'greatest',[...used,'only-hoodoo']),{code:'NO_UNUSED_SONG'});

// Legacy saved-game keys still identify a heard artist even when the key is
// different from the current songId. The original song remains excluded.
const legacy=await E.chooseSong(2001,'greatest',['beatles|the beatles']);
assert.equal(legacy.songId,'alternative');

// The same rule applies to the forthcoming One Hit Wonders release mode,
// without making the currently Building production mode selectable.
const one=await E.chooseSong(1999,'one_hit_wonders',[picked.find(s=>s.artist==='Hoodoo Gurus')?.songId||'hoodoo-1950-0']);
assert.equal(one.songId,'one-hit-other');

// Fixed chart modes must still repeat their sole leader for the same year.
const chart=await E.chooseSong(2000,'number1_au',['chart-only']);
assert.equal(chart.songId,'chart-only');
await assert.rejects(E.chooseSong(2002,'greatest'),{code:'MODE_YEAR_UNAVAILABLE'});
console.log('Artist diversity, no-repeat, fixed-year and saved-game selection checks passed.');
