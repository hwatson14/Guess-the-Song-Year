#!/usr/bin/env python3
"""Add themed playlists on top of the canonical v10 Greatest Hits build.

The canonical Greatest Hits builder remains the source of truth for underlying-song
identity, alternate-version rejection, and earliest recording release year. Curated
playlist seeds are either matched to an already-verified Greatest Hits song or run
through the same MusicBrainz recording verifier. Sparse theme years explicitly fall
back to Greatest Hits for the same card year.
"""
import json
import re
import time
from pathlib import Path

import build_catalogue_v10 as canonical
from build_modes import MODE_META, SEEDS

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = ROOT / 'data' / 'catalogue.json'
SCHEMA = ROOT / 'data' / 'catalogue.schema.json'
ENGINE = ROOT / 'engine.js'
ENGINE_V7 = ROOT / 'engine-v7.js'
APP = ROOT / 'app.js'
INDEX = ROOT / 'index.html'
README = ROOT / 'README.md'
VALIDATOR = ROOT / 'scripts' / 'validate_catalogue.py'
ENGINE_TEST = ROOT / 'scripts' / 'test_engine_v7.mjs'
ACTIVE = ('greatest', 'sing_along', 'australian', 'unexpected', 'party', 'rock')


def greatest_index(greatest):
    out = {}
    for year, pool in greatest.items():
        for song in pool:
            key = song.get('canonicalKey') or canonical.underlying_key(song['title'], song['artist'])
            out[key] = (int(year), song)
    return out


def song_from_greatest(mode, year, base):
    song = dict(base)
    song['year'] = int(year)
    song['canonicalKey'] = base.get('canonicalKey') or canonical.underlying_key(base['title'], base['artist'])
    song['source'] = f'curated-{mode}-from-canonical-greatest'
    song['sourceLabel'] = f'{MODE_META[mode]["name"]} · canonical earliest recording release {year}'
    song['playlist'] = mode
    return song


def song_from_evidence(mode, seed_title, seed_artist, evidence, playback_exact, playback_underlying):
    year = int(evidence['year'])
    title, artist = canonical.canonical_display({'title': seed_title, 'artist': seed_artist}, evidence)
    key = canonical.underlying_key(title, artist)
    song = {
        'title': title,
        'artist': artist,
        'year': year,
        'canonicalKey': key,
        'yearEvidence': 'MusicBrainz recording earliest first-release-date',
        'musicbrainzId': evidence['musicbrainzId'],
        'musicbrainzMatchedTitle': evidence['musicbrainzMatchedTitle'],
        'musicbrainzMatchedArtist': evidence['musicbrainzMatchedArtist'],
        'mbScore': evidence['mbScore'],
        'titleSimilarity': evidence['titleSimilarity'],
        'artistSimilarity': evidence['artistSimilarity'],
        'source': f'curated-{mode}-recording-year-verified',
        'sourceLabel': f'{MODE_META[mode]["name"]} · earliest recording release {year} verified',
        'playlist': mode,
    }
    ids = playback_exact.get(canonical.song_key(title, artist)) or playback_underlying.get(key) or {}
    song['spotifyId'] = ids.get('spotifyId', '')
    song['youtubeId'] = ids.get('youtubeId', '')
    return song


def build_themed_modes(greatest):
    idx = greatest_index(greatest)
    playback_exact, playback_underlying = canonical.bimmuda_lookup()
    modes = {}
    rejected = {}

    for mode in ACTIVE[1:]:
        buckets = {}
        seen = set()
        misses = []
        print('Playlist', MODE_META[mode]['name'], flush=True)
        for seed_title, seed_artist in SEEDS[mode]:
            if canonical.is_explicit_alternate_title(seed_title):
                misses.append(f'{seed_title} / {seed_artist} [alternate-version seed]')
                continue

            seed_key = canonical.underlying_key(seed_title, seed_artist)
            hit = idx.get(seed_key)
            if hit:
                year, base = hit
                song = song_from_greatest(mode, year, base)
            else:
                evidence = canonical.confirm_release_year({'title': seed_title, 'artist': seed_artist})
                if not evidence:
                    misses.append(f'{seed_title} / {seed_artist} [no canonical recording match]')
                    continue
                year = int(evidence['year'])
                if not 1950 <= year <= 2022:
                    misses.append(f'{seed_title} / {seed_artist} [release {year} outside game range]')
                    continue
                song = song_from_evidence(mode, seed_title, seed_artist, evidence, playback_exact, playback_underlying)

            year = int(song['year'])
            key = song['canonicalKey']
            dedupe_key = (year, key)
            if dedupe_key in seen:
                continue
            if canonical.is_explicit_alternate_title(song['title']):
                misses.append(f'{song["title"]} / {song["artist"]} [alternate canonical title]')
                continue
            seen.add(dedupe_key)
            buckets.setdefault(str(year), []).append(song)

        modes[mode] = dict(sorted(buckets.items(), key=lambda x: int(x[0])))
        rejected[mode] = misses
        print(' ', len(buckets), 'years', sum(len(v) for v in buckets.values()), 'songs', flush=True)
        if misses:
            print(' ', len(misses), 'seeds rejected by canonical verification', flush=True)

    return modes, rejected


def write_schema():
    year_pattern = '^(19[5-9][0-9]|20[0-2][0-9])$'
    mode = {
        'type': 'object',
        'patternProperties': {
            year_pattern: {
                'type': 'array',
                'minItems': 1,
                'items': {'$ref': '#/$defs/song'},
            }
        },
        'additionalProperties': False,
    }
    schema = {
        '$schema': 'https://json-schema.org/draft/2020-12/schema',
        '$id': 'https://hwatson14.github.io/Guess-the-Song-Year/data/catalogue.schema.json',
        'title': 'Guess the Song Year prebuilt catalogue',
        'description': 'Canonical song-year catalogue. Every song year must equal its containing card-year bucket. Themed playlists may be sparse and explicitly fall back to Greatest Hits for that same year.',
        'type': 'object',
        'required': ['version', 'modes', 'modeMeta', 'modeFallbacks'],
        'properties': {
            'version': {'type': 'integer', 'minimum': 11},
            'generatedAt': {'type': 'string'},
            'years': {'type': 'array', 'items': {'type': 'integer'}},
            'modes': {
                'type': 'object',
                'required': list(ACTIVE),
                'properties': {name: {'$ref': '#/$defs/mode'} for name in ACTIVE},
                'additionalProperties': False,
            },
            'modeMeta': {'type': 'object'},
            'modeFallbacks': {
                'type': 'object',
                'required': list(ACTIVE[1:]),
                'properties': {name: {'const': 'greatest'} for name in ACTIVE[1:]},
                'additionalProperties': False,
            },
            'coverage': {'type': 'object'},
            'sources': {'type': 'object'},
            'poolStats': {'type': 'object'},
            'playlistStats': {'type': 'object'},
        },
        '$defs': {
            'mode': mode,
            'song': {
                'type': 'object',
                'required': ['title', 'artist', 'year'],
                'properties': {
                    'title': {'type': 'string', 'minLength': 1},
                    'artist': {'type': 'string', 'minLength': 1},
                    'year': {'type': 'integer', 'minimum': 1950, 'maximum': 2022},
                    'canonicalKey': {'type': 'string'},
                    'yearEvidence': {'type': 'string'},
                    'spotifyId': {'type': 'string'},
                    'youtubeId': {'type': 'string'},
                    'source': {'type': 'string'},
                    'sourceLabel': {'type': 'string'},
                },
                'additionalProperties': True,
            },
        },
    }
    SCHEMA.write_text(json.dumps(schema, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def write_engine_guard():
    meta = json.dumps({k: MODE_META[k] for k in ACTIVE}, ensure_ascii=False, separators=(',', ':'))
    js = f"""(() => {{
  'use strict';
  const E=window.GSYEngine;
  if(!E)throw new Error('GSYEngine must load before engine-v7.js');
  E.MODES={meta};

  const variant=/\\b(karaoke|tribute|cover|live|remix|mix|acoustic|a cappella|acapella|backing|instrumental|bootleg|mashup|preview|playback|deluxe|remaster(?:ed)?|radio edit|radio version|single edit|single version|album version|extended(?: version| mix)?|club mix|dance mix|original mix|mono|stereo|sped up|slowed|re-record(?:ed)?|music video|video|take \\d+|pt\\.?\\s*\\d+|part \\d+|third recording|special disco version)\\b/i;
  const malformedArtist=/[a-zà-ÿ][A-Z]/;

  function norm(v){{return String(v??'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim()}}
  function baseTitle(v){{
    let s=String(v??'').trim();
    s=s.replace(/[\\[(]([^\\])]+)[\\])]/g,(whole,inside)=>variant.test(inside)||/^\\s*(feat\\.?|ft\\.?|featuring|with)\\b/i.test(inside)?' ':whole);
    s=s.replace(/\\s[-–—:]\\s([^\\n]+)$/,(whole,suffix)=>variant.test(suffix)?' ':whole);
    s=s.replace(/\\s+(feat\\.?|ft\\.?|featuring|with)\\s+.+$/i,' ');
    return norm(s);
  }}
  function primaryArtist(v){{let s=String(v??'').trim();s=s.split(/\\s+(?:feat\\.?|ft\\.?|featuring|with)\\s+/i)[0];s=s.split(/\\s+(?:and|&)\\s+/i)[0];return norm(s).replace(/^the\\s+/,'')}}
  function underlyingKey(song){{if(song?.canonicalKey)return String(song.canonicalKey);return `${{baseTitle(song?.title)}}|${{primaryArtist(song?.artist)}}`}}
  function quality(song){{let n=0;if(song.spotifyId)n+=4;if(song.youtubeId)n+=2;if(!variant.test(String(song.title||'')))n+=4;if(!malformedArtist.test(String(song.artist||'')))n+=2;if(Number(song.mbScore||0)>=70)n+=1;if(song.canonicalKey)n+=2;return n}}
  function dedupe(pool){{
    const ranked=[...pool].sort((a,b)=>quality(b)-quality(a));
    const out=[],songs=new Set(),spotify=new Set(),youtube=new Set();
    for(const song of ranked){{
      if(!song||!song.title||!song.artist)continue;
      const canonical=underlyingKey(song),sp=String(song.spotifyId||''),yt=String(song.youtubeId||'');
      if(!canonical||songs.has(canonical)||(sp&&spotify.has(sp))||(yt&&youtube.has(yt)))continue;
      songs.add(canonical);if(sp)spotify.add(sp);if(yt)youtube.add(yt);out.push(song);
    }}
    return out;
  }}
  function poolFor(data,id,year){{
    let pool=(data?.modes?.[id]?.[String(year)]||[]).filter(song=>Number(song?.year)===Number(year));
    pool=dedupe(pool);
    const clean=pool.filter(song=>!variant.test(String(song.title||''))&&!malformedArtist.test(String(song.artist||'')));
    return clean.length?clean:pool;
  }}

  E.songUnderlyingKey=underlyingKey;
  E.songUseKey=underlyingKey;
  E.chooseSong=async function(year,modeId='greatest',usedKeys=[]){{
    const id=E.MODES?.[modeId]?modeId:'greatest';
    const data=await E.loadCatalogue();
    const used=new Set(usedKeys||[]);
    const primary=poolFor(data,id,year);
    let available=primary.filter(song=>!used.has(underlyingKey(song)));
    if(!available.length&&id!=='greatest'){{
      const fallback=poolFor(data,'greatest',year);
      available=fallback.filter(song=>!used.has(underlyingKey(song)));
    }}
    if(!available.length){{
      const hasAny=primary.length||(id!=='greatest'&&poolFor(data,'greatest',year).length);
      throw new E.AppError(hasAny?'NO_UNUSED_SONG':'NO_SONG',hasAny?`Every ${{year}} song available for this playlist has already been used.`:`No prebuilt song is available for ${{year}}.`);
    }}
    return {{...available[Math.floor(Math.random()*available.length)]}};
  }};
}})();
"""
    ENGINE_V7.write_text(js, encoding='utf-8')


def patch_app():
    s = APP.read_text(encoding='utf-8')
    old_header = "  const DEFAULT_CFG={playMode:'physical',teams:2,victory:'10'};\n  const MODE='greatest';"
    new_header = "  const DEFAULT_CFG={playMode:'physical',teams:2,victory:'10',mode:'greatest'};"
    if old_header in s:
        s = s.replace(old_header, new_header)
    elif new_header not in s:
        raise RuntimeError('app.js config header changed unexpectedly')

    provider = "  function providerReady(){return E.getProvider()==='youtube'||E.isSpotifyConnected()}\n"
    helpers = provider + "  function modeId(){return match?.mode||cfg.mode||'greatest'}\n  function modeInfo(id=modeId()){return E.MODES?.[id]||E.MODES?.greatest||{name:'Greatest Hits',desc:''}}\n"
    if 'function modeId()' not in s:
        if provider not in s: raise RuntimeError('providerReady patch point missing')
        s = s.replace(provider, helpers)

    normalize = "    if(!['10','unlimited'].includes(cfg.victory))cfg.victory='10';\n"
    if "if(!E.MODES?.[cfg.mode])cfg.mode='greatest';" not in s:
        if normalize not in s: raise RuntimeError('normalizeConfig patch point missing')
        s = s.replace(normalize, normalize + "    if(!E.MODES?.[cfg.mode])cfg.mode='greatest';\n")

    s = s.replace('    match.mode=MODE;', '    match.mode=E.MODES?.[match.mode]?match.mode:cfg.mode;')
    s = s.replace('<p class="subtitle">Greatest Hits. Pick how you want to play, then start.</p>', '<p class="subtitle">${esc(modeInfo(cfg.mode).name)}. Pick how you want to play, then start.</p>')

    if 'data-mode="${id}"' not in s:
        setup = '''      <div class="setup-grid">\n        <section class="card option-card">\n          <div class="option-head"><h3>1. Play style</h3>'''
        replacement = '''      <div class="setup-grid">\n        <section class="card option-card">\n          <div class="option-head"><h3>1. Playlist</h3><span>${esc(modeInfo(cfg.mode).desc)}</span></div>\n          <div class="deck-options">${Object.entries(E.MODES||{}).map(([id,m])=>`<button class="deck-option ${cfg.mode===id?'on':''}" data-mode="${id}"><b>${esc(m.name)}</b><span>${esc(m.desc)}</span></button>`).join('')}</div>\n        </section>\n        <section class="card option-card">\n          <div class="option-head"><h3>2. Play style</h3>'''
        if setup not in s: raise RuntimeError('setup playlist patch point missing')
        s = s.replace(setup, replacement)
        s = s.replace('<h3>2. Teams</h3>', '<h3>3. Teams</h3>').replace('<h3>3. Victory target</h3>', '<h3>4. Victory target</h3>')

    bind = "    root.querySelectorAll('[data-play]').forEach"
    if "root.querySelectorAll('[data-mode]')" not in s:
        if bind not in s: raise RuntimeError('bind playlist patch point missing')
        s = s.replace(bind, "    root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{cfg.mode=b.dataset.mode;saveCfg();render()});\n" + bind)

    s = s.replace(' · Greatest Hits · ', ' · ${esc(modeInfo(match.mode).name)} · ')
    s = s.replace('<p>Greatest Hits · ${providerName()}. The answer stays hidden.</p>', '<p>${esc(modeInfo().name)} · ${providerName()}. The answer stays hidden.</p>')
    s = s.replace('mode:MODE', 'mode:cfg.mode', 1)
    s = s.replace('E.chooseSong(year,MODE,excluded)', 'E.chooseSong(year,modeId(),excluded)')
    s = s.replace('mode:MODE', 'mode:modeId()')

    if "const MODE='greatest'" in s or 'mode:MODE' in s or 'chooseSong(year,MODE' in s:
        raise RuntimeError('hard-coded Greatest Hits mode remains in app.js')
    APP.write_text(s, encoding='utf-8')


def write_validator():
    code = r'''#!/usr/bin/env python3
import ast,json,re,sys
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import build_catalogue_v10 as canonical
CATALOGUE=ROOT/'data'/'catalogue.json';ENGINE=ROOT/'engine.js';APP=ROOT/'app.js'
ACTIVE=('greatest','sing_along','australian','unexpected','party','rock')
def fail(m):raise SystemExit('catalogue validation failed: '+m)
def year_map():
 t=ENGINE.read_text();m=re.search(r'const YEAR_MAP=(\[[^;]+\]);',t)
 if not m:fail('YEAR_MAP missing')
 v=ast.literal_eval(re.sub(r'\bnull\b','None',m.group(1)))
 if len(v)!=309:fail(f'YEAR_MAP length {len(v)}')
 return v
def main():
 d=json.loads(CATALOGUE.read_text());modes=d.get('modes',{})
 if d.get('version')!=11:fail(f'catalogue version {d.get("version")} != 11')
 if set(modes)!=set(ACTIVE):fail(f'active modes mismatch: {sorted(modes)}')
 cards=year_map()[1:];counts=Counter(int(y) for y in cards if y);g=modes['greatest']
 if set(map(int,g))!=set(range(1950,2023)):fail('Greatest Hits year coverage incomplete')
 for year in range(1950,2023):
  pool=g[str(year)];need=max(12,counts.get(year,0))
  if len(pool)<need:fail(f'Greatest Hits {year} has {len(pool)} songs; need {need}')
  seen=set()
  for s in pool:
   if int(s.get('year') or 0)!=year:fail(f'Greatest Hits {year} year mismatch')
   if s.get('yearEvidence')!='MusicBrainz recording earliest first-release-date':fail(f'Greatest Hits {year} weak year evidence')
   if canonical.is_explicit_alternate_title(s['title']):fail(f'Greatest Hits alternate version: {s["title"]}')
   key=canonical.underlying_key(s['title'],s['artist'])
   if s.get('canonicalKey')!=key:fail(f'Greatest Hits canonical key mismatch: {s["title"]}')
   if key in seen:fail(f'Greatest Hits duplicate underlying song {year}: {key}')
   seen.add(key)
 for mode in ACTIVE[1:]:
  if d.get('modeFallbacks',{}).get(mode)!='greatest':fail(f'{mode} fallback is not greatest')
  if len(modes[mode])<15:fail(f'{mode} only covers {len(modes[mode])} curated years')
  for year,pool in modes[mode].items():
   seen=set()
   for s in pool:
    if int(s.get('year') or 0)!=int(year):fail(f'{mode}/{year}: year mismatch')
    if s.get('yearEvidence')!='MusicBrainz recording earliest first-release-date':fail(f'{mode}/{year}: weak year evidence')
    if canonical.is_explicit_alternate_title(s['title']):fail(f'{mode}/{year}: alternate version {s["title"]}')
    key=canonical.underlying_key(s['title'],s['artist'])
    if s.get('canonicalKey')!=key:fail(f'{mode}/{year}: canonical key mismatch')
    if key in seen:fail(f'{mode}/{year}: duplicate underlying song {key}')
    seen.add(key)
 app=APP.read_text()
 for token in ('data-mode=', 'function modeId()', "mode:'greatest'"):
  if token not in app:fail(f'app playlist token missing: {token}')
 if "const MODE='greatest'" in app:fail('app still hard-codes Greatest Hits')
 print('Catalogue validated',{'greatestSongs':sum(map(len,g.values())),'playlistStats':d.get('playlistStats')})
if __name__=='__main__':main()
'''
    VALIDATOR.write_text(code, encoding='utf-8')


def write_engine_test():
    test = r'''import fs from 'node:fs';import assert from 'node:assert/strict';
class AppError extends Error{constructor(code,message){super(message);this.code=code}}
const data={modes:{greatest:{'2000':[{title:'Fallback',artist:'Artist',year:2000,canonicalKey:'fallback|artist'}],'2001':[{title:'Fallback 2',artist:'Artist',year:2001,canonicalKey:'fallback 2|artist'}]},sing_along:{'2000':[{title:'Sing',artist:'Artist',year:2000,canonicalKey:'sing|artist'}]}}};
global.window={GSYEngine:{MODES:{greatest:{name:'Greatest Hits'}},AppError,loadCatalogue:async()=>data}};
eval(fs.readFileSync(new URL('../engine-v7.js',import.meta.url),'utf8'));
const E=window.GSYEngine;
assert.deepEqual(Object.keys(E.MODES),['greatest','sing_along','australian','unexpected','party','rock']);
assert.equal((await E.chooseSong(2000,'sing_along',[])).title,'Sing');
assert.equal((await E.chooseSong(2001,'sing_along',[])).title,'Fallback 2');
assert.equal((await E.chooseSong(2000,'sing_along',['sing|artist'])).title,'Fallback');
await assert.rejects(()=>E.chooseSong(2000,'sing_along',['sing|artist','fallback|artist']),e=>e.code==='NO_UNUSED_SONG');
assert.equal(E.songUseKey({title:'Song - 2011 Remaster',artist:'The Artist'}),E.songUseKey({title:'Song',artist:'Artist'}));
console.log('playlist engine tests passed');
'''
    ENGINE_TEST.write_text(test, encoding='utf-8')


def patch_versions():
    e = ENGINE.read_text(encoding='utf-8')
    e = re.sub(r'\./data/catalogue\.json\?v=\d+(?:\.\d+)*', './data/catalogue.json?v=11', e)
    ENGINE.write_text(e, encoding='utf-8')
    h = INDEX.read_text(encoding='utf-8')
    for asset in ('app.css', 'engine.js', 'engine-v7.js', 'app.js'):
        h = re.sub(rf'{re.escape(asset)}\?v=[^"\']+', f'{asset}?v=8.0.0', h)
    INDEX.write_text(h, encoding='utf-8')


def write_readme():
    text = '''# Guess the Song Year

Private music timeline game using the existing 308-card QR deck or a fully virtual deck.

## Playlists

- **Greatest Hits** — deep canonical Billboard-ranked pool for every card year
- **Sing Along** — huge choruses, karaoke staples and songs everyone joins in on
- **Australian** — Australian artists and homegrown favourites
- **Unexpected Years** — songs whose real release year is surprisingly early or late
- **Party Anthems** — dancefloor, wedding and party staples
- **Rock Classics** — big riffs, guitars and rock anthems

Themed playlists are curated and can be sparse in a particular year. When a scanned/dealt card year has no unused song in that theme, the runtime falls back only to the canonical Greatest Hits pool for **that same year**. It never changes the card year to make a theme fit.

## Core invariant

For every played card, `song.year == card year == containing catalogue year bucket`. Canonical year is the earliest verified MusicBrainz recording first-release-date. Alternate versions such as remixes, edits, remasters, acoustic/live versions and re-recordings collapse to the same underlying-song identity and do not become extra answers.

## Gameplay

- Real QR cards or fully virtual deck
- 1–6 teams
- First to 10 cards or Unlimited
- Spotify Premium playback or YouTube fallback
- Match phase, current song and reveal state persist for Resume

## Architecture

- `engine.js` — card map plus Spotify/YouTube integrations
- `engine-v7.js` — playlist selection, same-year fallback, canonical underlying-song dedupe and no-repeat runtime
- `app.js` — physical/virtual game state and playlist UI
- `data/catalogue.json` — prebuilt canonical song catalogue
- `data/catalogue.schema.json` — six-playlist catalogue contract
- `scripts/build_catalogue_v10.py` — canonical Greatest Hits builder
- `scripts/augment_playlists_v10.py` — verified themed-playlist augmentation
- `scripts/validate_catalogue.py` — final six-playlist/runtime validation

## Deployment

GitHub Pages deployment runs JavaScript and catalogue validation before publishing. A failed validation prevents deployment.
'''
    README.write_text(text, encoding='utf-8')


def main():
    data = json.loads(CATALOGUE.read_text(encoding='utf-8'))
    if data.get('version') != 10 or set(data.get('modes', {})) != {'greatest'}:
        raise RuntimeError('playlist augmentation must run immediately after the canonical single-mode v10 build')
    greatest = data['modes']['greatest']
    themed, rejected = build_themed_modes(greatest)

    data['version'] = 11
    data['generatedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    data['modes'] = {'greatest': greatest, **themed}
    data['modeMeta'] = {k: MODE_META[k] for k in ACTIVE}
    data['modeFallbacks'] = {k: 'greatest' for k in ACTIVE[1:]}
    data['coverage'] = {k: len(v) for k, v in data['modes'].items()}
    data['playlistStats'] = {k: {'years': len(v), 'songs': sum(len(p) for p in v.values()), 'rejectedSeeds': len(rejected[k])} for k, v in themed.items()}
    data['playlistRejectedSeeds'] = rejected
    sources = dict(data.get('sources') or {})
    for mode in ACTIVE[1:]:
        sources[mode] = 'Curated title/artist seeds verified with the same canonical underlying-song and MusicBrainz recording first-release-year rules as Greatest Hits; sparse years fall back to Greatest Hits for the identical card year.'
    data['sources'] = sources
    CATALOGUE.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    write_schema()
    write_engine_guard()
    patch_app()
    write_validator()
    write_engine_test()
    patch_versions()
    write_readme()
    print('Wrote six-playlist catalogue', data['playlistStats'], flush=True)


if __name__ == '__main__':
    main()
