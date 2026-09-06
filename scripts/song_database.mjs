import {isDeepStrictEqual} from "node:util";
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {catalogueEngine,loadProductionCatalogue} from './catalogue_runtime.mjs';

export const songId=key=>'song_'+createHash('sha256').update(key).digest('hex').slice(0,20);
const providers=['spotify','youtube'];
const link=(provider,id)=>provider==='spotify'?`https://open.spotify.com/track/${id}`:`https://www.youtube.com/watch?v=${id}`;

export function membershipAnswerYear(membership,song,modeInfo){
  const basis=modeInfo?.yearBasis||'release';
  if(basis==='release')return Number(song?.release?.answerYear);
  if(basis==='chart')return Number(membership?.year);
  if(basis==='screen')return Number(membership?.metadata?.workAnswerYear);
  throw new Error(`Unsupported year basis ${basis}`);
}

function validateScreenMembership(membership){
  const meta=membership?.metadata||{};
  if(!String(meta.screenWorkId||'').trim())throw new Error('Screen membership requires screenWorkId');
  if(!['movie','tv'].includes(String(meta.workType||'')))throw new Error('Screen membership requires workType movie or tv');
  if(!String(meta.workTitle||'').trim())throw new Error('Screen membership requires workTitle');
  if(!Number.isInteger(Number(meta.workAnswerYear)))throw new Error('Screen membership requires integer workAnswerYear');
}

export function migrateCatalogue(data,manifest){
  const E=catalogueEngine(data,manifest),songs={},memberships=[];
  const {modes,coverage,missing,...catalogue}=structuredClone(data);
  for(const [mode,buckets] of Object.entries(modes))for(const [year,rows] of Object.entries(buckets))for(const row of rows){
    const info=manifest?.modes?.[mode];
    if(!info)throw new Error('Catalogue contains undeclared mode '+mode);
    if(Array.isArray(info.compositeOf)&&info.compositeOf.length)continue;
    // Preserve an existing immutable ID when rebuilding normalized source from generated rows.
    // Only genuinely legacy rows without songId receive a deterministic bootstrap ID.
    const key=row.canonicalKey?String(row.canonicalKey):E.songUseKey({...row,songId:null});
    const id=row.songId?String(row.songId):songId(key);
    const song=songs[id]??={id,canonicalKey:key,title:row.title,artist:row.artist,
      release:{answerYear:null,year:null,state:'unresolved',claims:[]},providers:Object.fromEntries(providers.map(p=>[p,{preferredId:null,links:[]}]))};
    const membership={songId:id,mode,year:Number(year),metadata:{},fieldOrder:Object.keys(row)};
    if(row.title!==song.title||row.artist!==song.artist)membership.displayOverrides={title:row.title,artist:row.artist};
    for(const [field,value] of Object.entries(row)){
      if(['title','artist','year','canonicalKey','songId','sourceMode'].includes(field))continue;
      const provider=providers.find(p=>field===p+'Id');
      if(provider){
        (membership.providerRefs??={})[provider]=value||null;
        if(value&&!song.providers[provider].links.some(x=>x.id===value))song.providers[provider].links.push({id:value,url:link(provider,value),state:'unverified',origin:'legacy-catalogue'});
      }else membership.metadata[field]=value;
    }
    if(info.yearBasis==='release'){
      const answerYear=Number(row.releaseYear||year);
      if(song.release.answerYear!=null&&song.release.answerYear!==answerYear)throw new Error('Conflicting release answer years for '+id);
      song.release.answerYear=answerYear;
      const claim={year:answerYear,state:row.releaseYear&&row.evidenceState==='externally_observed'?'externally_observed':'legacy_unverified',sourceUrl:row.sourceUrl||null,evidence:row.releaseYearEvidence||null};
      if(!song.release.claims.some(x=>JSON.stringify(x)===JSON.stringify(claim)))song.release.claims.push(claim);
    }
    memberships.push(membership);
  }
  for(const song of Object.values(songs)){
    const years=[...new Set(song.release.claims.filter(x=>x.state==='externally_observed').map(x=>x.year))];
    if(years.length===1)song.release={...song.release,year:years[0],state:'externally_observed'};
    else if(years.length>1)song.release.state='conflicting_evidence';
  }
  return {schemaVersion:2,catalogue,songs,memberships};
}

export function compileDatabase(db,manifest=loadProductionCatalogue().manifest){
  if(db.schemaVersion!==2)throw new Error('Unsupported song database schema');
  const modeDefs=manifest?.modes||{};
  const data={...structuredClone(db.catalogue),modes:{},coverage:{},missing:{}};
  const seen=new Set();
  for(const m of db.memberships){
    const info=modeDefs[m.mode];
    if(!info)throw new Error('Invalid mode membership');
    if(Array.isArray(info.compositeOf)&&info.compositeOf.length)throw new Error('Composite mode cannot have direct memberships');
    const song=db.songs[m.songId];if(!song)throw new Error('Dangling song membership '+m.songId);
    if(info.yearBasis==='screen')validateScreenMembership(m);
    const year=membershipAnswerYear(m,song,info);
    if(!data.years.includes(year))throw new Error('Invalid mode/year membership');
    if(info.yearBasis==='release'&&song.release?.state==='externally_observed'&&Number(song.release?.year)!==year)throw new Error('Canonical release answer year conflicts with accepted release evidence for '+m.songId);
    if(Object.keys(m.metadata||{}).some(k=>['title','artist','year','songId','canonicalKey','spotifyId','youtubeId','__proto__','constructor','prototype'].includes(k)))throw new Error('Reserved membership metadata');
    if(Object.keys(m.displayOverrides||{}).some(k=>!['title','artist'].includes(k)))throw new Error('Invalid membership display override');
    const relation=info.yearBasis==='screen'?`/${String(m.metadata.screenWorkId)}`:'';
    const identity=`${m.mode}/${year}/${m.songId}${relation}`;if(seen.has(identity))throw new Error('Duplicate membership '+identity);seen.add(identity);
    const values={...structuredClone(m.metadata),title:song.title,artist:song.artist,...structuredClone(m.displayOverrides),year,songId:song.id,canonicalKey:song.canonicalKey};
    const explicitPlayback=info.playbackVariant==='membership_explicit';
    let explicitCount=0;
    for(const provider of providers){
      const explicit=Object.hasOwn(m.providerRefs||{},provider)?m.providerRefs[provider]:undefined;
      if(explicit&&!song.providers[provider].links.some(x=>x.id===explicit))throw new Error('Dangling playback reference '+explicit);
      if(explicitPlayback){
        if(explicit){values[provider+'Id']=explicit;explicitCount++}
        else values[provider+'Id']='';
      }else if(song.providers[provider].preferredId){
        const asset=song.providers[provider].links.find(x=>x.id===song.providers[provider].preferredId);
        if(!asset||asset.state!=='verified'||!asset.evidence?.recordingMatch||!asset.evidence?.checkedAt)throw new Error('Preferred playback must have verified recording evidence');
        values[provider+'Id']=asset.id;
      }else if(explicit)values[provider+'Id']=explicit;
      else if(explicit===null)values[provider+'Id']='';
    }
    if(explicitPlayback){
      if(!explicitCount)throw new Error('Membership-explicit playback requires at least one provider reference');
      values.playbackPolicy='membership-explicit';
    }
    const row={};for(const k of [...(m.fieldOrder||[]),...Object.keys(values)])if(Object.hasOwn(values,k))row[k]=values[k];
    ((data.modes[m.mode]??={})[year]??=[]).push(row);
  }

  // Composite modes are generated views over source memberships, never independent source rows.
  for(const [mode,info] of Object.entries(modeDefs)){
    if(!Array.isArray(info.compositeOf)||!info.compositeOf.length)continue;
    const derived={},derivedSeen=new Set();
    for(const sourceMode of info.compositeOf){
      if(!modeDefs[sourceMode])throw new Error(`Composite mode ${mode} references undeclared mode ${sourceMode}`);
      for(const [year,rows] of Object.entries(data.modes[sourceMode]||{}))for(const sourceRow of rows){
        const relation=String(sourceRow.screenWorkId||'');
        const identity=`${sourceRow.songId}/${relation}/${year}`;
        if(derivedSeen.has(identity))continue;
        derivedSeen.add(identity);
        ((derived[year]??=[])).push({...structuredClone(sourceRow),sourceMode});
      }
    }
    if(Object.keys(derived).length)data.modes[mode]=derived;
  }

  for(const [mode,buckets] of Object.entries(data.modes)){
    data.coverage[mode]=Object.keys(buckets).length;data.missing[mode]=data.years.filter(y=>!buckets[y]?.length);
  }
  return data;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const file='data/song-database.json',action=process.argv[2]||'check';
  if(action==='migrate'){
    if(fs.existsSync(file))throw new Error('Database already exists; edit the shared source instead of reimporting generated data');
    const {data,manifest}=loadProductionCatalogue();fs.writeFileSync(file,JSON.stringify(migrateCatalogue(data,manifest),null,2)+'\n');
  }else{
    const db=JSON.parse(fs.readFileSync(file,'utf8')),compiled=compileDatabase(db);
    if(action==='build')fs.writeFileSync('data/catalogue.json',JSON.stringify(compiled)+'\n');
    else if(action==='check'){
      if(!isDeepStrictEqual(compiled,loadProductionCatalogue().data))throw new Error('Generated catalogue is stale; run song_database.mjs build');
    }else throw new Error('Use migrate, build or check');
    console.log(JSON.stringify({songs:Object.keys(db.songs).length,memberships:db.memberships.length,action}));
  }
}