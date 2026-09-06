import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync('app.js','utf8');
const backgroundBlock=app.match(/function suspendForBackground\(\)\{([\s\S]*?)\n  \}\n  document\.addEventListener\('visibilitychange'/)?.[1]||'';

assert.ok(backgroundBlock,'background lifecycle handler must remain present');
assert.match(
  backgroundBlock,
  /current\?\.provider!==['"]spotify['"]&&\(screen===['"]playing['"]\|\|screen===['"]youtube['"]\|\|playing\)\)stopPlayback\(\)/,
  'backgrounding must preserve Spotify playback instead of pausing it'
);
assert.doesNotMatch(
  backgroundBlock,
  /if\(screen===['"]playing['"]\|\|screen===['"]youtube['"]\|\|playing\)stopPlayback\(\)/,
  'backgrounding must not unconditionally stop active playback'
);
assert.match(app,/document\.visibilityState===['"]hidden['"]\)\{suspendForBackground\(\)/,'screen lock/background must still use the guarded lifecycle handler');
assert.match(app,/window\.addEventListener\(['"]pagehide['"],suspendForBackground\)/,'pagehide must use the same guarded lifecycle handler');
assert.match(app,/if\(screen===['"]playing['"]\|\|screen===['"]youtube['"]\)stopPlayback\(\);[\s\S]*?screen=['"]resume['"]/,'explicit Back navigation must still stop playback');
assert.match(app,/function revealPhysical\(\)\{[^\n]*stopPlayback\(\)/,'revealing a physical answer must still stop playback');

console.log('Spotify background playback regression contract passed.');
