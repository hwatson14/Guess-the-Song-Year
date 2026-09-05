import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {compileDatabase} from './song_database.mjs';
export const normalizedIdentity=s=>String(s||'').replace(/[’‘]/g,"'").normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function applyReviewedLinks(input,decisions,recordings){
 const db=structuredClone(input);
 for(const d of decisions){
  if(d.provider!=='spotify'||!d.reviewBasis||!Number.isFinite(Date.parse(d.reviewedAt)))throw Error('Incomplete recording review');
  const song=db.songs[d.songId],asset=song?.providers.spotify.links.find(x=>x.id===d.id),check=asset?.metadataCheck;
  if(!asset||asset.origin!=='musicbrainz-recording-url-relation'||!check||check.state!=='metadata_checked'||check.playable!==true)throw Error('Missing recording-linked provider metadata');
  const recording=recordings[asset.recordingId];
  if(!recording||recording.id!==asset.recordingId||recording.video!==false||recording.disambiguation)throw Error('Recording requires additional version review');
  if(Number(recording['first-release-date']?.slice(0,4))!==song.release.year)throw Error('Recording date conflicts with reviewed song year');
  const norm=normalizedIdentity;
  if(norm(song.title)!==norm(recording.title)||norm(song.title)!==norm(check.title)||!check.artists?.some(a=>norm(a)===norm(song.artist)))throw Error('Recording/provider identity mismatch');
  if(!song.release.claims.some(c=>c.sourceUrl===asset.sourceUrl)||!recording.relations?.some(r=>r.url?.resource?.split('?')[0]===asset.url))throw Error('Recording URL relationship missing');
  asset.state='verified';
  asset.evidence={recordingMatch:true,checkedAt:d.reviewedAt,method:'reviewed-recording-relationship-and-provider-identity',reviewBasis:d.reviewBasis,recordingId:recording.id,sourceUrl:asset.sourceUrl,providerMetadataUrl:`https://open.spotify.com/embed/track/${asset.id}`,observedTitle:check.title,observedArtists:check.artists,providerCheckedAt:check.checkedAt,audioAuditioned:false};
  song.providers.spotify.preferredId=asset.id;
 }
 compileDatabase(db);
 return db;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const decisions=JSON.parse(fs.readFileSync('verification/provider-recording-decisions.json','utf8'));
 const input=JSON.parse(fs.readFileSync('data/song-database.json','utf8')),recordings={};
 for(const d of decisions){const id=input.songs[d.songId]?.providers.spotify.links.find(x=>x.id===d.id)?.recordingId;if(!id||!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid recording id');recordings[id]=JSON.parse(fs.readFileSync(`output/expansion/recording-link-cache/${id}.json`,'utf8'))}
 const db=applyReviewedLinks(input,decisions,recordings);
 if(process.argv.includes('--write')){
  db.catalogue.version=Math.max(Number(db.catalogue.version)||0,17);db.catalogue.generatedAt=new Date().toISOString();
  fs.writeFileSync('data/song-database.json',JSON.stringify(db,null,2)+'\n');
  fs.writeFileSync('data/catalogue.json',JSON.stringify(compileDatabase(db))+'\n');
 }
 console.log(JSON.stringify({reviewed:decisions.length,write:process.argv.includes('--write')}));
}
