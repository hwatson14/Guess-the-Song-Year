#!/usr/bin/env python3
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def replace_once(path,old,new):
    p=ROOT/path;text=p.read_text(encoding='utf-8');count=text.count(old)
    if count!=1:raise SystemExit(f'{path}: expected one target, found {count}: {old[:100]!r}')
    p.write_text(text.replace(old,new,1),encoding='utf-8')

replace_once('engine-v7.js',
"  function underlyingKey(song){\n    if(song?.songId)return String(song.songId);",
"  function underlyingKey(song){\n    if(song?.screenWorkId&&song?.songId)return `${song.songId}/${song.screenWorkId}`;\n    if(song?.songId)return String(song.songId);")
replace_once('app.js',
"  function yearBasisLabel(report=modeReport()){return report.yearBasis==='chart'?'chart year':report.yearBasis==='screen'?'movie/show year':report.yearBasis==='original'?'original song year':'release year'}",
"  function yearBasisLabel(report=modeReport(),id=modeId()){return report.yearBasis==='chart'?'chart year':report.yearBasis==='screen'?'movie/show year':id==='remix_original_year'?'original song year':'release year'}")
replace_once('app.js',
"    const answerContext=song.screenWorkTitle?`${song.screenWorkType==='movie'?'Movie':'TV show'}: ${song.screenWorkTitle}`:song.playbackVariant==='remix'?`Played: ${song.remixTitle||song.title}${song.remixer?` · ${song.remixer} remix`:''}`:'';",
"    const answerContext=song.workTitle?`${song.workType==='movie'?'Movie':'TV show'}: ${song.workTitle}`:song.playedVersion?`Played: ${song.playedVersion}${song.remixer?` · ${song.remixer} remix`:''}`:'';")
replace_once('index.html','<script src="./app.js?v=7.6.2"></script>','<script src="./app.js?v=7.6.3"></script>')
print('Patched screen relationship identity and answer semantics.')
