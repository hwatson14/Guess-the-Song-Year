import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync('index.html','utf8');
const workflow=fs.readFileSync('.github/workflows/pages.yml','utf8');
const localAssets=[
  ...index.matchAll(/<(?:script)[^>]+src="\.\/([^"?#]+)(?:\?[^"#]*)?"/g),
  ...index.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="\.\/([^"?#]+)(?:\?[^"#]*)?"/g),
].map(match=>match[1]);

assert.ok(localAssets.length,'index should reference local runtime assets');
for(const asset of localAssets){
  assert.ok(fs.existsSync(asset),`referenced runtime asset must exist: ${asset}`);
  const escaped=asset.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  assert.match(workflow,new RegExp(`\\b${escaped}\\b`),`Pages staging must include referenced runtime asset: ${asset}`);
}

console.log(`Release asset integrity passed for ${localAssets.length} index assets.`);
