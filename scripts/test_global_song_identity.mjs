import assert from 'node:assert/strict';
import fs from 'node:fs';

const db=JSON.parse(fs.readFileSync('data/song-database.json','utf8'));
const releaseModes=new Set(['greatest','australian','unexpected']);
const providers=['spotify','youtube'];

const removedIds=[
  'song_96d7887a27dd86497ac3','song_bf27dbfb2d5582bc5391','song_861cb60c1c56ae2a71b6','song_8c0121f9d8521b0f1cdb',
  'song_c223ab5e9e385520ad45','song_275b119114c4ec21bdd7','song_09f06b915733c92fbb09','song_7825677a785672c119cd',
  'song_16b8b3360e376a3392c7','song_e460fb216655c321089b','song_798f6ce537f0d5ef063a','song_b770e2066084fdc0295a',
  'song_ca8fed89b1a2d1a65793','song_e8e62b733b5faf52e71a','song_09c24c50eddd79da4285','song_2c4717878b5bd5401715',
];
for(const id of removedIds){
  assert.ok(!db.songs[id],`merged duplicate master must stay removed: ${id}`);
  assert.ok(!db.memberships.some(m=>m.songId===id),`membership must not reference removed master: ${id}`);
}

const norm=value=>String(value||'').normalize('NFKD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/\$/g,'s').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/^the\s+/,'');
const exactOwners=new Map();
for(const song of Object.values(db.songs)){
  const key=`${norm(song.title)}|${norm(song.artist)}`;
  const prior=exactOwners.get(key);
  assert.ok(!prior||prior===song.id,`normalized title/artist duplicate: ${key} (${prior}, ${song.id})`);
  exactOwners.set(key,song.id);
}

for(const provider of providers){
  const owners=new Map();
  for(const song of Object.values(db.songs))for(const link of song.providers?.[provider]?.links||[]){
    const prior=owners.get(link.id);
    assert.ok(!prior||prior===song.id,`${provider} id ${link.id} is attached to multiple master songs: ${prior}, ${song.id}`);
    owners.set(link.id,song.id);
  }
}

assert.ok(!db.songs.song_e89a9ff7ef98eb287ff2.providers.spotify.links.some(x=>x.id==='1ZPlNanZsJSPK5h9YZZFbZ'),'Like a Prayer must not retain Like a Virgin Spotify id');
assert.ok(!db.songs.song_dd9e904be04f78be21e4.providers.spotify.links.some(x=>x.id==='6FZDfxM3a3UCqtzo5pxSLZ'),'Eminem Without Me must not retain Halsey Spotify id');

const seenMemberships=new Set();
const greatestCounts=new Map();
for(const m of db.memberships){
  const song=db.songs[m.songId];assert.ok(song,`dangling membership ${m.songId}`);
  const year=releaseModes.has(m.mode)?Number(song.release?.answerYear):Number(m.year);
  const key=`${m.mode}/${year}/${m.songId}`;
  assert.ok(!seenMemberships.has(key),`duplicate effective membership ${key}`);seenMemberships.add(key);
  if(m.mode==='greatest')greatestCounts.set(year,(greatestCounts.get(year)||0)+1);
}
for(let year=1950;year<=2022;year++)assert.ok((greatestCounts.get(year)||0)>=12,`Greatest Hits ${year} fell below 12 songs`);

const expectedReplacements=new Map([
  [1955,['Tutti Frutti','Little Richard']],
  [1961,["I'm Gonna Knock on Your Door",'Eddie Hodges']],
  [1973,["Let's Get It On",'Marvin Gaye']],
  [1991,['Enter Sandman','Metallica']],
  [1997,['Bitter Sweet Symphony','The Verve']],
  [2000,['One More Time','Daft Punk']],
  [2010,['Love the Way You Lie','Eminem']],
]);
for(const [year,[title,artist]] of expectedReplacements){
  assert.ok(db.memberships.some(m=>m.mode==='greatest'&&Number(db.songs[m.songId]?.release?.answerYear)===year&&db.songs[m.songId]?.title===title&&db.songs[m.songId]?.artist===artist),`missing ${year} depth replacement ${title} — ${artist}`);
}

const macarena=db.memberships.find(m=>m.songId==='song_a99e74e4debf210d1a8c'&&m.mode==='number1_us'&&Number(m.year)===1996);
assert.equal(macarena?.displayOverrides?.title,'Macarena (Bayside Boys Remix)');
assert.equal(macarena?.metadata?.recordingVariant,'Bayside Boys Remix');

console.log(`Global song identity checks passed: ${Object.keys(db.songs).length} masters, ${db.memberships.length} memberships; provider ids globally unique and Greatest depth preserved.`);
