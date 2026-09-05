import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const engine=readFileSync('engine.js','utf8').replace(/AIza[0-9A-Za-z_-]+/g,'PUBLIC_BROWSER_KEY');
const app=readFileSync('app.js','utf8');
const index=readFileSync('index.html','utf8');
const scanner=readFileSync('vendor/html5-qrcode/html5-qrcode.min.js');
const scannerLicense=readFileSync('vendor/html5-qrcode/LICENSE','utf8');

assert.match(engine,/token:'gsy\.spotifyToken\.v6'/);
assert.match(engine,/saveJSON\(LS\.token,spotifyToken\)/);
assert.match(engine,/localStorage\.removeItem\(LS\.token\)/);
assert.doesNotMatch(engine,/saveSessionJSON|gsy\.spotifyToken\.v7/);
assert.match(engine,/spotifyAccessToken\(true\)/);
assert.match(engine,/r\.status===401&&!retried/);
assert.match(engine,/catch\(err\)\{if\(err\?\.status!==404\)throw err\}/);
assert.doesNotMatch(engine,/setSpotifyDevice\(chosen\.id\)/);
assert.match(engine,/function enqueueSpotifyPlayback\(task\)/);
assert.match(engine,/function pauseSpotify\(\)\{return enqueueSpotifyPlayback\(/);

assert.match(engine,/cardYears:'gsy\.cardYearOverrides\.v1'/);
assert.match(engine,/saveJSON\(LS\.cardYears,cardYearOverrides\)/);

assert.ok(app.indexOf("if(phase==='reveal'&&current)")<app.indexOf("if(current&&current.provider!==E.getProvider())"));
assert.match(app,/const retryable=!!err\.cardId&&P\.canRetryPreparationError\(err\.code\)/);
assert.match(app,/const seq=\+\+playbackSeq/);
assert.match(app,/const deadline=Date\.now\(\)\+5000/);

assert.ok(index.indexOf('app-policy.js')<index.indexOf('engine.js'));
assert.match(engine,/function parseCardId\(raw\)\{return P\.parseCardId\(raw\)\}/);

assert.match(app,/\.\/vendor\/html5-qrcode\/html5-qrcode\.min\.js\?v=2\.3\.8/);
assert.doesNotMatch(app,/unpkg\.com\/html5-qrcode/i);
assert.equal(
  createHash('sha256').update(scanner).digest('hex'),
  '660b12437b1d747e3e68b8be0685c08cb728140110ad213f167b14b66f8b1d8e'
);
assert.match(scannerLicense,/Apache License/);

console.log('security storage and vendored dependency regression tests passed');
