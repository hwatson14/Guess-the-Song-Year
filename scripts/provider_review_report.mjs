import fs from 'node:fs';
const db=JSON.parse(fs.readFileSync('data/song-database.json','utf8'));
const queue=[];
for(const song of Object.values(db.songs))for(const [provider,p] of Object.entries(song.providers)){
 if(!p.links.length){queue.push({songId:song.id,title:song.title,artist:song.artist,provider,reason:'missing_link'});continue}
 for(const asset of p.links){
  if(asset.state==='verified')continue;
  const check=asset.metadataCheck,reasons=[...(check?.reviewReasons||[])];
  if(check?.titleMatches===false)reasons.push('title_differs');
  if(check?.artistMatches===false)reasons.push('artist_credit_differs');
  if(asset.lastAudit?.state==='unverified'&&(asset.lastAudit.error||asset.lastAudit.httpstatus>=400||asset.lastAudit.httpStatus>=400))reasons.push('latest_request_failed');
  queue.push({songId:song.id,title:song.title,artist:song.artist,provider,id:asset.id,url:asset.url,state:asset.state,
   reasons:reasons.length?[...new Set(reasons)]:[check?'recording_review_required':'metadata_not_checked'],
   ...(check?{observedTitle:check.title,observedArtist:check.author||check.artists,checkedAt:check.checkedAt}:{}),sourceUrl:asset.sourceUrl||null});
 }
}
const reasons={};for(const r of queue)for(const reason of r.reasons||[r.reason])reasons[reason]=(reasons[reason]||0)+1;
const result={generatedAt:new Date().toISOString(),counts:reasons,queue};
if(process.argv.includes('--write'))fs.writeFileSync('verification/provider-review-queue.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({entries:queue.length,counts:reasons}));
