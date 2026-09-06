import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('setup-playback.js','utf8');
const css=fs.readFileSync('setup-playback.css','utf8');

assert.match(index,/setup-playback\.css\?v=\d+\.\d+\.\d+/,'setup playback CSS must be loaded with a cache-busting version');
assert.match(index,/app\.js\?v=7\.6\.1[\s\S]*setup-playback\.js\?v=7\.6\.2/,'setup playback enhancement must load after app.js');
assert.match(js,/Playback device/,'setup must label the playback device explicitly');
assert.match(js,/spotifyDevices\(\)/,'setup must use Spotify Connect device discovery');
assert.match(js,/getSpotifyDevice\(\)/,'setup must reflect the saved Spotify target');
assert.match(js,/devices\.find\(device=>device\.id===selected\)\|\|devices\.find\(device=>device\.is_active\)\|\|devices\[0\]/,'displayed automatic target must match engine selection precedence');
assert.match(js,/setSpotifyDevice\(event\.currentTarget\.value\)/,'changing the setup selector must persist the Spotify target');
assert.match(js,/Automatic \(active Spotify device\)/,'automatic routing must be explicit');
assert.match(js,/This device[\s\S]*YouTube plays in this browser/,'YouTube must explain its local playback route');
assert.match(css,/\.setup-playback-card/,'setup playback styles must be scoped');
assert.doesNotMatch(js,/\/me\/player/,'setup UI must not introduce a second playback-control implementation');

console.log('Setup playback UI contract passed.');
