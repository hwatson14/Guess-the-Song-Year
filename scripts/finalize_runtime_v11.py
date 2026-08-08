#!/usr/bin/env python3
"""Write the final six-mode runtime using the latest canonical repeat/version rules."""
import json
from pathlib import Path
from build_modes import MODE_META

ROOT=Path(__file__).resolve().parents[1]
ENGINE=ROOT/'engine-v7.js'
TEST=ROOT/'scripts'/'test_engine_v7.mjs'
ACTIVE=('greatest','sing_along','australian','unexpected','party','rock')


def main():
    meta=json.dumps({m:MODE_META[m] for m in ACTIVE},ensure_ascii=False,separators=(',',':'))
    ENGINE.write_text(f"""(() => {{
  'use strict';
  const E=window.GSYEngine;
  if(!E)throw new Error('GSYEngine must load before engine-v7.js');
  E.MODES={meta};

  // Version words matter only in metadata-like annotations/suffixes. Genuine titles such as
  // \"Live and Let Die\" and \"Dancing with a Stranger\" remain valid songs.
  const versionMarker=/\\b(karaoke|tribute|demo|live|remix|re[- ]?mix|mix|edit|version|recording|master|radio|single|album|vocal|acoustic|unplugged|a cappella|acapella|backing(?: track)?|instrumental|strumentale|base musicale|bootleg|mashup|refix|rework|preview|playback|deluxe|bonus|voice note|alternate|alternative|original|rehearsal|session|concert|remaster(?:ed)?(?:\\s*\\d{{4}})?|radio edit|radio version|single edit|single version|album version|extended(?: version| edit| mix)?|club mix|dance mix|original mix|dub(?: version| mix)?|mono|stereo|sped up|slowed|re[- ]?record(?:ed)?|music video|video version|solo vocal|take \\d+|pt\\.?\\s*\\d+|special disco version|clean version)\\b/i;
  const strongTrailingVersion=/\\b(remix|re[- ]?mix|remaster(?:ed)?(?:\\s*\\d{{4}})?|radio edit|radio version|single edit|single version|album version|extended(?: version| edit| mix)?|club mix|dance mix|original mix|dub(?: version| mix)?|acoustic(?: version)?|unplugged|live version|instrumental(?: version)?|a cappella|acapella|sped up|slowed|re[- ]?record(?:ed)?|refix|rework|voice note|alternate version|alternative version|clean version)\\s*$/i;
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
    s=s.replace(/\\(([^)]*)\\)/g,(whole,inside)=>versionMarker.test(inside)||/^\\s*(feat\\.?|ft\\.?|featuring|with)\\b/i.test(inside)?' ':whole);
    s=s.replace(/\\[([^\\]]*)\\]/g,(whole,inside)=>versionMarker.test(inside)||/^\\s*(feat\\.?|ft\\.?|featuring|with)\\b/i.test(inside)?' ':whole);
    s=s.replace(/\\s[-–—:]\\s([^\\n]+)$/,(whole,suffix)=>versionMarker.test(suffix)?' ':whole);
    // Bare \"with\" is often real title text; only explicit feature markers strip a suffix.
    s=s.replace(/\\s+(feat\\.?|ft\\.?|featuring)\\s+.+$/i,' ');
    if(strongTrailingVersion.test(s))s=s.replace(strongTrailingVersion,' ');
    return norm(s);
  }}
  function primaryArtist(v){{
    let s=String(v??'').trim();s=s.split(/\\s+(?:feat\\.?|ft\\.?|featuring|with)\\s+/i)[0];
    s=s.split(/\\s+(?:and|&)\\s+/i)[0];return norm(s).replace(/^the\\s+/,'');
  }}
  function underlyingKey(song){{if(song?.canonicalKey)return String(song.canonicalKey);return `${{baseTitle(song?.title)}}|${{primaryArtist(song?.artist)}}`}}
  function quality(song){{let n=0;if(song.spotifyId)n+=4;if(song.youtubeId)n+=2;if(!isAlternateTitle(song.title))n+=4;if(!malformedArtist.test(String(song.artist||'')))n+=2;if(Number(song.mbScore||0)>=70)n+=1;if(song.canonicalKey)n+=2;return n}}
  function dedupe(pool){{
    const ranked=[...pool].sort((a,b)=>quality(b)-quality(a));const out=[],songs=new Set(),spotify=new Set(),youtube=new Set();
    for(const song of ranked){{if(!song||!song.title||!song.artist||isAlternateTitle(song.title))continue;const canonical=underlyingKey(song),sp=String(song.spotifyId||''),yt=String(song.youtubeId||'');if(!canonical||songs.has(canonical)||(sp&&spotify.has(sp))||(yt&&youtube.has(yt)))continue;songs.add(canonical);if(sp)spotify.add(sp);if(yt)youtube.add(yt);out.push(song)}}
    return out;
  }}
  function poolFor(data,id,year){{
    let pool=(data?.modes?.[id]?.[String(year)]||[]).filter(song=>Number(song?.year)===Number(year));pool=dedupe(pool);
    const clean=pool.filter(song=>!isAlternateTitle(song.title)&&!malformedArtist.test(String(song.artist||'')));return clean.length?clean:pool;
  }}
  E.songUnderlyingKey=underlyingKey;E.songUseKey=underlyingKey;E.isAlternateSongTitle=isAlternateTitle;
  E.chooseSong=async function(year,modeId='greatest',usedKeys=[]){{
    const id=E.MODES?.[modeId]?modeId:'greatest',data=await E.loadCatalogue(),used=new Set(usedKeys||[]);
    const primary=poolFor(data,id,year);let available=primary.filter(song=>!used.has(underlyingKey(song)));
    if(!available.length&&id!=='greatest')available=poolFor(data,'greatest',year).filter(song=>!used.has(underlyingKey(song)));
    if(!available.length){{const hasAny=primary.length||(id!=='greatest'&&poolFor(data,'greatest',year).length);throw new E.AppError(hasAny?'NO_UNUSED_SONG':'NO_SONG',hasAny?`Every ${{year}} song available for this playlist has already been used.`:`No prebuilt song is available for ${{year}}.`)}}
    return {{...available[Math.floor(Math.random()*available.length)]}};
  }};
}})();
""",encoding='utf-8')

    TEST.write_text(r'''import fs from 'node:fs';
class AppError extends Error{constructor(code,message){super(message);this.code=code}}
const songs=[{title:'Alpha',artist:'Artist A',year:2000,canonicalKey:'alpha|artist a'},{title:'Alpha - 2011 Remaster',artist:'Artist A',year:2000},{title:'Alpha (Radio Edit)',artist:'Artist A feat. Guest',year:2000},{title:'Beta',artist:'Artist B',year:2000,canonicalKey:'beta|artist b'},{title:'Live and Let Die',artist:'Artist E',year:2000,canonicalKey:'live and let die|artist e'},{title:'Dancing with a Stranger',artist:'Artist G',year:2000,canonicalKey:'dancing with a stranger|artist g'}];
const data={modes:{greatest:{'2000':songs,'2001':[{title:'Fallback',artist:'Artist F',year:2001,canonicalKey:'fallback|artist f'}]},sing_along:{'2000':[{title:'Sing',artist:'Singer',year:2000,canonicalKey:'sing|singer'}]}}};
globalThis.window={GSYEngine:{MODES:{greatest:{name:'Greatest Hits'}},AppError,loadCatalogue:async()=>data}};eval(fs.readFileSync(new URL('../engine-v7.js',import.meta.url),'utf8'));const E=window.GSYEngine;
if(Object.keys(E.MODES).join(',')!=='greatest,sing_along,australian,unexpected,party,rock')throw new Error('mode set');
const k=E.songUseKey(songs[0]);if(E.songUseKey(songs[1])!==k||E.songUseKey(songs[2])!==k)throw new Error('version identity');
if(!E.isAlternateSongTitle('Alpha (Live)')||E.isAlternateSongTitle('Live and Let Die')||E.isAlternateSongTitle('I Want to Live')||E.isAlternateSongTitle('Dancing with a Stranger'))throw new Error('context version rule');
if(E.songUseKey({title:'Dancing with a Stranger',artist:'Artist G'})!=='dancing with a stranger|artist g')throw new Error('with title corrupted');
if((await E.chooseSong(2000,'sing_along',[])).title!=='Sing')throw new Error('theme primary');
if((await E.chooseSong(2001,'sing_along',[])).title!=='Fallback')throw new Error('same-year fallback');
if(E.songUseKey(await E.chooseSong(2000,'sing_along',['sing|singer']))==='sing|singer')throw new Error('repeat');
console.log('v11 playlist runtime tests passed');
''',encoding='utf-8')
    print('Wrote final six-mode runtime')

if __name__=='__main__':main()
