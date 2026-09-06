import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const js=fs.readFileSync(path.join(root,'mode-labels.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

assert.match(js,/statusLabel\} · \$\{songCountLabel\(report\.songs\)\} · \$\{report\.coverageLabel\}/,'mode selector should show song count before year coverage');
assert.match(js,/songCountLabel\(report\.songs\)\} · \$\{report\.coverageLabel\} · \$\{basis\}/,'selected mode detail should show song count before year coverage');
assert.match(js,/yearBasis==='screen'\?'screen-work year'/,'screen modes should label their answer basis as screen-work year');
assert.match(js,/new MutationObserver\(schedule\)/,'mode labels should survive app re-renders');
assert.ok(html.includes('./mode-labels.js?v=1.0.0'),'index should load mode-labels.js');
assert.ok(html.indexOf('./mode-labels.js?v=1.0.0')>html.indexOf('./app.js?v=7.6.1'),'mode-labels.js must load after app.js');

console.log('Mode label song-count and year-basis UI contract passed.');