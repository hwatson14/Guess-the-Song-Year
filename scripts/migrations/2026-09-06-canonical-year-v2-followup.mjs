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

// Prevent unnoticed compiler-facing synthetic fixtures from continuing to exercise the retired DB schema.
const identityUsers=[];
for(const name of fs.readdirSync('scripts')){
  if(!name.endsWith('.mjs'))continue;
  const file=path.join('scripts',name),text=fs.readFileSync(file,'utf8');
  if(text.includes('compileDatabase')&&/schemaVersion\s*:\s*1\b/.test(text))throw new Error(`Retired schemaVersion:1 compiler fixture remains in ${file}`);
  if(text.includes('songUseKey'))identityUsers.push(file);
}

console.log(JSON.stringify({write:WRITE,patched:true,identityUsers},null,2));
