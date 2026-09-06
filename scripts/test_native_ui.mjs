import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('app.css','utf8');

assert.doesNotMatch(index,/mode-labels\.js/,'mode labels must be rendered natively, not by a post-render observer');
assert.match(app,/songCountLabel/,'setup must render mode song counts natively');
assert.match(app,/movie\/show year|screen-work year/,'screen modes must explain their answer-year basis');
assert.match(app,/original song year/,'remix mode must explain its answer-year basis');
assert.match(app,/Tap a gap in your timeline\. Your mystery song will appear there\./,'placement instruction must describe an insertion gap');
assert.match(app,/timeline-mystery/,'selected placement must render a mystery-song card');
assert.match(app,/placementLockCopy/,'lock button must describe the selected chronological interval');
assert.match(app,/workTitle|screenWorkTitle/,'reveal must identify the represented movie or TV show');
assert.match(app,/playedVersion|remixTitle/,'reveal must identify the remix that was played');
assert.match(css,/\.timeline-slot\.placement-gap/,'placement gaps must have native timeline styling');
assert.match(css,/\.timeline-mystery/,'mystery placement card must have native styling');
assert.match(css,/\.timeline-years\.has-placement/,'unselected gaps must visually recede after a choice');
console.log('Native setup, placement and reveal UI contracts passed.');
