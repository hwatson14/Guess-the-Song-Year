// Nonblocking quality audit. This reports suspected facts; it never rewrites
// the canonical master database or promotes incomplete evidence.
import fs from 'node:fs';
import {loadProductionCatalogue} from './catalogue_runtime.mjs';

const {data,manifest}=loadProductionCatalogue();
const queue=JSON.parse(fs.readFileSync(new URL('../verification/playlist-curation-review.json',import.meta.url),'utf8'));
const archive=JSON.parse(fs.readFileSync(new URL('../verification/playlist-retirements-2026-11-02.json',import.meta.url),'utf8'));
const normalize=value=>String(value||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
const leadArtist=value=>normalize(String(value||'').split(/\s+(?:feat\.?|ft\.?|featuring|with)\s+/i)[0].split(/\s+(?:and|&)\s+/i)[0]).replace(/^the\s+/,'');
const summary={catalogueVersion:data.version,catalogueGenerated:data.generatedAt,modes:{},reviewQueue:{total:queue.items.length,open:[],resolved:[],retired:[],missing:[]}};

for(const [id,info] of Object.entries(manifest.modes)){
  const buckets=data.modes[id]||{},rows=Object.entries(buckets).flatMap(([year,songs])=>songs.map(s=>({...s,bucketYear:Number(year)})));
  const artists=new Map(),yearStats=[];
  for(const song of rows){
    const artist=leadArtist(song.artist);
    artists.set(artist,(artists.get(artist)||0)+1);
  }
  for(const [year,songs] of Object.entries(buckets)){
    const distinct=new Set(songs.map(s=>leadArtist(s.artist))).size;
    if(songs.length&&distinct<3)yearStats.push({year:Number(year),songs:songs.length,distinctArtists:distinct});
  }
  const top=[...artists.entries()].sort((a,b)=>b[1]-a[1]);
  summary.modes[id]={
    status:info.status,years:Object.values(buckets).filter(s=>s.length).length,
    songs:rows.length,distinctLeadArtists:artists.size,
    topArtists:top.slice(0,10).map(([artist,songs])=>({artist,songs})),
    topFiveShare:rows.length?Number((100*top.slice(0,5).reduce((n,x)=>n+x[1],0)/rows.length).toFixed(1)):null,
    yearsWithFewerThanThreeArtists:yearStats
  };
}

for(const item of queue.items){
  const pool=Object.entries(data.modes[item.mode]||{}).flatMap(([year,songs])=>songs.map(song=>({...song,bucketYear:Number(year)})));
  const matched=pool.filter(song=>normalize(song.title)===normalize(item.title)&&normalize(song.artist)===normalize(item.artist));
  const row=matched.find(s=>s.bucketYear===item.listedYear)||matched[0];
  const result={...item,observedYear:row?.bucketYear??null,found:matched.length};
  if(!row&&archive.entries.some(entry=>entry.mode===item.mode&&normalize(entry.song.title)===normalize(item.title)&&normalize(entry.song.artist)===normalize(item.artist)))summary.reviewQueue.retired.push(result);
  else if(!row)summary.reviewQueue.missing.push(result);
  else if(item.proposedYear!==null&&row.bucketYear===item.proposedYear)summary.reviewQueue.resolved.push(result);
  else summary.reviewQueue.open.push(result);
}
console.log(JSON.stringify(summary,null,2));
