#!/usr/bin/env python3
"""Build the v11 multi-playlist catalogue from a canonical v10 Greatest Hits base.

This file owns playlist curation, schema/runtime generation and the setup UI patch.
It deliberately does NOT rebuild Greatest Hits. Canonical song identity and answer-year
truth stay owned by build_catalogue_v10.py.
"""
import json
import re
import time
from pathlib import Path

import build_catalogue_v10 as canonical
from build_modes import MODE_META, SEEDS

ROOT=Path(__file__).resolve().parents[1]
CATALOGUE=ROOT/'data'/'catalogue.json'
SCHEMA=ROOT/'data'/'catalogue.schema.json'
ENGINE=ROOT/'engine.js'
ENGINE_V7=ROOT/'engine-v7.js'
APP=ROOT/'app.js'
INDEX=ROOT/'index.html'
README=ROOT/'README.md'
VALIDATOR=ROOT/'scripts'/'validate_catalogue.py'
ENGINE_TEST=ROOT/'scripts'/'test_engine_v7.mjs'
ACTIVE=('greatest','sing_along','australian','unexpected','party','rock')


def greatest_index(greatest):
    out={}
    for year,pool in greatest.items():
        for song in pool:
            key=song.get('canonicalKey') or canonical.underlying_key(song['title'],song['artist'])
            out[key]=(int(year),song)
    return out


def build_themed_modes(greatest):
    index=greatest_index(greatest)
    playback_exact,playback_underlying=canonical.bimmuda_lookup()
    modes={};rejected={}
    for mode in ACTIVE[1:]:
        buckets={};seen=set();misses=[]
        print('Playlist',MODE_META[mode]['name'],flush=True)
        for seed_title,seed_artist in SEEDS[mode]:
            if canonical.is_explicit_alternate_title(seed_title):
                misses.append(f'{seed_title} / {seed_artist} [alternate seed]')
                continue
            seed_key=canonical.underlying_key(seed_title,seed_artist)
            hit=index.get(seed_key)
            if hit:
                year,base=hit
                song=dict(base)
                song.update({
                    'year':year,
                    'canonicalKey':base.get('canonicalKey') or canonical.underlying_key(base['title'],base['artist']),
                    'source':f'curated-{mode}-from-canonical-greatest',
                    'sourceLabel':f'{MODE_META[mode]["name"]} · canonical earliest recording release {year}',
                    'playlist':mode,
                })
            else:
                evidence=canonical.confirm_release_year({'title':seed_title,'artist':seed_artist})
                if not evidence:
                    misses.append(f'{seed_title} / {seed_artist} [no canonical recording match]')
                    continue
                year=int(evidence['year'])
                if not 1950<=year<=2022:
                    misses.append(f'{seed_title} / {seed_artist} [release {year} outside game range]')
                    continue
                title,artist=canonical.canonical_display({'title':seed_title,'artist':seed_artist},evidence)
                key=canonical.underlying_key(title,artist)
                ids=playback_exact.get(canonical.song_key(title,artist)) or playback_underlying.get(key) or {}
                song={
                    'title':title,'artist':artist,'year':year,'canonicalKey':key,
                    'yearEvidence':'MusicBrainz recording earliest first-release-date',
                    'musicbrainzId':evidence['musicbrainzId'],
                    'musicbrainzMatchedTitle':evidence['musicbrainzMatchedTitle'],
                    'musicbrainzMatchedArtist':evidence['musicbrainzMatchedArtist'],
                    'mbScore':evidence['mbScore'],'titleSimilarity':evidence['titleSimilarity'],
                    'artistSimilarity':evidence['artistSimilarity'],
                    'source':f'curated-{mode}-recording-year-verified',
                    'sourceLabel':f'{MODE_META[mode]["name"]} · earliest recording release {year} verified',
                    'playlist':mode,'spotifyId':ids.get('spotifyId',''),'youtubeId':ids.get('youtubeId',''),
                }
            year=int(song['year']);key=song['canonicalKey'];dedupe=(year,key)
            if dedupe in seen:continue
            if canonical.is_explicit_alternate_title(song['title']):
                misses.append(f'{song["title"]} / {song["artist"]} [alternate canonical title]')
                continue
            seen.add(dedupe);buckets.setdefault(str(year),[]).append(song)
        modes[mode]=dict(sorted(buckets.items(),key=lambda x:int(x[0])))
        rejected[mode]=misses
        print(' ',len(buckets),'years',sum(len(v) for v in buckets.values()),'songs;',len(misses),'rejected seeds',flush=True)
    return modes,rejected


def write_schema():
    year='^(19[5-9][0-9]|20[0-2][0-9])$'
    schema={
        '$schema':'https://json-schema.org/draft/2020-12/schema',
        '$id':'https://hwatson14.github.io/Guess-the-Song-Year/data/catalogue.schema.json',
        'title':'Guess the Song Year prebuilt catalogue',
        'description':'Canonical song-year catalogue. Every song year must equal its containing card-year bucket. Themed playlists may be sparse and fall back only to Greatest Hits for the same year.',
        'type':'object','required':['version','modes','modeMeta','modeFallbacks'],
        'properties':{
            'version':{'const':11},'generatedAt':{'type':'string'},
            'years':{'type':'array','items':{'type':'integer'}},
            'modes':{'type':'object','required':list(ACTIVE),'properties':{m:{'$ref':'#/$defs/mode'} for m in ACTIVE},'additionalProperties':False},
            'modeMeta':{'type':'object'},
            'modeFallbacks':{'type':'object','required':list(ACTIVE[1:]),'properties':{m:{'const':'greatest'} for m in ACTIVE[1:]},'additionalProperties':False},
            'coverage':{'type':'object'},'sources':{'type':'object'},'poolStats':{'type':'object'},'playlistStats':{'type':'object'},
        },
        '$defs':{
            'mode':{'type':'object','patternProperties':{year:{'type':'array','minItems':1,'items':{'$ref':'#/$defs/song'}}},'additionalProperties':False},
            'song':{'type':'object','required':['title','artist','year','canonicalKey','yearEvidence'],'properties':{
                'title':{'type':'string','minLength':1},'artist':{'type':'string','minLength':1},
                'year':{'type':'integer','minimum':1950,'maximum':2022},'canonicalKey':{'type':'string','minLength':1},
                'yearEvidence':{'const':'MusicBrainz recording earliest first-release-date'},'spotifyId':{'type':'string'},'youtubeId':{'type':'string'},
                'source':{'type':'string'},'sourceLabel':{'type':'string'}},'additionalProperties':True},
        },
    }
    SCHEMA.write_text(json.dumps(schema,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def write_runtime():
    meta=json.dumps({m:MODE_META[m] for m in ACTIVE},ensure_ascii=False,separators=(',',':'))
    js=f"""(() => {{
  'use strict';
  const E=window.GSYEngine;
  if(!E)throw new Error('GSYEngine must load before engine-v7.js');
  E.MODES={meta};

  const versionMarker=/\\b(karaoke|tribute|demo|live|remix|re[- ]?mix|mix|acoustic|a cappella|acapella|backing(?: track)?|instrumental|bootleg|mashup|preview|playback|deluxe|remaster(?:ed)?(?:\\s*\\d{{4}})?|radio edit|radio version|single edit|single version|album version|extended(?: version| mix)?|club mix|dance mix|original mix|mono|stereo|sped up|slowed|re[- ]?record(?:ed)?|music video|video version|take \\d+|special disco version|clean version)\\b/i;
  const strongTrailingVersion=/\\b(remix|re[- ]?mix|remaster(?:ed)?(?:\\s*\\d{{4}})?|radio edit|radio version|single edit|single version|album version|extended version|club mix|dance mix|original mix|acoustic version|live version|instrumental version|sped up|slowed|re[- ]?record(?:ed)?|clean version)\\s*$/i;
  const malformedArtist=/[a-zà-ÿ][A-Z]/;
  function norm(v){{return String(v??'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim()}}
  function isAlternateTitle(v){{
    const s=String(v??'').trim();if(!s)return false;
    for(const m of s.matchAll(/\\(([^)]*)\\)|\\[([^\\]]*)\\]/g)){{if(versionMarker.test(m[1]??m[2]??''))return true}}
    const suffix=s.match(/\\s[-–—:]\\s(.+)$/);if(suffix&&versionMarker.test(suffix[1]))return true;
    return strongTrailingVersion.test(s);
  }}
  function baseTitle(v){{
    let s=String(v??'').trim();
    s=s.replace(/\\(([^)]*)\\)/g,(w,i)=>versionMarker.test(i)||/^\\s*(feat\\.?|ft\\.?|featuring|with)\\b/i.test(i)?' ':w);
    s=s.replace(/\\[([^\\]]*)\\]/g,(w,i)=>versionMarker.test(i)||/^\\s*(feat\\.?|ft\\.?|featuring|with)\\b/i.test(i)?' ':w);
    s=s.replace(/\\s[-–—:]\\s([^\\n]+)$/,(w,x)=>versionMarker.test(x)?' ':w);
    s=s.replace(/\\s+(feat\\.?|ft\\.?|featuring|with)\\s+.+$/i,' ');
    if(strongTrailingVersion.test(s))s=s.replace(strongTrailingVersion,' ');
    return norm(s);
  }}
  function primaryArtist(v){{let s=String(v??'').trim();s=s.split(/\\s+(?:feat\\.?|ft\\.?|featuring|with)\\s+/i)[0];s=s.split(/\\s+(?:and|&)\\s+/i)[0];return norm(s).replace(/^the\\s+/,'')}}
  function underlyingKey(song){{if(song?.canonicalKey)return String(song.canonicalKey);return `${{baseTitle(song?.title)}}|${{primaryArtist(song?.artist)}}`}}
  function quality(song){{let n=0;if(song.spotifyId)n+=4;if(song.youtubeId)n+=2;if(!isAlternateTitle(song.title))n+=4;if(!malformedArtist.test(String(song.artist||'')))n+=2;if(Number(song.mbScore||0)>=70)n+=1;if(song.canonicalKey)n+=2;return n}}
  function dedupe(pool){{
    const ranked=[...pool].sort((a,b)=>quality(b)-quality(a));const out=[],songs=new Set(),spotify=new Set(),youtube=new Set();
    for(const song of ranked){{if(!song||!song.title||!song.artist||isAlternateTitle(song.title))continue;const k=underlyingKey(song),sp=String(song.spotifyId||''),yt=String(song.youtubeId||'');if(!k||songs.has(k)||(sp&&spotify.has(sp))||(yt&&youtube.has(yt)))continue;songs.add(k);if(sp)spotify.add(sp);if(yt)youtube.add(yt);out.push(song)}}return out;
  }}
  function poolFor(data,id,year){{return dedupe((data?.modes?.[id]?.[String(year)]||[]).filter(s=>Number(s?.year)===Number(year))).filter(s=>!malformedArtist.test(String(s.artist||'')))}}
  E.songUnderlyingKey=underlyingKey;E.songUseKey=underlyingKey;E.isAlternateSongTitle=isAlternateTitle;
  E.chooseSong=async function(year,modeId='greatest',usedKeys=[]){{
    const id=E.MODES?.[modeId]?modeId:'greatest',data=await E.loadCatalogue(),used=new Set(usedKeys||[]);
    const primary=poolFor(data,id,year);let available=primary.filter(s=>!used.has(underlyingKey(s)));
    if(!available.length&&id!=='greatest')available=poolFor(data,'greatest',year).filter(s=>!used.has(underlyingKey(s)));
    if(!available.length){{const hasAny=primary.length||(id!=='greatest'&&poolFor(data,'greatest',year).length);throw new E.AppError(hasAny?'NO_UNUSED_SONG':'NO_SONG',hasAny?`Every ${{year}} song available for this playlist has already been used.`:`No prebuilt song is available for ${{year}}.`)}}
    return {{...available[Math.floor(Math.random()*available.length)]}};
  }};
}})();
"""
    ENGINE_V7.write_text(js,encoding='utf-8')


def patch_app():
    s=APP.read_text(encoding='utf-8')
    old="  const DEFAULT_CFG={playMode:'physical',teams:2,victory:'10'};\n  const MODE='greatest';"
    new="  const DEFAULT_CFG={playMode:'physical',teams:2,victory:'10',mode:'greatest'};"
    if old in s:s=s.replace(old,new)
    elif new not in s:raise RuntimeError('app config header changed')
    provider="  function providerReady(){return E.getProvider()==='youtube'||E.isSpotifyConnected()}\n"
    if 'function modeId()' not in s:
        if provider not in s:raise RuntimeError('providerReady patch point missing')
        s=s.replace(provider,provider+"  function modeId(){return match?.mode||cfg.mode||'greatest'}\n  function modeInfo(id=modeId()){return E.MODES?.[id]||E.MODES?.greatest||{name:'Greatest Hits',desc:''}}\n")
    normalize="    if(!['10','unlimited'].includes(cfg.victory))cfg.victory='10';\n"
    if "if(!E.MODES?.[cfg.mode])cfg.mode='greatest';" not in s:
        s=s.replace(normalize,normalize+"    if(!E.MODES?.[cfg.mode])cfg.mode='greatest';\n")
    s=s.replace('    match.mode=MODE;','    match.mode=E.MODES?.[match.mode]?match.mode:cfg.mode;')
    s=s.replace('<p class="subtitle">Greatest Hits. Pick how you want to play, then start.</p>','<p class="subtitle">${esc(modeInfo(cfg.mode).name)}. Pick how you want to play, then start.</p>')
    if 'data-mode="${id}"' not in s:
        setup='''      <div class="setup-grid">\n        <section class="card option-card">\n          <div class="option-head"><h3>1. Play style</h3>'''
        replacement='''      <div class="setup-grid">\n        <section class="card option-card">\n          <div class="option-head"><h3>1. Playlist</h3><span>${esc(modeInfo(cfg.mode).desc)}</span></div>\n          <div class="deck-options">${Object.entries(E.MODES||{}).map(([id,m])=>`<button class="deck-option ${cfg.mode===id?'on':''}" data-mode="${id}"><b>${esc(m.name)}</b><span>${esc(m.desc)}</span></button>`).join('')}</div>\n        </section>\n        <section class="card option-card">\n          <div class="option-head"><h3>2. Play style</h3>'''
        if setup not in s:raise RuntimeError('setup playlist patch point missing')
        s=s.replace(setup,replacement).replace('<h3>2. Teams</h3>','<h3>3. Teams</h3>').replace('<h3>3. Victory target</h3>','<h3>4. Victory target</h3>')
    bind="    root.querySelectorAll('[data-play]').forEach"
    if "root.querySelectorAll('[data-mode]')" not in s:s=s.replace(bind,"    root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{cfg.mode=b.dataset.mode;saveCfg();render()});\n"+bind)
    s=s.replace(' · Greatest Hits · ',' · ${esc(modeInfo(match.mode).name)} · ')
    s=s.replace('<p>Greatest Hits · ${providerName()}. The answer stays hidden.</p>','<p>${esc(modeInfo().name)} · ${providerName()}. The answer stays hidden.</p>')
    s=s.replace('mode:MODE','mode:cfg.mode',1)
    s=s.replace('E.chooseSong(year,MODE,excluded)','E.chooseSong(year,modeId(),excluded)')
    s=s.replace('mode:MODE','mode:modeId()')
    if "const MODE='greatest'" in s or 'mode:MODE' in s or 'chooseSong(year,MODE' in s:raise RuntimeError('hard-coded Greatest Hits remains')
    APP.write_text(s,encoding='utf-8')


def write_validator():
    code=r'''#!/usr/bin/env python3
import ast,json,re,sys
from collections import Counter
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
import build_catalogue_v10 as canonical
ACTIVE=('greatest','sing_along','australian','unexpected','party','rock')
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
  if len(g[str(year)])<max(12,counts.get(year,0)):fail(f'Greatest {year} too shallow')
 for mode in ACTIVE:
  for year,pool in modes[mode].items():
   seen=set()
   for s in pool:
    if int(s.get('year') or 0)!=int(year):fail(f'{mode}/{year} year mismatch')
    if s.get('yearEvidence')!='MusicBrainz recording earliest first-release-date':fail(f'{mode}/{year} weak year evidence')
    if canonical.is_explicit_alternate_title(s['title']):fail(f'{mode}/{year} alternate {s["title"]}')
    key=canonical.underlying_key(s['title'],s['artist'])
    if s.get('canonicalKey')!=key:fail(f'{mode}/{year} canonical key mismatch')
    if key in seen:fail(f'{mode}/{year} duplicate {key}')
    seen.add(key)
 for mode in ACTIVE[1:]:
  if d.get('modeFallbacks',{}).get(mode)!='greatest':fail(f'{mode} fallback')
  stats=d.get('playlistStats',{}).get(mode,{})
  if stats.get('years',0)<15 or stats.get('songs',0)<20:fail(f'{mode} too shallow: {stats}')
 app=(ROOT/'app.js').read_text();guard=(ROOT/'engine-v7.js').read_text()
 if 'data-mode=' not in app or 'function modeId()' not in app or "const MODE='greatest'" in app:fail('playlist UI/runtime not active')
 if 'E.isAlternateSongTitle=isAlternateTitle' not in guard:fail('context-aware runtime missing')
 print('v11 catalogue validated',d.get('playlistStats'))
if __name__=='__main__':main()
'''
    VALIDATOR.write_text(code,encoding='utf-8')


def write_engine_test():
    test=r'''import fs from 'node:fs';
class AppError extends Error{constructor(code,message){super(message);this.code=code}}
const songs=[{title:'Alpha',artist:'Artist A',year:2000,canonicalKey:'alpha|artist a'},{title:'Alpha - 2011 Remaster',artist:'Artist A',year:2000},{title:'Alpha (Radio Edit)',artist:'Artist A feat. Guest',year:2000},{title:'Beta',artist:'Artist B',year:2000,canonicalKey:'beta|artist b'},{title:'Live and Let Die',artist:'Artist E',year:2000,canonicalKey:'live and let die|artist e'}];
const data={modes:{greatest:{'2000':songs,'2001':[{title:'Fallback',artist:'Artist F',year:2001,canonicalKey:'fallback|artist f'}]},sing_along:{'2000':[{title:'Sing',artist:'Singer',year:2000,canonicalKey:'sing|singer'}]}}};
globalThis.window={GSYEngine:{MODES:{greatest:{name:'Greatest Hits'}},AppError,loadCatalogue:async()=>data}};eval(fs.readFileSync(new URL('../engine-v7.js',import.meta.url),'utf8'));const E=window.GSYEngine;
if(Object.keys(E.MODES).join(',')!=='greatest,sing_along,australian,unexpected,party,rock')throw new Error('mode set');
const k=E.songUseKey(songs[0]);if(E.songUseKey(songs[1])!==k||E.songUseKey(songs[2])!==k)throw new Error('version identity');
if(!E.isAlternateSongTitle('Alpha (Live)')||E.isAlternateSongTitle('Live and Let Die')||E.isAlternateSongTitle('I Want to Live'))throw new Error('context version rule');
if((await E.chooseSong(2000,'sing_along',[])).title!=='Sing')throw new Error('theme primary');
if((await E.chooseSong(2001,'sing_along',[])).title!=='Fallback')throw new Error('same-year fallback');
if(E.songUseKey(await E.chooseSong(2000,'sing_along',['sing|singer']))==='sing|singer')throw new Error('repeat');
console.log('v11 playlist runtime tests passed');
'''
    ENGINE_TEST.write_text(test,encoding='utf-8')


def patch_versions():
    s=ENGINE.read_text(encoding='utf-8');s=re.sub(r'\./data/catalogue\.json\?v=\d+(?:\.\d+)*','./data/catalogue.json?v=11',s);ENGINE.write_text(s,encoding='utf-8')
    h=INDEX.read_text(encoding='utf-8')
    for asset in ('app.css','engine.js','engine-v7.js','app.js'):h=re.sub(rf'{re.escape(asset)}\?v=[^"\']+',f'{asset}?v=8.0.0',h)
    INDEX.write_text(h,encoding='utf-8')


def write_readme():
    README.write_text('''# Guess the Song Year\n\nPrivate music timeline game using the existing 308-card QR deck or a fully virtual deck.\n\n## Playlists\n\n- **Greatest Hits** — deep canonical Billboard-ranked pool for every card year\n- **Sing Along** — huge choruses, karaoke staples and songs everyone joins in on\n- **Australian** — Australian artists and homegrown favourites\n- **Unexpected Years** — songs whose real release year is surprisingly early or late\n- **Party Anthems** — dancefloor, wedding and party staples\n- **Rock Classics** — big riffs, guitars and rock anthems\n\nThemed playlists are curated and may be sparse in a particular year. If that theme has no unused song for a scanned/dealt card year, the runtime falls back only to Greatest Hits for **the same year**. It never changes the card year to make a theme fit.\n\n## Core invariant\n\nFor every played card, `song.year == card year == containing catalogue year bucket`. Canonical year is the earliest verified MusicBrainz recording first-release-date. Alternate versions collapse to the same underlying-song identity and do not become extra answers.\n''',encoding='utf-8')


def main():
    data=json.loads(CATALOGUE.read_text(encoding='utf-8'))
    if data.get('version')!=10 or set(data.get('modes',{}))!={'greatest'}:raise RuntimeError('v11 playlists require canonical single-mode v10 base')
    greatest=data['modes']['greatest'];themed,rejected=build_themed_modes(greatest)
    data['version']=11;data['generatedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
    data['modes']={'greatest':greatest,**themed};data['modeMeta']={m:MODE_META[m] for m in ACTIVE};data['modeFallbacks']={m:'greatest' for m in ACTIVE[1:]}
    data['coverage']={m:len(v) for m,v in data['modes'].items()};data['playlistStats']={m:{'years':len(v),'songs':sum(len(p) for p in v.values()),'rejectedSeeds':len(rejected[m])} for m,v in themed.items()};data['playlistRejectedSeeds']=rejected
    sources=dict(data.get('sources') or {})
    for m in ACTIVE[1:]:sources[m]='Curated title/artist seeds verified with the same canonical underlying-song and MusicBrainz recording first-release-year rules as Greatest Hits; sparse years fall back to Greatest Hits for the identical card year.'
    data['sources']=sources;CATALOGUE.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    write_schema();write_runtime();patch_app();write_validator();write_engine_test();patch_versions();write_readme()
    print('Wrote v11 playlists',data['playlistStats'],flush=True)

if __name__=='__main__':main()
