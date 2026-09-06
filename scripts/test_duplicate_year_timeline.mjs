import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('app.css','utf8');
const policy=fs.readFileSync('app-policy.js','utf8');

assert.match(app,/function timelineYearGroups\(years\)/);
assert.match(app,/timeline-year-row/);
assert.match(app,/timeline-year-label/);
assert.match(app,/timeline-card-stack/);
assert.match(app,/--timeline-cols:\$\{maxCount\}/);
assert.match(app,/slot\(group\.start\)/);
assert.doesNotMatch(app,/years\.map\(\(year,i\)=>`\$\{choosing\?slot\(i\):''\}<span class=\"timeline-year\">/);
assert.match(css,/grid-template-columns:48px minmax\(0,1fr\)/);
assert.match(css,/grid-template-columns:repeat\(var\(--timeline-cols,1\),minmax\(0,1fr\)\)/);

const sandbox={window:{},URL};
vm.createContext(sandbox);
vm.runInContext(policy,sandbox);
const {placementIsCorrect}=sandbox.window.GSYAppPolicy;
assert.equal(placementIsCorrect([1998,1998,2001],0,1998),true);
assert.equal(placementIsCorrect([1998,1998,2001],2,1998),true);
assert.equal(placementIsCorrect([1998,1998,2001],2,1999),true);
assert.equal(placementIsCorrect([1998,1998,2001],3,1999),false);

console.log('Duplicate-year timeline grouping and equal-year placement contract passed.');
