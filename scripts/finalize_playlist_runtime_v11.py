#!/usr/bin/env python3
"""Write the final v11 multi-playlist runtime while preserving context-aware version identity."""
import json
from pathlib import Path

from build_modes import MODE_META

ROOT=Path(__file__).resolve().parents[1]
ENGINE_V7=ROOT/'engine-v7.js'
ENGINE_TEST=ROOT/'scripts'/'test_engine_v7.mjs'
ACTIVE=('greatest','sing_along','australian','unexpected','party','rock')


def write_engine():
    meta=json.dumps({k:MODE_META[k] for k in ACTIVE},ensure_ascii=False,separators=(',',':'))
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
    const s=String(v??'').trim();
    if(!s)return false;
    for(const m of s.matchAll(/\\(([^)]*)\\)|\\[([^\\]]*)\\]/g)){{if(versionMarker.test(m[1]??m[2]??''))return true}}
    const suffix=s.match(/\\s[-–—:]\\s(.+)$/);
    if(suffix&&versionMarker.test(suffix[1]))return true;
    return strongTrailingVersion.test(s);
  }}
  function baseTitle(v){{
    let s=String(v??'').trim();
    s=s.replace(/\\(([^)]*)\\)/g,(whole,inside)=>versionMarker.test(inside)||/^\\s*(feat\\.?|ft\\.?|featuring|with)\\b/i.test(inside)?' ':whole);
    s=s.replace(/\\[([^\\]]*)\\]/g,(whole,inside)=>versionMarker.test(inside)||/^\\s*(feat\\.?|ft\\.?|featuring|with)\\b/i.test(inside)?' ':whole);
    s=s.replace(/\\s[-–—:]\\s([^\\n]+)$/,(whole,suffix)=>versionMarker.test(suffix)?' ':whole);
    s=s.replace(/\\s+(feat\\.?|ft\\.?|featuring|with)\\s+.+$/i,' ');
    if(strongTrailingVersion.test(s))s=s.replace(strongTrailingVersion,' ');
    return norm(s);
  }}
  function primaryArtist(v){{
    let s=String(v??'').trim();
    s=s.split(/\\s+(?:feat\\.?|ft\\.?|featuring|with)\\s+/i)[0];
    s=s.split(/\\s+(?:and|&)\\s+/i)[0];
    return norm(s).replace(/^the\\s+/,'');
  }}
  function underlyingKey(song){{if(song?.canonicalKey)return String(song.canonicalKey);return `${{baseTitle(song?.title)}}|${{primaryArtist(song?.artist)}}`}}
  function quality(song){{let n=0;if(song.spotifyId)n+=4;if(song.youtubeId)n+=2;if(!isAlternateTitle(song.title))n+=4;if(!malformedArtist.test(String(song.artist||'')))n+=2;if(Number(song.mbScore||0)>=70)n+=1;if(song.canonicalKey)n+=2;return n}}
  function dedupe(pool){{
    const ranked=[...pool].sort((a,b)=>quality(b)-quality(a));
    const out=[],songs=new Set(),spotify=new Set(),youtube=new Set();
    for(const song of ranked){{
      if(!song||!song.title||!song.artist||isAlternateTitle(song.title))continue;
      const canonical=underlyingKey(song),sp=String(song.spotifyId||''),yt=String(song.youtubeId||'');
      if(!canonical||songs.has(canonical)||(sp&&spotify.has(sp))||(yt&&youtube.has(yt)))continue;
      songs.add(canonical);if(sp)spotify.add(sp);if(yt)youtube.add(yt);out.push(song);
    }}
    return out;
  }}
  function poolFor(data,id,year){{
    let pool=(data?.modes?.[id]?.[String(year)]||[]).filter(song=>Number(song?.year)===Number(year));
    pool=dedupe(pool);
    const clean=pool.filter(song=>!isAlternateTitle(song.title)&&!malformedArtist.test(String(song.artist||'')));
    return clean.length?clean:pool;
  }}

  E.songUnderlyingKey=underlyingKey;
  E.songUseKey=underlyingKey;
  E.isAlternateSongTitle=isAlternateTitle;
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
    ENGINE_V7.write_text(js,encoding='utf-8')


def write_test():
    test=r'''import fs from 'node:fs';
class AppError extends Error{constructor(code,message){super(message);this.code=code}}
const songs=[
 {title:'Alpha',artist:'Artist A',year:2000,canonicalKey:'alpha|artist a'},
 {title:'Alpha - 2011 Remaster',artist:'Artist A',year:2000},
 {title:'Alpha (Radio Edit)',artist:'Artist A feat. Guest',year:2000},
 {title:'Beta',artist:'Artist B',year:2000,canonicalKey:'beta|artist b'},
 {title:'Gamma',artist:'Artist C',year:2000,canonicalKey:'gamma|artist c'},
 {title:'Delta (feat. Guest)',artist:'Artist D',year:2000,canonicalKey:'delta|artist d'},
 {title:'Delta',artist:'Artist D and Guest',year:2000},
 {title:'Live and Let Die',artist:'Artist E',year:2000,canonicalKey:'live and let die|artist e'},
];
const data={modes:{
 greatest:{'2000':songs,'2001':[{title:'Fallback',artist:'Artist F',year:2001,canonicalKey:'fallback|artist f'}]},
 sing_along:{'2000':[{title:'Sing',artist:'Singer',year:2000,canonicalKey:'sing|singer'}]},
}};
globalThis.window={GSYEngine:{MODES:{greatest:{name:'Greatest Hits'}},AppError,loadCatalogue:async()=>data}};
eval(fs.readFileSync(new URL('../engine-v7.js',import.meta.url),'utf8'));
const E=window.GSYEngine;
if(Object.keys(E.MODES).join(',')!=='greatest,sing_along,australian,unexpected,party,rock')throw new Error('playlist mode set wrong');
const alphaKey=E.songUseKey(songs[0]);
if(alphaKey!=='alpha|artist a')throw new Error(`unexpected Alpha key ${alphaKey}`);
if(E.songUseKey(songs[1])!==alphaKey)throw new Error('remaster must collapse to original');
if(E.songUseKey(songs[2])!==alphaKey)throw new Error('radio edit must collapse to original');
if(E.songUseKey(songs[5])!==E.songUseKey(songs[6]))throw new Error('featured variants must collapse');
if(!E.isAlternateSongTitle('Alpha (Live)'))throw new Error('annotated live version must be recognised');
if(!E.isAlternateSongTitle('Alpha - Radio Edit'))throw new Error('radio edit suffix must be recognised');
if(E.isAlternateSongTitle('Live and Let Die'))throw new Error('genuine title containing Live must not be rejected');
if(E.isAlternateSongTitle('I Want to Live'))throw new Error('genuine title ending in live must not be rejected');
if((await E.chooseSong(2000,'sing_along',[])).title!=='Sing')throw new Error('theme primary pool not used');
const fallback=await E.chooseSong(2001,'sing_along',[]);
if(fallback.title!=='Fallback')throw new Error('same-year Greatest fallback failed');
const afterThemeUsed=await E.chooseSong(2000,'sing_along',['sing|singer']);
if(E.songUseKey(afterThemeUsed)==='sing|singer')throw new Error('used theme song repeated');
for(let i=0;i<40;i++){
 const picked=await E.chooseSong(2000,'greatest',[alphaKey]);
 if(E.songUseKey(picked)===alphaKey)throw new Error('used underlying song selected through alternate version');
}
const allUsed=['sing|singer',...new Set(songs.map(s=>E.songUseKey(s)))];
let exhausted=false;
try{await E.chooseSong(2000,'sing_along',allUsed)}catch(err){exhausted=err?.code==='NO_UNUSED_SONG'}
if(!exhausted)throw new Error('depleted theme+fallback must throw NO_UNUSED_SONG');
console.log('playlist runtime + canonical identity tests passed');
'''
    ENGINE_TEST.write_text(test,encoding='utf-8')


def main():
    write_engine();write_test();print('Wrote context-aware v11 playlist runtime')

if __name__=='__main__':main()
