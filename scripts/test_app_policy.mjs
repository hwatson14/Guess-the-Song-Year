import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

globalThis.window={};
await import(`${pathToFileURL(path.resolve('app-policy.js')).href}?test=${Date.now()}`);
const P=globalThis.window.GSYAppPolicy;

assert.ok(P,'app policy must be exposed');
assert.deepEqual(P.SUPPORTED_CARD_DECKS,{uk:'aaaa0005',au:'aaah0001'});
assert.equal(P.parseCardId('1'),1);
assert.equal(P.parseCardId('00308'),308);
assert.equal(P.parseCardId('00000'),null);
assert.equal(P.parseCardId('309'),null);
assert.equal(P.parseCardId('https://hitstergame.com/uk/aaaa0005/00001'),1);
assert.equal(P.parseCardId('https://www.hitstergame.com/au/aaah0001/00308?campaign=qr'),308);
assert.equal(P.parseCardId('https://hitstergame.com/uk/aaaa0016/00001'),null);
assert.equal(P.parseCardId('https://hitstergame.com/de/aaaa0005/00001'),null);
assert.equal(P.parseCardId('https://evil.example/uk/aaaa0005/00001'),null);
assert.equal(P.parseCardId('http://hitstergame.com/uk/aaaa0005/00001'),null);
assert.equal(P.parseCardId('junk/00001'),null);

assert.equal(P.normalizeCardYear(' 1975 '),1975);
assert.equal(P.normalizeCardYear(P.CARD_YEAR_MAX),P.CARD_YEAR_MAX);
assert.equal(P.normalizeCardYear('975'),null);
assert.equal(P.normalizeCardYear('19755'),null);
assert.equal(P.normalizeCardYear('1975.5'),null);
assert.equal(P.normalizeCardYear('nineteen seventy-five'),null);
assert.equal(P.normalizeCardYear(P.CARD_YEAR_MIN-1),null);
assert.equal(P.normalizeCardYear(P.CARD_YEAR_MAX+1),null);
assert.equal(P.normalizeCardYear(''),null);

assert.equal(P.canRetryPreparationError('YOUTUBE_QUOTA'),true);
assert.equal(P.canRetryPreparationError('CATALOGUE_UNAVAILABLE'),true);
assert.equal(P.canRetryPreparationError('MODE_YEAR_UNAVAILABLE'),false);
assert.equal(P.canRetryPreparationError('NO_SONG'),false);
assert.equal(P.canRetryPreparationError('NO_UNUSED_SONG'),false);
assert.equal(P.canRetryPreparationError('CATALOGUE_INVALID'),false);
assert.equal(P.preparationErrorKind('YOUTUBE_VIDEO_NOT_FOUND'),'track');
assert.equal(P.preparationErrorKind('NO_UNUSED_SONG'),'catalogue');
assert.equal(P.preparationErrorKind('YOUTUBE_QUOTA'),'provider');
assert.equal(P.preparationErrorKind('MODE_YEAR_UNAVAILABLE'),'catalogue');
assert.equal(P.preparationErrorKind('SPOTIFY_API'),'provider');

assert.equal(P.shouldInterceptBack({screen:'playing'}),true);
assert.equal(P.shouldInterceptBack({screen:'error'}),true);
assert.equal(P.shouldInterceptBack({screen:'resume'}),false);
assert.equal(P.shouldInterceptBack({screen:'setup'}),false);
assert.equal(P.shouldInterceptBack({screen:'gameover'}),false);
assert.equal(P.shouldInterceptBack({screen:'resume',musicModal:true}),true);

assert.equal(P.placementIsCorrect([1970,1990],1,1984),true);
assert.equal(P.placementIsCorrect([1970,1990],0,1984),false);
assert.equal(P.placementIsCorrect([1970,1990],2,2001),true);
assert.equal(P.placementIsCorrect([1970,1990],3,2001),false);
assert.equal(P.placementIsCorrect([1970,1990],1,Number.NaN),false);

console.log('app policy regression tests passed');
