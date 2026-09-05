const states=new Set(['unverified','metadata_checked','unavailable']);
export function applyProviderAudit(db,provider,checks){
 if(!['spotify','youtube'].includes(provider))throw Error('Unknown provider');
 let updated=0;
 for(const check of checks){
  if(check.provider!==provider||!states.has(check.state)||!Number.isFinite(Date.parse(check.checkedAt)))throw Error('Invalid provider audit');
  const asset=db.songs[check.songId]?.providers[provider].links.find(x=>x.id===check.id);
  if(!asset||asset.state==='verified')continue;
  const latest=asset.lastAudit||asset.metadataCheck;
  if(latest&&Date.parse(latest.checkedAt)>Date.parse(check.checkedAt))continue;
  asset.lastAudit=structuredClone(check);
  if(check.state==='metadata_checked'){
   if(!check.title)throw Error('Metadata check requires a title');
   asset.metadataCheck=structuredClone(check);asset.state='metadata_checked';
  }else if(check.state==='unavailable')asset.state='unavailable';
  // A failed request does not erase previously observed identity metadata.
  updated++;
 }
 return updated;
}
