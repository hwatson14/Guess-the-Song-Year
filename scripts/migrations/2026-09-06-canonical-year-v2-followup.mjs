import fs from 'node:fs';

const WRITE=process.argv.includes('--write');
function replaceExact(path,from,to){
  let text=fs.readFileSync(path,'utf8');
  if(text.includes(to))return false;
  if(!text.includes(from))throw new Error(`Follow-up migration anchor not found in ${path}`);
  text=text.replace(from,to);
  if(WRITE)fs.writeFileSync(path,text);
  return true;
}

replaceExact('scripts/test_year_gap_evidence.mjs',
  "  const key=E.songUseKey(song),rows=Object.values(data.modes[mode]).flat().filter(s=>E.songUseKey(s)===key);\n  assert.equal(rows.length,1,input.title+' must have one identity within its mode');\n  assert.equal(rows[0].year,input.releaseYear);\n  assert.ok(rows[0].releaseYearEvidence&&rows[0].sourceProvider&&rows[0].sourceRetrievalDate);\n  assert.ok(reports[mode].yearSongKeys[input.year].includes(key),'new row must pass the actual runtime filter');\n  const excluded=reports[mode].yearSongKeys[input.year].filter(candidate=>candidate!==key);\n  assert.equal(E.songUseKey(await E.chooseSong(input.year,mode,excluded)),key);",
  "  const matchingKey=E.songUseKey(song),rows=Object.values(data.modes[mode]).flat().filter(s=>String(s.canonicalKey||'')===matchingKey);\n  assert.equal(rows.length,1,input.title+' must have one canonical match within its mode');\n  const runtimeKey=E.songUseKey(rows[0]);\n  assert.equal(rows[0].year,input.releaseYear);\n  assert.ok(rows[0].releaseYearEvidence&&rows[0].sourceProvider&&rows[0].sourceRetrievalDate);\n  assert.ok(reports[mode].yearSongKeys[input.year].includes(runtimeKey),'new row must pass the actual runtime filter');\n  const excluded=reports[mode].yearSongKeys[input.year].filter(candidate=>candidate!==runtimeKey);\n  assert.equal(E.songUseKey(await E.chooseSong(input.year,mode,excluded)),runtimeKey);");

replaceExact('scripts/integrate_year_gaps.mjs',
  "    const existing=Object.entries(data.modes[mode]).flatMap(([year,pool])=>pool\n      .filter(row=>E.songUseKey(row)===song.canonicalKey).map(row=>({year:Number(year),row})));",
  "    // Ingestion/reconciliation matches the reviewable canonicalKey. Runtime no-repeat uses immutable songId.\n    const existing=Object.entries(data.modes[mode]).flatMap(([year,pool])=>pool\n      .filter(row=>String(row.canonicalKey||'')===song.canonicalKey).map(row=>({year:Number(year),row})));");

console.log(JSON.stringify({write:WRITE,patched:true}));
