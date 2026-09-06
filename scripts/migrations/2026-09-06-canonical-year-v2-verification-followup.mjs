import fs from 'node:fs';

const WRITE=process.argv.includes('--write');
function replaceExact(path,from,to){
  let text=fs.readFileSync(path,'utf8');
  if(text.includes(to))return false;
  if(!text.includes(from))throw new Error(`Verification follow-up anchor not found in ${path}`);
  text=text.replace(from,to);
  if(WRITE)fs.writeFileSync(path,text);
  return true;
}

replaceExact('scripts/test_catalogue_cleanup.mjs',
`// All baseline rows must survive verbatim either in the game or in the archive.
for(const original of baseline.rows){
  const active=(data.modes[original.mode][original.year]||[]).some(row=>originalHash(row)===original.fingerprint);
  const archived=archive.some(row=>row.mode===original.mode&&row.year===original.year&&row.original&&fingerprint(row.original)===original.fingerprint);
  assert.equal(Number(active)+Number(archived),1,\`Lost or duplicated baseline record: \${original.mode}/\${original.year}/\${original.key}\`);
}`,
`// Historical cleanup accounting is identity-based. The v1-to-v2 migration parity test
// separately proves that no non-identity runtime fields change while songId/canonicalKey are materialized.
for(const original of baseline.rows){
  const active=(data.modes[original.mode][original.year]||[]).filter(row=>reviewKey(row)===original.key).length;
  const archived=archive.some(row=>row.mode===original.mode&&row.year===original.year&&row.original&&fingerprint(row.original)===original.fingerprint)?1:0;
  assert.equal(active+archived,1,\`Lost or duplicated baseline identity: \${original.mode}/\${original.year}/\${original.key}\`);
}`);

console.log(JSON.stringify({write:WRITE,patched:true}));
