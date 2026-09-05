import fs from 'node:fs';
const db=JSON.parse(fs.readFileSync('data/song-database.json','utf8'));
const input=JSON.parse(fs.readFileSync('output/expansion/recording-provider-links.json','utf8'));
let added=0;
for(const p of input.proposals){
 const song=db.songs[p.songId];
 if(!song||!['spotify','youtube'].includes(p.provider)||!song.release.claims.some(c=>c.sourceUrl===p.sourceUrl))throw Error('Proposal lacks a matching recording claim');
 if(!/^[0-9a-f-]{36}$/.test(p.recordingId)||p.sourceUrl!==`https://musicbrainz.org/recording/${p.recordingId}`)throw Error('Invalid recording source');
 const cached=JSON.parse(fs.readFileSync(`output/expansion/recording-link-cache/${p.recordingId}.json`,'utf8'));
 if(cached.id!==p.recordingId||!cached.relations?.some(r=>r.url?.resource===p.url&&r.type===p.relationship))throw Error('URL relation not present in retained source');
 const u=new URL(p.url),id=p.provider==='spotify'?u.pathname.match(/^\/track\/([A-Za-z0-9]{22})$/)?.[1]:u.hostname==='youtu.be'?u.pathname.slice(1):u.searchParams.get('v');
 const host=p.provider==='spotify'?u.hostname==='open.spotify.com':['youtube.com','www.youtube.com','youtu.be'].includes(u.hostname);
 if(!host||id!==p.id||!(p.provider==='spotify'?/^[A-Za-z0-9]{22}$/:/^[A-Za-z0-9_-]{11}$/).test(id))throw Error('Invalid provider URL');
 if(song.providers[p.provider].links.some(x=>x.id===id))continue;
 song.providers[p.provider].links.push({id,url:p.provider==='spotify'?`https://open.spotify.com/track/${id}`:`https://www.youtube.com/watch?v=${id}`,state:'unverified',origin:'musicbrainz-recording-url-relation',sourceUrl:p.sourceUrl,recordingId:p.recordingId,relationship:p.relationship,checkedAt:p.checkedAt});
 added++;
}
if(process.argv.includes('--write'))fs.writeFileSync('data/song-database.json',JSON.stringify(db,null,2)+'\n');
console.log(JSON.stringify({added,write:process.argv.includes('--write')}));
