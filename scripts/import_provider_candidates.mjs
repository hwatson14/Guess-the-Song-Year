import fs from 'node:fs';
import {applyProviderAudit} from './provider_audit.mjs';
import {catalogueEngine} from './catalogue_runtime.mjs';
import {compileDatabase} from './song_database.mjs';
const db=JSON.parse(fs.readFileSync('data/song-database.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('data/modes.json','utf8'));
const E=catalogueEngine(compileDatabase(db),manifest);
const songsByCanonical=new Map(Object.values(db.songs).map(song=>[String(song.canonicalKey),song]));
const sources=[
  {file:'output/expansion/streaming-link-candidates.json',url:'https://github.com/connoraking/Spotify-YouTube-Multiavariate-Analysis/blob/main/Spotify_Youtube.csv',rows:r=>({title:r.Track,artist:r.Artist,spotifyId:r.Uri?.match(/^spotify:track:([A-Za-z0-9]{22})$/)?.[1],youtubeId:r.Url_youtube?.match(/[?&]v=([A-Za-z0-9_-]{11})(?:&|$)/)?.[1],officialVideo:r.official_video==='True'})},
  {file:'output/expansion/bimmuda-source.json',url:'https://github.com/madelinehamilton/BiMMuDa',rows:r=>({title:r.Title,artist:r.Artist,spotifyId:r['Link to Audio']?.match(/spotify\.com\/track\/([A-Za-z0-9]{22})/)?.[1],youtubeId:r['Link to Audio']?.match(/[?&]v=([A-Za-z0-9_-]{11})(?:&|$)/)?.[1]})}
];
let imported=0;
for(const source of sources)for(const input of JSON.parse(fs.readFileSync(source.file,'utf8'))){
  const row=source.rows(input);
  if(!row.title||!row.artist||E.isAlternateSongTitle(row.title))continue;
  const key=E.songUseKey(row),song=db.songs[db.aliases?.[key]]||songsByCanonical.get(key);if(!song)continue;
  for(const provider of ['spotify','youtube']){
    const id=row[provider+'Id'];if(!id||song.providers[provider].links.some(x=>x.id===id))continue;
    song.providers[provider].links.push({id,url:provider==='spotify'?`https://open.spotify.com/track/${id}`:`https://www.youtube.com/watch?v=${id}`,
      state:'unverified',origin:'public-dataset-candidate',sourceUrl:source.url,sourceTitle:row.title,sourceArtist:row.artist,...(provider==='youtube'?{sourceClaimsOfficial:!!row.officialVideo}:{})});
    imported++;
  }
}
for(const provider of ['spotify','youtube']){
 const auditFile='output/expansion/'+provider+'-link-audit.json';
 if(fs.existsSync(auditFile))applyProviderAudit(db,provider,JSON.parse(fs.readFileSync(auditFile,'utf8')));
}
if(process.argv.includes('--write'))fs.writeFileSync('data/song-database.json',JSON.stringify(db,null,2)+'\n');
console.log(JSON.stringify({imported,linked:Object.fromEntries(['spotify','youtube'].map(p=>[p,Object.values(db.songs).filter(s=>s.providers[p].links.length).length])),write:process.argv.includes('--write')}));
