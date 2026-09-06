import fs from 'node:fs';
import {compileDatabase} from './song_database.mjs';
import modes from '../data/modes.json' with {type:'json'};

const databasePath='data/song-database.json';
const cataloguePath='data/catalogue.json';
const write=process.argv.includes('--write');
const db=JSON.parse(fs.readFileSync(databasePath,'utf8'));

const superseded=[
  {
    songId:'song_5789f221c273cdaae0dd',
    year:1977,
    sourceUrl:'https://musicbrainz.org/recording/e952d60a-c240-4a6d-b1d0-eef9e2c3a3e2',
    evidence:'Earliest first-release-date among exact title and lead-credit matches in the cached MusicBrainz search; alternate annotations excluded.',
    rejectedReason:'Superseded by reviewed 1978 release evidence during Unexpected Years expansion.'
  },
  {
    songId:'song_2305a63b8f720bd2d23a',
    year:1982,
    sourceUrl:'https://musicbrainz.org/recording/5e6332df-8cc8-4f4d-b8b1-cd6dfd512cfc',
    evidence:'Earliest first-release-date among exact title and lead-credit matches in the cached MusicBrainz search; alternate annotations excluded.',
    rejectedReason:'Superseded by Eurythmics official 1983 release chronology during Unexpected Years expansion.'
  }
];

for(const rejected of superseded){
  const song=db.songs[rejected.songId];
  if(!song)throw new Error(`Missing superseded-claim song ${rejected.songId}`);
  const list=song.release.rejectedClaims??=[];
  if(!list.some(c=>Number(c.year)===rejected.year&&c.sourceUrl===rejected.sourceUrl)){
    list.push({year:rejected.year,state:'rejected',sourceUrl:rejected.sourceUrl,evidence:rejected.evidence,rejectedReason:rejected.rejectedReason});
  }
  for(const membership of db.memberships.filter(m=>m.songId===rejected.songId&&modes.modes?.[m.mode]?.yearBasis==='release')){
    membership.metadata??={};
    membership.metadata.source='unexpected-years-release-correction';
    membership.metadata.sourceLabel='Reviewed release-year correction during Unexpected Years expansion';
  }
}
const compiled=compileDatabase(db);
if(write){
  fs.writeFileSync(databasePath,JSON.stringify(db,null,2)+'\n');
  fs.writeFileSync(cataloguePath,JSON.stringify(compiled)+'\n');
}
console.log(JSON.stringify({write,superseded:superseded.map(x=>({songId:x.songId,year:x.year,sourceUrl:x.sourceUrl}))},null,2));
