#!/usr/bin/env python3
"""Assemble a v11 six-playlist catalogue from two independently verified inputs.

Inputs:
- data/catalogue.json: canonical v10 Greatest Hits base
- data/themed_playlists_v11.json: strict release-group verified themed songs

This separation prevents weak recording-search dates from contaminating the curated
playlists. Themed modes fall back only to Greatest Hits for the same card year.
"""
import json
import re
import time
from pathlib import Path

import build_catalogue_v10 as canonical
import build_playlists_v11 as ui
from build_modes import MODE_META

ROOT=Path(__file__).resolve().parents[1]
CATALOGUE=ROOT/'data'/'catalogue.json'
THEMES=ROOT/'data'/'themed_playlists_v11.json'
SCHEMA=ROOT/'data'/'catalogue.schema.json'
VALIDATOR=ROOT/'scripts'/'validate_catalogue.py'
README=ROOT/'README.md'
ACTIVE=('greatest','sing_along','australian','unexpected','party','rock')
THEMED=ACTIVE[1:]


def write_schema():
    year='^(19[5-9][0-9]|20[0-2][0-9])$'
    schema={
      '$schema':'https://json-schema.org/draft/2020-12/schema',
      '$id':'https://hwatson14.github.io/Guess-the-Song-Year/data/catalogue.schema.json',
      'title':'Guess the Song Year prebuilt catalogue',
      'description':'Six-playlist catalogue. Every song year must equal its containing card-year bucket. Themed modes use strict release-group year evidence and may fall back only to Greatest Hits for the same year.',
      'type':'object','required':['version','modes','modeMeta','modeFallbacks'],
      'properties':{
        'version':{'const':11},'generatedAt':{'type':'string'},'years':{'type':'array','items':{'type':'integer'}},
        'modes':{'type':'object','required':list(ACTIVE),'properties':{m:{'$ref':'#/$defs/mode'} for m in ACTIVE},'additionalProperties':False},
        'modeMeta':{'type':'object'},
        'modeFallbacks':{'type':'object','required':list(THEMED),'properties':{m:{'const':'greatest'} for m in THEMED},'additionalProperties':False},
        'coverage':{'type':'object'},'sources':{'type':'object'},'poolStats':{'type':'object'},'playlistStats':{'type':'object'},
      },
      '$defs':{
        'mode':{'type':'object','patternProperties':{year:{'type':'array','minItems':1,'items':{'$ref':'#/$defs/song'}}},'additionalProperties':False},
        'song':{'type':'object','required':['title','artist','year','canonicalKey','yearEvidence'],'properties':{
          'title':{'type':'string','minLength':1},'artist':{'type':'string','minLength':1},
          'year':{'type':'integer','minimum':1950,'maximum':2022},'canonicalKey':{'type':'string','minLength':1},
          'yearEvidence':{'enum':['MusicBrainz recording earliest first-release-date','MusicBrainz release-group earliest first-release-date']},
          'spotifyId':{'type':'string'},'youtubeId':{'type':'string'},'source':{'type':'string'},'sourceLabel':{'type':'string'}},
          'additionalProperties':True},
      },
    }
    SCHEMA.write_text(json.dumps(schema,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def write_validator():
    code=r'''#!/usr/bin/env python3
import ast,json,re,sys
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
import build_catalogue_v10 as c
ACTIVE=('greatest','sing_along','australian','unexpected','party','rock');THEMED=ACTIVE[1:]
def fail(m):raise SystemExit('catalogue validation failed: '+m)
def year_map():
 t=(ROOT/'engine.js').read_text();m=re.search(r'const YEAR_MAP=(\[[^;]+\]);',t)
 if not m:fail('YEAR_MAP missing')
 return ast.literal_eval(re.sub(r'\bnull\b','None',m.group(1)))
def main():
 d=json.loads((ROOT/'data'/'catalogue.json').read_text());modes=d.get('modes',{})
 if d.get('version')!=11:fail(f'version {d.get("version")}')
 if set(modes)!=set(ACTIVE):fail(f'modes {sorted(modes)}')
 cards=year_map()[1:];counts=Counter(int(y) for y in cards if y);g=modes['greatest']
 if set(map(int,g))!=set(range(1950,2023)):fail('Greatest year coverage incomplete')
 for year in range(1950,2023):
  pool=g[str(year)]
  if len(pool)<max(12,counts.get(year,0)):fail(f'Greatest {year} too shallow')
  seen=set();titles=set()
  for s in pool:
   if int(s.get('year') or 0)!=year:fail(f'greatest/{year} year mismatch')
   if s.get('yearEvidence')!='MusicBrainz recording earliest first-release-date':fail(f'greatest/{year} evidence mismatch')
   if c.is_explicit_alternate_title(s['title']):fail(f'greatest/{year} alternate {s["title"]}')
   key=c.underlying_key(s['title'],s['artist']);title=c.norm(c.base_title(s['title']))
   if s.get('canonicalKey')!=key:fail(f'greatest/{year} key mismatch')
   if key in seen or title in titles:fail(f'greatest/{year} duplicate song/title')
   seen.add(key);titles.add(title)
 for mode in THEMED:
  if d.get('modeFallbacks',{}).get(mode)!='greatest':fail(f'{mode} fallback')
  stats=d.get('playlistStats',{}).get(mode,{})
  if stats.get('years',0)<15 or stats.get('songs',0)<20:fail(f'{mode} too shallow {stats}')
  seen=set()
  for year,pool in modes[mode].items():
   titles=set()
   for s in pool:
    if int(s.get('year') or 0)!=int(year):fail(f'{mode}/{year} year mismatch')
    if s.get('yearEvidence')!='MusicBrainz release-group earliest first-release-date':fail(f'{mode}/{year} evidence mismatch')
    if c.is_explicit_alternate_title(s['title']):fail(f'{mode}/{year} alternate {s["title"]}')
    key=c.underlying_key(s['title'],s['artist']);title=c.norm(c.base_title(s['title']))
    if s.get('canonicalKey')!=key:fail(f'{mode}/{year} key mismatch')
    if key in seen or title in titles:fail(f'{mode}/{year} duplicate song/title')
    seen.add(key);titles.add(title)
 app=(ROOT/'app.js').read_text();guard=(ROOT/'engine-v7.js').read_text()
 if 'data-mode=' not in app or 'function modeId()' not in app or "const MODE='greatest'" in app:fail('playlist UI not active')
 if 'E.isAlternateSongTitle=isAlternateTitle' not in guard:fail('context-aware runtime missing')
 print('v11 six-playlist catalogue validated',d.get('playlistStats'))
if __name__=='__main__':main()
'''
    VALIDATOR.write_text(code,encoding='utf-8')


def write_readme():
    README.write_text('''# Guess the Song Year\n\nPrivate music timeline game using the existing 308-card QR deck or a fully virtual deck.\n\n## Playlists\n\n- **Greatest Hits** — deep canonical pool for every card year\n- **Sing Along** — huge choruses, karaoke staples and songs everyone joins in on\n- **Australian** — Australian artists and homegrown favourites\n- **Unexpected Years** — songs whose actual first release year is surprising\n- **Party Anthems** — dancefloor, wedding and party staples\n- **Rock Classics** — big riffs, guitars and rock anthems\n\nThemed playlists are deliberately conservative. A curated song is included only when MusicBrainz has an exact-title, matching-artist release group with a dated earliest release. Ambiguous seeds are omitted rather than guessed. If a theme has no unused song for a card year, runtime falls back only to Greatest Hits for that **same year**.\n\n## Year contract\n\nFor every played card, `song.year == card year == containing catalogue year bucket`. Greatest Hits retains its canonical v10 evidence contract. The five themed playlists use `MusicBrainz release-group earliest first-release-date`. Alternate versions collapse to the same underlying-song identity and never become extra answers.\n''',encoding='utf-8')


def main():
    base=json.loads(CATALOGUE.read_text(encoding='utf-8'))
    themes=json.loads(THEMES.read_text(encoding='utf-8'))
    if base.get('version')!=10 or set(base.get('modes',{}))!={'greatest'}:
        raise RuntimeError('assembly requires canonical single-mode v10 catalogue')
    if set(themes.get('modes',{}))!=set(THEMED):
        raise RuntimeError('strict themed playlist file is incomplete')
    for mode,pools in themes['modes'].items():
        for year,pool in pools.items():
            for s in pool:
                if s.get('yearEvidence')!='MusicBrainz release-group earliest first-release-date' or int(s['year'])!=int(year):
                    raise RuntimeError(f'unverified themed song: {mode}/{year}/{s.get("title")}')

    base['version']=11;base['generatedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
    base['modes']={'greatest':base['modes']['greatest'],**themes['modes']}
    base['modeMeta']={m:MODE_META[m] for m in ACTIVE};base['modeFallbacks']={m:'greatest' for m in THEMED}
    base['coverage']={m:len(v) for m,v in base['modes'].items()};base['playlistStats']=themes['stats'];base['playlistRejectedSeeds']=themes.get('rejectedSeeds',{})
    sources=dict(base.get('sources') or {})
    for m in THEMED:sources[m]='Curated exact-title/matching-artist MusicBrainz release groups; earliest dated release group defines the answer year; ambiguous seeds omitted; same-year Greatest Hits fallback.'
    base['sources']=sources
    CATALOGUE.write_text(json.dumps(base,ensure_ascii=False,separators=(',',':')),encoding='utf-8')

    ui.write_runtime();ui.patch_app();ui.write_engine_test();ui.patch_versions()
    write_schema();write_validator();write_readme()
    print('Assembled v11',base['playlistStats'],flush=True)

if __name__=='__main__':main()
