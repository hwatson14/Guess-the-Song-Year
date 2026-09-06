import fs from 'node:fs';

const WRITE=process.argv.includes('--write');
const releaseModes=new Set(['greatest','australian','unexpected']);
const validYear=value=>Number.isInteger(Number(value))&&Number(value)>=1950&&Number(value)<=2022;

function writeText(path,text){
  if(WRITE)fs.writeFileSync(path,text);
}
function replaceExact(path,from,to){
  let text=fs.readFileSync(path,'utf8');
  if(text.includes(to))return false;
  if(!text.includes(from))throw new Error(`Migration anchor not found in ${path}: ${from.slice(0,120)}`);
  text=text.replace(from,to);
  writeText(path,text);
  return true;
}
function patchDatabase(){
  const path='data/song-database.json';
  const db=JSON.parse(fs.readFileSync(path,'utf8'));
  if(![1,2].includes(db.schemaVersion))throw new Error(`Unsupported pre-migration schema ${db.schemaVersion}`);
  const yearsBySong=new Map();
  for(const m of db.memberships){
    if(!db.songs[m.songId])throw new Error(`Dangling membership ${m.songId}`);
    if(!releaseModes.has(m.mode))continue;
    if(!validYear(m.year))throw new Error(`Invalid release-mode membership year ${m.mode}/${m.songId}/${m.year}`);
    const set=yearsBySong.get(m.songId)||new Set();set.add(Number(m.year));yearsBySong.set(m.songId,set);
  }
  let releaseSongs=0,unresolved=0,observed=0,metadataKeysRemoved=0;
  for(const [id,song] of Object.entries(db.songs)){
    const membershipYears=[...(yearsBySong.get(id)||[])];
    if(membershipYears.length>1)throw new Error(`Release-mode memberships disagree for ${id}: ${membershipYears.join(', ')}`);
    const membershipYear=membershipYears[0]??null;
    const evidenceYear=validYear(song.release?.year)?Number(song.release.year):null;
    if(song.release?.state==='externally_observed'){
      observed++;
      if(evidenceYear==null)throw new Error(`Externally observed song lacks release.year: ${id}`);
      if(membershipYear!=null&&membershipYear!==evidenceYear)throw new Error(`Observed release year conflicts with gameplay year for ${id}: evidence ${evidenceYear}, gameplay ${membershipYear}`);
    }else if(song.release?.state==='unresolved')unresolved++;
    const answerYear=evidenceYear??membershipYear??(validYear(song.release?.answerYear)?Number(song.release.answerYear):null);
    if(membershipYear!=null){releaseSongs++;if(answerYear==null)throw new Error(`Release-mode song lacks answer year: ${id}`);}
    song.release={...(song.release||{}),answerYear};
  }
  for(const m of db.memberships){
    if(m.metadata&&Object.hasOwn(m.metadata,'canonicalKey')){delete m.metadata.canonicalKey;metadataKeysRemoved++;}
    if(m.metadata&&Object.hasOwn(m.metadata,'songId')){delete m.metadata.songId;metadataKeysRemoved++;}
  }
  db.schemaVersion=2;
  if(WRITE)fs.writeFileSync(path,JSON.stringify(db,null,2)+'\n');
  return {songs:Object.keys(db.songs).length,releaseSongs,observed,unresolved,metadataKeysRemoved};
}

function patchCompiler(){
  const path='scripts/song_database.mjs';
  replaceExact(path,
    "const providers=['spotify','youtube'];",
    "const providers=['spotify','youtube'];\nconst releaseModes=new Set(['greatest','australian','unexpected']);");
  replaceExact(path,
    "release:{year:null,state:'unresolved',claims:[]},providers:Object.fromEntries(providers.map(p=>[p,{preferredId:null,links:[]}]))};",
    "release:{answerYear:null,year:null,state:'unresolved',claims:[]},providers:Object.fromEntries(providers.map(p=>[p,{preferredId:null,links:[]}]))};");
  replaceExact(path,
    "if(['title','artist','year'].includes(field))continue;",
    "if(['title','artist','year','canonicalKey','songId'].includes(field))continue;");
  replaceExact(path,
    "    if(manifest.modes[mode].yearBasis==='release'){\n      const claim={year:Number(row.releaseYear||year),state:row.releaseYear&&row.evidenceState==='externally_observed'?'externally_observed':'legacy_unverified',sourceUrl:row.sourceUrl||null,evidence:row.releaseYearEvidence||null};\n      if(!song.release.claims.some(x=>JSON.stringify(x)===JSON.stringify(claim)))song.release.claims.push(claim);\n    }",
    "    if(manifest.modes[mode].yearBasis==='release'){\n      const answerYear=Number(row.releaseYear||year);\n      if(song.release.answerYear!=null&&song.release.answerYear!==answerYear)throw new Error('Conflicting release answer years for '+id);\n      song.release.answerYear=answerYear;\n      const claim={year:answerYear,state:row.releaseYear&&row.evidenceState==='externally_observed'?'externally_observed':'legacy_unverified',sourceUrl:row.sourceUrl||null,evidence:row.releaseYearEvidence||null};\n      if(!song.release.claims.some(x=>JSON.stringify(x)===JSON.stringify(claim)))song.release.claims.push(claim);\n    }");
  replaceExact(path,"return {schemaVersion:1,catalogue,songs,memberships};","return {schemaVersion:2,catalogue,songs,memberships};");
  replaceExact(path,"if(db.schemaVersion!==1)throw new Error('Unsupported song database schema');","if(db.schemaVersion!==2)throw new Error('Unsupported song database schema');");
  replaceExact(path,
    "  for(const m of db.memberships){\n    if(!['greatest','australian','unexpected','number1_us','number1_au'].includes(m.mode)||!data.years.includes(m.year))throw new Error('Invalid mode/year membership');\n    if(Object.keys(m.metadata||{}).some(k=>['title','artist','year','spotifyId','youtubeId','__proto__','constructor','prototype'].includes(k)))throw new Error('Reserved membership metadata');\n    const song=db.songs[m.songId];if(!song)throw new Error('Dangling song membership '+m.songId);\n    const identity=`${m.mode}/${m.year}/${m.songId}`;if(seen.has(identity))throw new Error('Duplicate membership '+identity);seen.add(identity);\n    const values={title:song.title,artist:song.artist,year:m.year,...m.displayOverrides,...structuredClone(m.metadata)};",
    "  for(const m of db.memberships){\n    if(!['greatest','australian','unexpected','number1_us','number1_au'].includes(m.mode))throw new Error('Invalid mode membership');\n    const song=db.songs[m.songId];if(!song)throw new Error('Dangling song membership '+m.songId);\n    const year=releaseModes.has(m.mode)?Number(song.release?.answerYear):Number(m.year);\n    if(!data.years.includes(year))throw new Error('Invalid mode/year membership');\n    if(releaseModes.has(m.mode)&&song.release?.state==='externally_observed'&&Number(song.release?.year)!==year)throw new Error('Canonical release answer year conflicts with accepted release evidence for '+m.songId);\n    if(Object.keys(m.metadata||{}).some(k=>['title','artist','year','songId','canonicalKey','spotifyId','youtubeId','__proto__','constructor','prototype'].includes(k)))throw new Error('Reserved membership metadata');\n    const identity=`${m.mode}/${year}/${m.songId}`;if(seen.has(identity))throw new Error('Duplicate membership '+identity);seen.add(identity);\n    const values={...structuredClone(m.metadata),title:song.title,artist:song.artist,year,songId:song.id,canonicalKey:song.canonicalKey,...m.displayOverrides};");
  replaceExact(path,
    "    ((data.modes[m.mode]??={})[m.year]??=[]).push(row);",
    "    ((data.modes[m.mode]??={})[year]??=[]).push(row);");
}

function patchRuntimeIdentity(){
  const path='engine-v7.js';
  replaceExact(path,
    "  function underlyingKey(song){\n    if(song?.canonicalKey)return String(song.canonicalKey);\n    return `${baseTitle(song?.title)}|${primaryArtist(song?.artist)}`;\n  }",
    "  function underlyingKey(song){\n    if(song?.songId)return String(song.songId);\n    if(song?.canonicalKey)return String(song.canonicalKey);\n    return `${baseTitle(song?.title)}|${primaryArtist(song?.artist)}`;\n  }\n\n  function legacyIdentityKeys(song){\n    const primary=underlyingKey(song);\n    return [...new Set([song?.canonicalKey,...(Array.isArray(song?.legacyKeys)?song.legacyKeys:[])].map(v=>String(v||'')).filter(Boolean))].filter(key=>key!==primary);\n  }");
  replaceExact(path,
    "      const songLegacyKeys=Object.fromEntries(years.map(year=>[year,Object.fromEntries(pools[year].filter(song=>Array.isArray(song.legacyKeys)&&song.legacyKeys.length).map(song=>[underlyingKey(song),song.legacyKeys.map(String)]))]));",
    "      const songLegacyKeys=Object.fromEntries(years.map(year=>[year,Object.fromEntries(pools[year].map(song=>[underlyingKey(song),legacyIdentityKeys(song)]).filter(([,keys])=>keys.length))]));");
  replaceExact(path,
    "      return !(Array.isArray(song.legacyKeys)&&song.legacyKeys.some(key=>used.has(String(key))));",
    "      return !legacyIdentityKeys(song).some(key=>used.has(key));");
}

function patchDatabaseTests(){
  const path='scripts/test_song_database.mjs';
  replaceExact(path,
    "import {compileDatabase,migrateCatalogue,songId} from './song_database.mjs';",
    "import {compileDatabase,migrateCatalogue} from './song_database.mjs';");
  replaceExact(path,
    "  assert.equal(id,song.id);assert.equal(id,songId(song.canonicalKey));",
    "  assert.equal(id,song.id);assert.match(id,/^song_[0-9a-f]{20}$/);");
  replaceExact(path,
    "assert.equal(corrected.modes.number1_us[2000][0].chartYear,2000);\n// A verified centrally preferred provider is inherited by every membership,",
    "assert.equal(corrected.modes.number1_us[2000][0].chartYear,2000);\n// Release-mode answer years and master identity are authoritative on the song, not the membership mirror.\nconst movedDb=structuredClone(migrated),movedSong=Object.values(movedDb.songs)[0],stableId=Object.values(movedDb.songs)[0].id;\nconst legacyReleaseMembership=movedDb.memberships.find(m=>m.mode==='greatest');\nassert.equal(legacyReleaseMembership.year,1999);\nmovedSong.canonicalKey='corrected example|artist';\nmovedSong.release.answerYear=2000;\nconst moved=compileDatabase(movedDb);\nassert.ok(!moved.modes.greatest[1999],'release-mode membership.year is no longer authoritative');\nassert.equal(moved.modes.greatest[2000][0].songId,stableId);\nassert.equal(moved.modes.greatest[2000][0].canonicalKey,'corrected example|artist');\nassert.equal(legacyReleaseMembership.year,1999,'changing the master does not require rewriting the legacy membership mirror');\nconst evidenceConflict=structuredClone(movedDb),conflictSong=evidenceConflict.songs[stableId];\nconflictSong.release.state='externally_observed';conflictSong.release.year=1999;\nassert.throws(()=>compileDatabase(evidenceConflict),/conflicts with accepted release evidence/);\n// A verified centrally preferred provider is inherited by every membership,");
  replaceExact(path,
    "for(const m of db.memberships)assert.ok(manifest.modes[m.mode]&&data.years.includes(m.year));",
    "for(const m of db.memberships){\n  const info=manifest.modes[m.mode],song=db.songs[m.songId];assert.ok(info&&song);\n  const answerYear=info.yearBasis==='release'?Number(song.release.answerYear):Number(m.year);\n  assert.ok(data.years.includes(answerYear));\n}");
}

function patchRuntimeTests(){
  const path='scripts/test_engine_v7.mjs';
  replaceExact(path,
    "const australianSong={title:'Australian Song',artist:'Australian Artist',year:2000,canonicalKey:'australian song|australian artist'};",
    "const australianSong={songId:'song_australian_2000',title:'Australian Song',artist:'Australian Artist',year:2000,canonicalKey:'australian song|australian artist'};");
  replaceExact(path,
    "const E=globalThis.window.GSYEngine;\n\nconst alphaKey=E.songUseKey(songs[0]);",
    "const E=globalThis.window.GSYEngine;\n\nconst stableIdentity={songId:'song_stable_identity',title:'Stable',artist:'Artist',canonicalKey:'stable before|artist'};\nif(E.songUseKey(stableIdentity)!=='song_stable_identity')throw new Error('master songId must be primary runtime identity');\nstableIdentity.canonicalKey='stable after|artist';\nif(E.songUseKey(stableIdentity)!=='song_stable_identity')throw new Error('editing canonicalKey must not change primary runtime identity');\n\nconst alphaKey=E.songUseKey(songs[0]);");
  replaceExact(path,
    "const preview=await E.chooseSong(2000,'unexpected',[]);",
    "let legacyIdentityBlocked=false;\ntry{await E.chooseSong(2000,'australian',[australianSong.canonicalKey])}catch(err){legacyIdentityBlocked=err?.code==='NO_UNUSED_SONG'}\nif(!legacyIdentityBlocked)throw new Error('pre-migration saved canonicalKey must still block the stable songId song');\n\nconst preview=await E.chooseSong(2000,'unexpected',[]);");
}

function patchSchema(){
  const path='data/catalogue.schema.json';
  const schema=JSON.parse(fs.readFileSync(path,'utf8')),song=schema.$defs.song;
  song.required=[...new Set([...song.required,'songId'])];
  song.properties.songId={type:'string',pattern:'^song_[0-9a-f]{20}$',description:'Immutable master-song identity. Runtime no-repeat and cross-mode identity use this field.'};
  if(song.properties.canonicalKey)song.properties.canonicalKey.description='Reviewable title/artist matching and dedupe key. It may change when metadata is corrected and is not the primary song identity.';
  writeText(path,JSON.stringify(schema,null,2)+'\n');
}

function patchDocs(){
  replaceExact('AGENTS.md',
    "Canonical identity is stable across modes; memberships reference one master song.",
    "Canonical identity is stable across modes; memberships reference one master song. `song_id` is immutable after creation and must not be regenerated when `canonicalKey`, title, or artist metadata changes.");
  replaceExact('AGENTS.md',
    "1. `song.year` equals the containing card/year bucket and the answer year shown to players.",
    "1. Release-year modes take their answer year from the master song's `release.answerYear`; chart modes take it from chart membership. Generated `song.year`, bucket year, and the answer shown to players must agree.");
  replaceExact('docs/DATA_ARCHITECTURE.md',
    "- **Master song:** stable internal song ID, title, artist, canonical key, release evidence, and canonical year.\n- **Mode membership:** a reference to a master song plus mode/year metadata; chart modes retain chart year and rank.",
    "- **Master song:** immutable internal song ID, title, artist, reviewable canonical key, release evidence, and `release.answerYear` for release-year gameplay.\n- **Mode membership:** a reference to a master song plus mode metadata. Release-mode membership years are retained only as a legacy compatibility mirror; they do not determine the compiled answer year. Chart modes retain their chart year and rank.");
  replaceExact('docs/DATA_ARCHITECTURE.md',
    "For reviewed release evidence, the current data uses MusicBrainz recording earliest `first-release-date` evidence, with title/artist matching and alternate-version filtering.",
    "For release-year modes, `release.answerYear` is the single gameplay source of truth on the master song. `release.year` and `release.state` separately record accepted external evidence and its confidence, so an unresolved legacy answer can remain playable without pretending it is independently verified. For reviewed release evidence, the current data uses MusicBrainz recording earliest `first-release-date` evidence, with title/artist matching and alternate-version filtering.");
  replaceExact('docs/DATA_ARCHITECTURE.md',
    "Canonical song identity is represented by the stable master ID; `canonicalKey` remains matching/dedupe machinery.",
    "Canonical song identity is represented by the immutable master ID and is emitted as `songId` in the runtime catalogue; `canonicalKey` remains reviewable matching/dedupe machinery and may change after metadata correction.");
  replaceExact('docs/STATUS_AND_ROADMAP.md',
    "The normalized JSON source separates master song facts from mode memberships and provider links. A correction is made once and flows through every membership when the deterministic compiler rebuilds the runtime catalogue.",
    "The normalized JSON source separates master song facts from mode memberships and provider links. Release-mode answer years now come from the master song's `release.answerYear`, and runtime identity uses immutable `songId`; a correction is made once and flows through every membership when the deterministic compiler rebuilds the runtime catalogue.");
  replaceExact('README.md',
    "Each master song has a stable ID, title, artist, release evidence, and Spotify/YouTube links.",
    "Each master song has an immutable ID, title, artist, a master `release.answerYear` for release-year gameplay, release evidence, and Spotify/YouTube links.");
}

const stats=patchDatabase();
patchCompiler();
patchRuntimeIdentity();
patchDatabaseTests();
patchRuntimeTests();
patchSchema();
patchDocs();
console.log(JSON.stringify({write:WRITE,...stats},null,2));
