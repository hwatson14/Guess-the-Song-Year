import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('app.css','utf8');
const index=fs.readFileSync('index.html','utf8');

assert.match(app,/function songCountLabel\(/,'song counts should be rendered natively by app.js');
assert.match(app,/songCountLabel\(r\.songs\)/,'mode selector should include native song counts');
assert.match(app,/songCountLabel\(report\.songs\)/,'selected mode detail should include native song counts');
assert.match(app,/Tap a gap in your timeline\. Your mystery song will appear there\./,'virtual placement instructions should describe gaps');
assert.match(app,/function placementLockCopy\(/,'placement lock copy should be derived from the selected interval');
assert.match(app,/timeline-slot placement-gap/,'placement gaps should be rendered natively');
assert.match(app,/timeline-mystery/,'selected placement should render a mystery-song card');
assert.match(app,/has-placement/,'alternate gaps should have a selected-state container class');
assert.match(css,/\.timeline-slot\.placement-gap/,'native placement gap styles should exist');
assert.match(css,/\.timeline-slot\.placement-gap\.selected/,'selected mystery-card styles should exist');
assert.match(css,/\.timeline-years\.has-placement \.placement-gap:not\(\.selected\)/,'unselected gaps should fade after a choice');
assert.doesNotMatch(index,/mode-labels\.js/,'mode labels must not depend on a post-render observer');

console.log('Native mode-label and virtual placement UI contract passed.');
