import fs from 'node:fs';
import {compileDatabase} from './song_database.mjs';

const databasePath='data/song-database.json';
const cataloguePath='data/catalogue.json';

// Independent review of the Unexpected Years expansion found two accepted
// release-year claims that were inconsistent with stronger external evidence.
// Keep the immutable song IDs and all mode memberships; correct only release truth.
const corrections=[
  {
    songId:'song_5789f221c273cdaae0dd',
    title:'I Will Survive',
    year:1978,
    sourceUrl:'https://en.wikipedia.org/wiki/I_Will_Survive',
    evidence:'The single was released by Polydor on 23 October 1978; UMG metadata also carries a 1978 phonographic copyright. The previous 1977 accepted claim was rejected during the Unexpected Years audit.'
  },
  {
    songId:'song_2305a63b8f720bd2d23a',
    title:'Sweet Dreams (Are Made Of This)',
    year:1983,
    sourceUrl:'https://www.eurythmics.com/history/',
    evidence:'Eurythmics official history dates the Sweet Dreams (Are Made of This) album to 4 January 1983 and documents the title single in the February 1983 UK chart cycle. The previous 1982 accepted claim was rejected during the Unexpected Years audit.'
  }
];

const db=JSON.parse(fs.readFileSync(databasePath,'utf8'));
let changed=0;
for(const correction of corrections){
  const song=db.songs[correction.songId];
  if(!song)throw new Error(`Missing canonical song ${correction.songId}`);
  if(song.title!==correction.title)throw new Error(`Unexpected identity for ${correction.songId}: ${song.title}`);
  const alreadyCorrect=Number(song.release?.answerYear)===correction.year&&
    Number(song.release?.year)===correction.year&&song.release?.state==='externally_observed'&&
    (song.release?.claims||[]).some(c=>c.state==='externally_observed'&&Number(c.year)===correction.year&&c.sourceUrl===correction.sourceUrl);
  if(alreadyCorrect)continue;

  const claims=(song.release?.claims||[])
    .filter(c=>!(c.state==='externally_observed'&&Number(c.year)!==correction.year));
  if(!claims.some(c=>c.state==='externally_observed'&&Number(c.year)===correction.year&&c.sourceUrl===correction.sourceUrl)){
    claims.push({year:correction.year,state:'externally_observed',sourceUrl:correction.sourceUrl,evidence:correction.evidence});
  }
  song.release={...song.release,answerYear:correction.year,year:correction.year,state:'externally_observed',claims};
  changed++;
}

const compiled=compileDatabase(db);
if(changed){
  fs.writeFileSync(databasePath,JSON.stringify(db,null,2)+'\n');
  fs.writeFileSync(cataloguePath,JSON.stringify(compiled)+'\n');
}
console.log(JSON.stringify({changed,corrections:corrections.map(({songId,title,year,sourceUrl})=>({songId,title,year,sourceUrl}))},null,2));
