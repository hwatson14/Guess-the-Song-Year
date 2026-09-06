import fs from 'node:fs';
import {compileDatabase,songId} from './song_database.mjs';
import {catalogueEngine,loadProductionCatalogue} from './catalogue_runtime.mjs';

const databasePath='data/song-database.json';
const cataloguePath='data/catalogue.json';
const write=process.argv.includes('--write');
const db=JSON.parse(fs.readFileSync(databasePath,'utf8'));
const {data,manifest}=loadProductionCatalogue();
const E=catalogueEngine(data,manifest);

const seed={
  title:'Pass The Dutchie',
  artist:'Musical Youth',
  year:1982,
  releaseEvidence:{
    sourceUrl:'https://www.officialcharts.com/songs/musical-youth-pass-the-dutchie/',
    sourceProvider:'Official Charts',
    evidence:'Official Charts records Pass The Dutchie by Musical Youth with a first chart date of 25 September 1982. MusicBrainz lists official UK/France/Italy single releases in 1982, and Universal Music recording metadata carries ℗ 1982 MCA Records Ltd.'
  },
  providers:{
    spotify:{id:'1BkY0N8ChFk2mdLbAUu8ZK',url:'https://open.spotify.com/track/1BkY0N8ChFk2mdLbAUu8ZK'},
    youtube:{id:'s7-B-JXmhOs',url:'https://www.youtube.com/watch?v=s7-B-JXmhOs'}
  }
};

const canonicalKey=E.songUseKey({title:seed.title,artist:seed.artist});
const existingByKey=Object.values(db.songs).filter(song=>song.canonicalKey===canonicalKey||E.songUseKey({title:song.title,artist:song.artist})===canonicalKey);
if(existingByKey.length>1)throw new Error(`Ambiguous existing identity for ${seed.title}: ${existingByKey.map(x=>x.id).join(', ')}`);
let song=existingByKey[0]||null;
let created=false;

if(!song){
  for(const [provider,asset] of Object.entries(seed.providers)){
    const owners=Object.values(db.songs).filter(candidate=>(candidate.providers?.[provider]?.links||[]).some(link=>link.id===asset.id));
    if(owners.length)throw new Error(`${provider} ID ${asset.id} already belongs to ${owners.map(x=>`${x.title} / ${x.artist}`).join(', ')}`);
  }
  const id=songId(canonicalKey);
  if(db.songs[id])throw new Error(`Deterministic ID collision for ${canonicalKey}: ${id}`);
  song={
    id,canonicalKey,title:seed.title,artist:seed.artist,
    release:{
      answerYear:seed.year,year:seed.year,state:'externally_observed',
      claims:[{year:seed.year,state:'externally_observed',sourceUrl:seed.releaseEvidence.sourceUrl,evidence:seed.releaseEvidence.evidence}]
    },
    providers:{
      spotify:{preferredId:null,links:[{id:seed.providers.spotify.id,url:seed.providers.spotify.url,state:'unverified',origin:'unexpected-years-1982-backfill'}]},
      youtube:{preferredId:null,links:[{id:seed.providers.youtube.id,url:seed.providers.youtube.url,state:'unverified',origin:'unexpected-years-1982-backfill'}]}
    }
  };
  db.songs[id]=song;
  created=true;
}else{
  if(Number(song.release?.answerYear)!==seed.year)throw new Error(`Existing ${seed.title} has answer year ${song.release?.answerYear}, expected ${seed.year}`);
  if(song.release?.state!=='externally_observed')throw new Error(`Existing ${seed.title} is not externally observed`);
}

let membershipAdded=false;
if(!db.memberships.some(m=>m.mode==='greatest'&&m.songId===song.id)){
  const metadata={
    releaseYear:seed.year,
    sourceUrl:seed.releaseEvidence.sourceUrl,
    sourceProvider:seed.releaseEvidence.sourceProvider,
    releaseYearEvidence:seed.releaseEvidence.evidence,
    source:'unexpected-years-1982-backfill',
    sourceLabel:'Sourced 1982 Greatest Hits backfill',
    evidenceState:'externally_observed'
  };
  const providerRefs={spotify:seed.providers.spotify.id,youtube:seed.providers.youtube.id};
  db.memberships.push({songId:song.id,mode:'greatest',year:seed.year,metadata,providerRefs,fieldOrder:['title','artist','year','releaseYear','sourceUrl','sourceProvider','releaseYearEvidence','source','sourceLabel','evidenceState','spotifyId','youtubeId']});
  membershipAdded=true;
}

const compiled=compileDatabase(db,manifest);
const row=(compiled.modes?.greatest?.[String(seed.year)]||[]).find(item=>item.songId===song.id);
if(!row)throw new Error('1982 Greatest backfill did not compile');
if(row.title!==seed.title||row.artist!==seed.artist||Number(row.year)!==seed.year)throw new Error('Compiled 1982 backfill identity/year mismatch');

if(write){
  fs.writeFileSync(databasePath,JSON.stringify(db,null,2)+'\n');
  fs.writeFileSync(cataloguePath,JSON.stringify(compiled)+'\n');
}
console.log(JSON.stringify({write,created,membershipAdded,songId:song.id,title:song.title,artist:song.artist,year:song.release.answerYear,spotifyId:seed.providers.spotify.id,youtubeId:seed.providers.youtube.id},null,2));
