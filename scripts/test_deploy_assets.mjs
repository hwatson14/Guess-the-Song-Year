import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync('index.html','utf8');
const workflow=fs.readFileSync('.github/workflows/pages.yml','utf8');
const localAssets=new Set();
for(const match of index.matchAll(/(?:src|href)="\.\/([^"?#]+)(?:\?[^"#]*)?"/g)){
  const file=match[1];
  if(/\.(?:js|css)$/i.test(file)&&!file.includes('/'))localAssets.add(file);
}
assert.ok(localAssets.size>0,'index must reference local runtime assets');
for(const asset of localAssets){
  assert.match(workflow,new RegExp(`\\b${asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`),`Pages staging must publish ${asset}`);
}
assert.doesNotMatch(index,/mode-labels\.js/,'unsafe post-render mode label enhancer must not ship');
console.log('Pages deployment asset contract passed:',[...localAssets].sort().join(', '));
