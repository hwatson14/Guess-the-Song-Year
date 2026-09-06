import fs from 'node:fs';
import path from 'node:path';

const WRITE=process.argv.includes('--write');
function replaceExact(pathname,from,to){
  let text=fs.readFileSync(pathname,'utf8');
  if(text.includes(to))return false;
  if(!text.includes(from))throw new Error(`Follow-up migration anchor not found in ${pathname}`);
  text=text.replace(from,to);
  if(WRITE)fs.writeFileSync(pathname,text);
  return true;
}

replaceExact('scripts/test_year_gap_evidence.mjs',
  "  const key=E.songUseKey(song),rows=Object.values(data.modes[mode]).flat().filter(s=>E.songUseKey(s)===key);\n  assert.equal(rows.length,1,input.title+' must have one identity within its mode');\n  assert.equal(rows[0].year,input.releaseYear);\n  assert.ok(rows[0].releaseYearEvidence&&rows[0].sourceProvider&&rows[0].sourceRetrievalDate);\n  assert.ok(reports[mode].yearSongKeys[input.year].includes(key),'new row must pass the actual runtime filter');\n  const excluded=reports[mode].yearSongKeys[input.year].filter(candidate=>candidate!==key);\n  assert.equal(E.songUseKey(await E.chooseSong(input.year,mode,excluded)),key);",
  "  const matchingKey=E.songUseKey(song),rows=Object.values(data.modes[mode]).flat().filter(s=>String(s.canonicalKey||'')===matchingKey);\n  assert.equal(rows.length,1,input.title+' must have one canonical match within its mode');\n  const runtimeKey=E.songUseKey(rows[0]);\n  assert.equal(rows[0].year,input.releaseYear);\n  assert.ok(rows[0].releaseYearEvidence&&rows[0].sourceProvider&&rows[0].sourceRetrievalDate);\n  assert.ok(reports[mode].yearSongKeys[input.year].includes(runtimeKey),'new row must pass the actual runtime filter');\n  const excluded=reports[mode].yearSongKeys[input.year].filter(candidate=>candidate!==runtimeKey);\n  assert.equal(E.songUseKey(await E.chooseSong(input.year,mode,excluded)),runtimeKey);");

replaceExact('scripts/integrate_year_gaps.mjs',
  "    const existing=Object.entries(data.modes[mode]).flatMap(([year,pool])=>pool\n      .filter(row=>E.songUseKey(row)===song.canonicalKey).map(row=>({year:Number(year),row})));",
  "    // Ingestion/reconciliation matches the reviewable canonicalKey. Runtime no-repeat uses immutable songId.\n    const existing=Object.entries(data.modes[mode]).flatMap(([year,pool])=>pool\n      .filter(row=>String(row.canonicalKey||'')===song.canonicalKey).map(row=>({year:Number(year),row})));");

replaceExact('scripts/song_database.mjs',
  "    const key=E.songUseKey(row),id=songId(key);",
  "    // Preserve an existing immutable ID when rebuilding normalized source from generated rows.\n    // Only genuinely legacy rows without songId receive a deterministic bootstrap ID.\n    const key=row.canonicalKey?String(row.canonicalKey):E.songUseKey({...row,songId:null});\n    const id=row.songId?String(row.songId):songId(key);");

replaceExact('scripts/test_reviewed_provider_links.mjs',
  "const db={schemaVersion:1,catalogue:{years:[2000]},songs:{song:{title:'Example',artist:'Artist',release:{year:2000,claims:[{sourceUrl}]},providers:",
  "const db={schemaVersion:2,catalogue:{years:[2000]},songs:{song:{id:'song',canonicalKey:'example|artist',title:'Example',artist:'Artist',release:{answerYear:2000,year:2000,state:'externally_observed',claims:[{sourceUrl}]},providers:");

replaceExact('scripts/cleanup_catalogue.mjs',
  "  const changes=[],known=new Set(archive.map(entry=>entry.id));\n  const addAlias=(row,key)=>{\n    if(key&&key!==E.songUseKey(row))row.legacyKeys=[...new Set([...(row.legacyKeys||[]),key])].sort();\n  };",
  "  const changes=[],known=new Set(archive.map(entry=>entry.id));\n  const reviewKey=row=>String(row?.canonicalKey||E.songUseKey({...row,songId:null}));\n  const addAlias=(row,key)=>{\n    if(key&&key!==reviewKey(row))row.legacyKeys=[...new Set([...(row.legacyKeys||[]),key])].sort();\n  };");
replaceExact('scripts/cleanup_catalogue.mjs',
  "      const identity=E.songUseKey(replacement);\n      if(Object.values(data.modes[mode]).flat().some(row=>E.songUseKey(row)===identity))",
  "      const identity=reviewKey(replacement);\n      if(Object.values(data.modes[mode]).flat().some(row=>reviewKey(row)===identity))");
replaceExact('scripts/cleanup_catalogue.mjs',
  "      if(action==='repair')addAlias(row,decision.originalKey||E.songUseKey(original));",
  "      if(action==='repair')addAlias(row,decision.originalKey||reviewKey(original));");
replaceExact('scripts/cleanup_catalogue.mjs',
  "      const candidates=Object.values(data.modes[mode]).flat().filter(row=>E.songUseKey(row)===target?.key);",
  "      const candidates=Object.values(data.modes[mode]).flat().filter(row=>reviewKey(row)===target?.key);");
replaceExact('scripts/cleanup_catalogue.mjs',
  "      addAlias(candidates[0],decision.originalKey||E.songUseKey(original));",
  "      addAlias(candidates[0],decision.originalKey||reviewKey(original));");

replaceExact('scripts/test_catalogue_cleanup.mjs',
  "const originalHash=row=>{const clone=structuredClone(row);delete clone.legacyKeys;return fingerprint(clone)};",
  "const originalHash=row=>{const clone=structuredClone(row);delete clone.legacyKeys;delete clone.songId;return fingerprint(clone)};\nconst reviewKey=row=>String(row?.canonicalKey||E.songUseKey({...row,songId:null}));");
replaceExact('scripts/test_catalogue_cleanup.mjs',
  "    const active=data.modes[entry.mode][row.year].find(x=>E.songUseKey(x)===E.songUseKey(row));",
  "    const active=data.modes[entry.mode][row.year].find(x=>reviewKey(x)===reviewKey(row));");
replaceExact('scripts/test_catalogue_cleanup.mjs',
  "    const target=entry.retained||{year:entry.replacement.year,key:E.songUseKey(entry.replacement)};\n    const targetRow=data.modes[entry.mode][target.year].find(x=>E.songUseKey(x)===target.key);\n    assert.ok(targetRow,'Duplicate/repair has no retained identity');\n    const oldKey=entry.originalKey;\n    if(oldKey!==target.key)assert.ok(targetRow.legacyKeys.includes(oldKey),'Saved-game alias was lost');\n    const used=[...reports[entry.mode].yearSongKeys[target.year].filter(x=>x!==target.key),oldKey];",
  "    const target=entry.retained||{year:entry.replacement.year,key:reviewKey(entry.replacement)};\n    const targetRow=data.modes[entry.mode][target.year].find(x=>reviewKey(x)===target.key);\n    assert.ok(targetRow,'Duplicate/repair has no retained identity');\n    const runtimeKey=E.songUseKey(targetRow),oldKey=entry.originalKey;\n    if(oldKey!==target.key)assert.ok(targetRow.legacyKeys.includes(oldKey),'Saved-game alias was lost');\n    const used=[...reports[entry.mode].yearSongKeys[target.year].filter(x=>x!==runtimeKey),oldKey];");

replaceExact('scripts/import_provider_candidates.mjs',
  "import {compileDatabase,songId} from './song_database.mjs';",
  "import {compileDatabase} from './song_database.mjs';");
replaceExact('scripts/import_provider_candidates.mjs',
  "const E=catalogueEngine(compileDatabase(db),manifest);",
  "const E=catalogueEngine(compileDatabase(db),manifest);\nconst songsByCanonical=new Map(Object.values(db.songs).map(song=>[String(song.canonicalKey),song]));");
replaceExact('scripts/import_provider_candidates.mjs',
  "  const key=E.songUseKey(row),song=db.songs[db.aliases?.[key]||songId(key)];if(!song)continue;",
  "  const key=E.songUseKey(row),song=db.songs[db.aliases?.[key]]||songsByCanonical.get(key);if(!song)continue;");

replaceExact('scripts/integrate_expansion.mjs',
  "const count=(mode,year)=>db.memberships.filter(m=>m.mode===mode&&m.year===year).length;",
  "const membershipYear=m=>manifest.modes[m.mode]?.yearBasis==='release'?Number(db.songs[m.songId]?.release?.answerYear):Number(m.year);\nconst count=(mode,year)=>db.memberships.filter(m=>m.mode===mode&&membershipYear(m)===year).length;\nconst songsByCanonical=new Map(Object.values(db.songs).map(song=>[String(song.canonicalKey),song]));");
replaceExact('scripts/integrate_expansion.mjs',
  "  const rawKey=E.songUseKey(candidate),id=db.aliases?.[rawKey]||songId(rawKey),key=db.songs[id]?.canonicalKey||rawKey,year=candidate.releaseYear;",
  "  const rawKey=E.songUseKey(candidate),matched=db.songs[db.aliases?.[rawKey]]||songsByCanonical.get(rawKey),id=matched?.id||songId(rawKey),key=matched?.canonicalKey||rawKey,year=candidate.releaseYear;");
replaceExact('scripts/integrate_expansion.mjs',
  "  if(existing&&(existing.release.year&&existing.release.year!==year||db.memberships.some(m=>m.songId===id&&manifest.modes[m.mode].yearBasis==='release'&&m.year!==year))){skipped.push({key,reason:'conflicts with an existing release-year membership; review required'});continue}",
  "  if(existing&&((existing.release.year&&existing.release.year!==year)||(existing.release.answerYear&&existing.release.answerYear!==year))){skipped.push({key,reason:'conflicts with the existing canonical release year; review required'});continue}");
replaceExact('scripts/integrate_expansion.mjs',
  "  const song=db.songs[id]??={id,canonicalKey:key,title:row.title,artist:row.artist,release:{year,state:'externally_observed',claims:[]},providers:{spotify:{preferredId:null,links:[]},youtube:{preferredId:null,links:[]}}};\n  if(!song.release.claims.some(x=>x.sourceUrl===claim.sourceUrl)){song.release.claims.push(claim);song.release.year=year;song.release.state='externally_observed'}",
  "  const song=db.songs[id]??={id,canonicalKey:key,title:row.title,artist:row.artist,release:{answerYear:year,year,state:'externally_observed',claims:[]},providers:{spotify:{preferredId:null,links:[]},youtube:{preferredId:null,links:[]}}};\n  song.release.answerYear=Number(song.release.answerYear??year);\n  if(!song.release.claims.some(x=>x.sourceUrl===claim.sourceUrl)){song.release.claims.push(claim);song.release.year=year;song.release.state='externally_observed'}");
replaceExact('scripts/integrate_expansion.mjs',
  "    const metadata=Object.fromEntries(Object.entries(row).filter(([k])=>!['title','artist','year','spotifyId','youtubeId'].includes(k)));",
  "    const metadata=Object.fromEntries(Object.entries(row).filter(([k])=>!['title','artist','year','canonicalKey','songId','spotifyId','youtubeId'].includes(k)));");

// Prevent unnoticed compiler-facing synthetic fixtures from continuing to exercise the retired DB schema.
const identityUsers=[];
for(const name of fs.readdirSync('scripts')){
  if(!name.endsWith('.mjs'))continue;
  const file=path.join('scripts',name),text=fs.readFileSync(file,'utf8');
  if(text.includes('compileDatabase')&&/schemaVersion\s*:\s*1\b/.test(text))throw new Error(`Retired schemaVersion:1 compiler fixture remains in ${file}`);
  if(text.includes('songUseKey'))identityUsers.push(file);
}

console.log(JSON.stringify({write:WRITE,patched:true,identityUsers},null,2));
