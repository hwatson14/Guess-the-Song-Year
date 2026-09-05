import fs from 'node:fs';
const db=JSON.parse(fs.readFileSync('data/song-database.json','utf8'));
const result={songs:Object.keys(db.songs).length,memberships:db.memberships.length,providers:{},releaseEvidence:{},greatestDepth:{},pendingLinks:[]};
for(const provider of ['spotify','youtube'])result.providers[provider]={linked:0,missing:0,metadataChecked:0,verified:0};
for(const song of Object.values(db.songs)){
  result.releaseEvidence[song.release.state]=(result.releaseEvidence[song.release.state]||0)+1;
  const missing=[];
  for(const provider of ['spotify','youtube']){
    const assets=song.providers[provider].links,stats=result.providers[provider];
    if(assets.length)stats.linked++;else{stats.missing++;missing.push(provider)}
    if(assets.some(x=>x.state==='metadata_checked'))stats.metadataChecked++;
    if(assets.some(x=>x.state==='verified'))stats.verified++;
  }
  if(missing.length)result.pendingLinks.push({songId:song.id,title:song.title,artist:song.artist,missing});
}
for(const year of db.catalogue.years){
  const count=db.memberships.filter(m=>m.mode==='greatest'&&m.year===year).length;
  result.greatestDepth[year]={songs:count,needed:Math.max(0,12-count)};
}
if(process.argv.includes('--write'))fs.writeFileSync('verification/song-database-status.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,pendingLinks:result.pendingLinks.length},null,2));
