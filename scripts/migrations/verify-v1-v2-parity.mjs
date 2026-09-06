import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const baseline=JSON.parse(execFileSync('git',['show','HEAD:data/catalogue.json'],{encoding:'utf8',maxBuffer:32*1024*1024}));
const current=JSON.parse(fs.readFileSync('data/catalogue.json','utf8'));

const withoutGenerated=(row,oldRow)=>{
  const copy=structuredClone(row);
  for(const key of ['songId','canonicalKey'])if(!Object.hasOwn(oldRow,key))delete copy[key];
  return copy;
};
const topLevel=data=>Object.fromEntries(Object.entries(data).filter(([key])=>!['modes','coverage','missing'].includes(key)));
assert.deepEqual(topLevel(current),topLevel(baseline),'Non-mode catalogue metadata changed during identity migration');
assert.deepEqual(Object.keys(current.modes),Object.keys(baseline.modes),'Mode set changed during identity migration');
let rows=0,identityFieldsAdded=0;
for(const [mode,years] of Object.entries(baseline.modes)){
  assert.deepEqual(Object.keys(current.modes[mode]||{}),Object.keys(years),`${mode}: year buckets changed during identity migration`);
  for(const [year,oldRows] of Object.entries(years)){
    const newRows=current.modes[mode][year]||[];
    assert.equal(newRows.length,oldRows.length,`${mode}/${year}: row count changed during identity migration`);
    for(let i=0;i<oldRows.length;i++){
      const oldRow=oldRows[i],newRow=newRows[i];
      assert.deepEqual(withoutGenerated(newRow,oldRow),oldRow,`${mode}/${year}/${i}: non-identity runtime fields changed`);
      if(!Object.hasOwn(oldRow,'songId')&&Object.hasOwn(newRow,'songId'))identityFieldsAdded++;
      rows++;
    }
  }
}
assert.deepEqual(current.coverage,baseline.coverage,'Coverage changed during identity migration');
assert.deepEqual(current.missing,baseline.missing,'Missing-year map changed during identity migration');
console.log(`Migration parity verified for ${rows} runtime rows; ${identityFieldsAdded} stable songId fields added with no non-identity changes.`);
