import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const appCss=readFileSync(new URL('../app.css',import.meta.url),'utf8');
const playbackCss=readFileSync(new URL('../setup-playback.css',import.meta.url),'utf8');

assert.match(appCss,/\.screen-setup\{[^}]*height:100dvh;[^}]*overflow:hidden;/s,'mobile setup remains viewport-composed');
assert.match(playbackCss,/@media\(max-width:520px\)[\s\S]*\.screen-setup \.setup-grid\{[\s\S]*overflow-y:auto;/,'mobile setup grid must provide its own vertical scrollport');
assert.match(playbackCss,/\.screen-setup \.setup-grid\{[\s\S]*align-content:start;/,'scrollable setup content must start at the top rather than center overflow');
assert.match(playbackCss,/\.screen-setup \.setup-grid\{[\s\S]*-webkit-overflow-scrolling:touch;/,'mobile setup scrolling should retain momentum scrolling support');

console.log('Mobile setup scroll regression tests passed');
