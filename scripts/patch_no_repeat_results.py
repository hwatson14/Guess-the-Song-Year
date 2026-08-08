from pathlib import Path
import json, re

ROOT=Path(__file__).resolve().parents[1]

# ---------- engine-v7: strict, uniform, game-wide no-repeat selection ----------
engine = r'''(() => {
  'use strict';

  const E=window.GSYEngine;
  if(!E)throw new Error('GSYEngine must load before engine-v7.js');

  const greatest=E.MODES?.greatest||{name:'Greatest Hits',short:'Hits',desc:'Big recognisable songs from the same year.'};
  E.MODES={greatest};

  const variant=/\b(karaoke|tribute|cover|live|remix|mix|acoustic|a cappella|acapella|backing|instrumental|bootleg|mashup|preview|playback|deluxe|radio edit|single edit|single version|album version|music video|video|take \d+|third recording|special disco version)\b/i;
  const malformedArtist=/[a-zà-ÿ][A-Z]/;

  function useKey(song){
    return String(song?.spotifyId||song?.youtubeId||E.songKey(song));
  }

  function quality(song){
    let n=0;
    if(song.spotifyId)n+=4;
    if(song.youtubeId)n+=2;
    if(!variant.test(String(song.title||'')))n+=3;
    if(!malformedArtist.test(String(song.artist||'')))n+=2;
    if(Number(song.mbScore||0)>=70)n+=1;
    return n;
  }

  function dedupe(pool){
    const ranked=[...pool].sort((a,b)=>quality(b)-quality(a));
    const out=[],seen=new Set();
    for(const song of ranked){
      if(!song||!song.title||!song.artist)continue;
      const key=useKey(song);
      if(seen.has(key))continue;
      seen.add(key);out.push(song);
    }
    return out;
  }

  E.songUseKey=useKey;
  E.chooseSong=async function(year,modeId='greatest',usedKeys=[]){
    if(modeId!=='greatest')throw new E.AppError('MODE_DISABLED','Only Greatest Hits is enabled in this version.');
    const data=await E.loadCatalogue();
    let pool=(data?.modes?.greatest?.[String(year)]||[]).filter(song=>Number(song?.year)===Number(year));
    pool=dedupe(pool);
    if(!pool.length)throw new E.AppError('NO_SONG',`No prebuilt Greatest Hits song is available for ${year}.`);

    const clean=pool.filter(song=>!variant.test(String(song.title||''))&&!malformedArtist.test(String(song.artist||'')));
    if(clean.length)pool=clean;

    const used=new Set(usedKeys||[]);
    const available=pool.filter(song=>!used.has(useKey(song))&&!used.has(E.songKey(song)));
    if(!available.length)throw new E.AppError('NO_UNUSED_SONG',`Every ${year} song in this game has already been used. Scan or deal a new card.`);

    return {...available[Math.floor(Math.random()*available.length)]};
  };
})();
'''
(ROOT/'engine-v7.js').write_text(engine)

# ---------- app gameplay ----------
p=ROOT/'app.js'; s=p.read_text()

def rep(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'missing {label}')
    s=s.replace(old,new,1)

def sub(pattern,replacement,label):
    global s
    n=re.subn(pattern,replacement,s,count=1,flags=re.S)
    if n[1]!=1:
        raise SystemExit(f'missing/duplicate {label}: {n[1]}')
    s=n[0]

rep("function activeTeam(){return match?.teams?.[match.turn]||{name:'Team 1',score:0,timeline:[]}}",
    "function activeTeam(){return match?.teams?.[match.turn]||{name:'Team 1',score:0,correct:0,wrong:0,timeline:[]}}",
    'activeTeam fallback')

rep("    match.used=Array.isArray(match.used)?match.used:[];\n    match.assign=match.assign&&typeof match.assign==='object'?match.assign:{};",
    "    match.used=Array.isArray(match.used)?match.used:[];\n    match.history=Array.isArray(match.history)?match.history:[];\n    for(const team of match.teams||[]){team.correct=Number(team.correct)||Number(team.score)||0;team.wrong=Number(team.wrong)||0;team.timeline=Array.isArray(team.timeline)?team.timeline:[]}\n    delete match.assign;",
    'match migration')

sub(r"  function youtubeListeningScreen\(\)\{.*?\n  \}\n\n  function playingScreen", r'''  function youtubeListeningScreen(){
    const virtual=cfg.playMode==='virtual',replaceLabel=virtual?'Deal new card':'Scan new card';
    const copy=virtual?'Listen for as long as you want. Tap Guess now when you are ready to place the song.':'Listen for as long as you want. Tap Guess now when you are ready to reveal.';
    return `${topLine(false,false)}${matchHeader()}${scoreStrip()}<div class="youtube-listening"><div class="kicker">NOW PLAYING · PHONE DOWN</div><h1>Listen, then guess</h1><p>${copy}</p><div class="youtube-guess-actions"><button class="btn primary" data-action="guess-now">Guess now</button><button class="btn ghost" data-action="new-card">↻ ${replaceLabel}</button></div><div class="youtube-player"><div id="youtubePlayer"></div></div><button class="btn primary yt-start-fallback hidden" id="ytStartFallback" data-action="yt-start">Tap to start YouTube</button><small class="provider-warning">Recognised a recent repeat? Use ${replaceLabel}; the current team keeps its turn and the hidden year changes.</small></div>`;
  }

  function playingScreen''', 'youtube screen')

sub(r"  function playingScreen\(\)\{.*?\n  \}\n\n  function guessScreen", r'''  function playingScreen(){
    const virtual=cfg.playMode==='virtual';
    return `${topLine(true,false)}${matchHeader()}${scoreStrip()}<div class="kicker">NOW PLAYING</div><div class="wave-card"><button class="play-core" data-action="toggle-play">Ⅱ</button><div class="wave"></div></div>
      <div class="playing-instruction"><h2>${virtual?'Place it on your timeline':'Place the physical card on your timeline'}</h2><p>${virtual?'Choose the gap where you think this song belongs.':'Use the cards already on the table. No example years are shown here so the app cannot influence your guess.'}</p></div>
      ${virtual?virtualTimeline():`<div class="play-actions"><button class="btn ghost" data-action="replay">↻ Replay</button><button class="btn ghost" data-action="new-card">↻ Scan new card</button><button class="btn primary" data-action="guess-now">Guess now</button></div>`}`;
  }

  function guessScreen''', 'playing screen')

sub(r"  function guessScreen\(\)\{.*?\n  \}\n\n  function virtualTimeline", r'''  function guessScreen(){
    const virtual=cfg.playMode==='virtual';
    return `${topLine(true,false)}${matchHeader()}${scoreStrip()}<div class="kicker">MUSIC STOPPED</div><div class="guess-stage"><div class="guess-disc" aria-hidden="true"></div><h1>${virtual?'Place the song':'Make your guess'}</h1><p>${virtual?'Choose where the song belongs on your timeline.':'Place the physical card on your timeline, then reveal the answer.'}</p></div>
      ${virtual?virtualTimeline():`<div class="play-actions"><button class="btn ghost" data-action="listen-again">↻ Listen again</button><button class="btn ghost" data-action="new-card">↻ Scan new card</button><button class="btn primary" data-action="reveal">Reveal Answer</button></div>`}`;
  }

  function virtualTimeline''', 'guess screen')

rep("return `<div class=\"card\"><div class=\"timeline\">${html}</div><div class=\"timeline-note\">Starter year: <b>${Number.isFinite(starter)?starter:years[0]}</b> · Tap a + before, between or after the years.</div></div><div class=\"virtual-actions\"><button class=\"btn ghost\" data-action=\"listen-again\">↻ Listen Again</button><button class=\"btn primary\" data-action=\"lock-placement\" ${pendingSlot===null?'disabled':''}>Lock Placement</button></div>`;",
    "return `<div class=\"card\"><div class=\"timeline\">${html}</div><div class=\"timeline-note\">Starter year: <b>${Number.isFinite(starter)?starter:years[0]}</b> · Tap a + before, between or after the years.</div></div><div class=\"virtual-actions\"><button class=\"btn ghost\" data-action=\"listen-again\">↻ Listen Again</button><button class=\"btn ghost\" data-action=\"new-card\">↻ Deal new card</button><button class=\"btn primary\" data-action=\"lock-placement\" ${pendingSlot===null?'disabled':''}>Lock Placement</button></div>`;",
    'virtual replacement button')

sub(r"  function revealScreen\(\)\{.*?\n  \}\n\n  function gameOverScreen", r'''  function revealScreen(){
    const virtual=cfg.playMode==='virtual';
    const result=virtual?(placementResult?.correct?'Correct placement':'Wrong position'):'Mark the answer';
    const resultClass=virtual?(placementResult?.correct?'ok':'bad'):'';
    const source=current?.song?.sourceLabel||current?.song?.source||'Greatest Hits catalogue';
    return `${topLine(true,false)}${matchHeader()}${scoreStrip()}<h1 class="reveal-heading">Reveal</h1><div class="reveal-sub">Greatest Hits · ${esc(activeTeam().name)}</div>
      <section class="card answer-card"><div class="answer-top"><div class="answer-art"></div><div><div class="answer-song">${esc(current?.song?.title||'Unknown')}</div><div class="answer-artist">${esc(current?.song?.artist||'')}</div></div></div><div class="answer-year">${current?.year||'----'}</div><div class="result-badge ${resultClass}">${esc(result)}</div></section>
      <div class="card reveal-help">${virtual?(placementResult?.correct?`It fits at that point in ${esc(activeTeam().name)}’s timeline. The card has been added.`:`It does not fit between those neighbouring years, so the card is discarded.`):`Did ${esc(activeTeam().name)} place the card correctly? Mark the result below.`}</div>
      <div class="reveal-actions">${virtual?'':`<button class="btn ghost" data-action="wrong-answer">✕ Wrong answer</button><button class="btn primary" data-action="correct-answer">✓ Correct answer</button>`}${virtual?'<button class="btn primary" data-action="next-turn">Next Team</button>':''}<button class="btn text" data-action="open-track">Open song in ${current?.provider==='spotify'?'Spotify':'YouTube'}</button></div><div class="source-note">Catalogue source: ${esc(source)}</div>`;
  }

  function gameOverScreen''', 'reveal screen')

rep("      if(a==='guess-now')b.onclick=guessNow;",
    "      if(a==='guess-now')b.onclick=guessNow;\n      if(a==='new-card')b.onclick=newCardForRepeat;",
    'new card binding')
rep("      if(a==='keep')b.onclick=()=>finishPhysical(true);\n      if(a==='discard')b.onclick=()=>finishPhysical(false);",
    "      if(a==='correct-answer')b.onclick=()=>finishPhysical(true);\n      if(a==='wrong-answer')b.onclick=()=>finishPhysical(false);",
    'physical result bindings')

# New match schema: no permanent card->song assignment.
sub(r"    match=\{active:true,id:`g\$\{Date\.now\(\)\}`,mode:MODE,phase:'between',round:0,turn:0,teams:Array\.from\(\{length:cfg\.teams\},\(_,i\)=>\(\{name:`Team \$\{i\+1\}`,score:0,timeline:\[\],starterYear:null,starterCardId:null\}\)\),used:\[\],assign:\{\},virtualDeck:",
    "    match={active:true,id:`g${Date.now()}`,mode:MODE,phase:'between',round:0,turn:0,teams:Array.from({length:cfg.teams},(_,i)=>({name:`Team ${i+1}`,score:0,correct:0,wrong:0,timeline:[],starterYear:null,starterCardId:null})),used:[],history:[],virtualDeck:",
    'start match schema')

# Fresh random song from the unused year pool on every card. No persistent match.assign.
sub(r"  async function prepareCard\(cardId\)\{.*?\n  \}\n\n  async function loadQr", r'''  async function prepareCard(cardId){
    const seq=++prepareSeq;
    const year=E.cardYear(cardId);if(!year){toast('That card has no year mapping.');return nextRound()}
    match.phase='loading';saveMatch();screen='loading';render();
    const excluded=[...(match.used||[])];let lastErr=null;
    for(let attempt=0;attempt<5;attempt++){
      let song=null;
      try{
        song=await E.chooseSong(year,MODE,excluded);
        const resolved=await E.resolveSong(song,E.getProvider());
        if(seq!==prepareSeq)return;
        current={cardId,year,song,resolved,provider:E.getProvider(),mode:MODE};
        match.current=current;match.placementResult=null;
        if(cfg.playMode==='physical'){
          saveMatch();
          if(current.provider==='spotify'){await startSpotifyListening();return}
          beginMusicCountdown();return;
        }
        match.phase='ready';saveMatch();screen='ready';render();return;
      }catch(err){
        lastErr=err;
        if(song){const k=E.songUseKey?.(song)||E.songKey(song);if(!excluded.includes(k))excluded.push(k)}
        const retryable=['SPOTIFY_TRACK_NOT_FOUND','YOUTUBE_VIDEO_NOT_FOUND','YOUTUBE_PLAY_FAILED'].includes(err?.code);
        if(retryable)continue;
        break;
      }
    }
    if(seq!==prepareSeq)return;
    if(lastErr?.code==='NO_UNUSED_SONG'){
      toast(`${year} has no unused songs left in this game. ${cfg.playMode==='physical'?'Scan':'Deal'} a new card.`);
      setTimeout(()=>{if(seq!==prepareSeq)return;if(cfg.playMode==='physical'){match.phase='scanner';match.current=null;saveMatch();screen='scanner';render()}else nextRound()},900);return;
    }
    toast(errorText(lastErr));
    if(['NO_SPOTIFY_DEVICE','SPOTIFY_NOT_CONNECTED','SPOTIFY_REAUTH'].includes(lastErr?.code)){musicModal=true;screen='resume';render();return}
    if(cfg.playMode==='physical'){setTimeout(()=>{if(seq!==prepareSeq)return;match.phase='scanner';saveMatch();screen='scanner';render()},1200)}
    else setTimeout(()=>{if(seq===prepareSeq)nextRound()},1200);
  }

  async function loadQr''', 'prepareCard')

# Mark a song used when playback actually starts, not only after reveal.
rep("      await E.playSpotify(current.resolved.uri);playing=true;playNeedsTap=false",
    "      await E.playSpotify(current.resolved.uri);playing=true;playNeedsTap=false;recordSongUsed()",
    'spotify used marking')
rep("      playing=!!r.started;playNeedsTap=!!r.needsTap;",
    "      playing=!!r.started;playNeedsTap=!!r.needsTap;if(playing)recordSongUsed();",
    'youtube used marking')
rep("      E.resumeYouTube();playing=true;playNeedsTap=false;",
    "      E.resumeYouTube();playing=true;playNeedsTap=false;recordSongUsed();",
    'youtube tap used marking')

# Playback-failure replacement remains same-year internally because the player never heard it.
sub(r"  async function replaceCurrentSong\(\)\{.*?\n  \}\n\n  async function togglePlay", r'''  async function replaceCurrentSong(){
    if(!current)return;
    const seq=++prepareSeq;
    const {cardId,year}=current,excluded=[...(match.used||[])];
    const failedKey=E.songUseKey?.(current.song)||E.songKey(current.song);if(!excluded.includes(failedKey))excluded.push(failedKey);
    E.destroyYouTube();playing=false;match.phase='loading';saveMatch();screen='loading';render();
    let lastErr=null;
    for(let attempt=0;attempt<4;attempt++){
      let song=null;
      try{
        song=await E.chooseSong(year,MODE,excluded);
        const resolved=await E.resolveSong(song,E.getProvider());
        if(seq!==prepareSeq)return;
        current={cardId,year,song,resolved,provider:E.getProvider(),mode:MODE};
        match.current=current;match.phase='ready';saveMatch();screen='ready';render();toast('A replacement track is ready.');return;
      }catch(err){lastErr=err;if(song){const k=E.songUseKey?.(song)||E.songKey(song);if(!excluded.includes(k))excluded.push(k)}}
    }
    if(seq!==prepareSeq)return;
    toast(errorText(lastErr)||'No alternative song could be prepared.');
    if(cfg.playMode==='physical'){match.phase='scanner';match.current=null;saveMatch();screen='scanner';render()}else nextRound();
  }

  async function togglePlay''', 'internal song replacement')

rep("  function recordSongUsed(){if(!current?.song)return;const key=E.songKey(current.song);if(!match.used.includes(key))match.used.push(key)}",
    "  function recordSongUsed(){if(!current?.song||!match)return;const key=E.songUseKey?.(current.song)||E.songKey(current.song);if(!match.used.includes(key)){match.used.push(key);saveMatch()}}",
    'recordSongUsed')

# Replace the scoring block with explicit outcomes + no-score replacement card.
sub(r"  function selectSlot\(slot\)\{.*?\n  function recordSongUsed\(\).*?\n  function finishPhysical\(keep\).*?\n  function finishVirtualTurn", r'''  function selectSlot(slot){
    if(cfg.playMode!=='virtual'||!current||!['playing','guess'].includes(screen))return;
    const years=[...(activeTeam().timeline||[])];
    if(!Number.isInteger(slot)||slot<0||slot>years.length){toast('That placement is not available.');return}
    pendingSlot=slot;match.pendingSlot=slot;saveMatch();
    root.querySelectorAll('[data-slot]').forEach(x=>{const on=Number(x.dataset.slot)===slot;x.classList.toggle('on',on);x.setAttribute('aria-pressed',on?'true':'false')});
    const lock=root.querySelector('[data-action="lock-placement"]');if(lock)lock.disabled=false;
  }
  function recordSongUsed(){if(!current?.song||!match)return;const key=E.songUseKey?.(current.song)||E.songKey(current.song);if(!match.used.includes(key)){match.used.push(key);saveMatch()}}
  function logOutcome(outcome,extra={}){if(!match)return;match.history=Array.isArray(match.history)?match.history:[];match.history.push({round:match.round,team:match.turn,teamName:activeTeam().name,cardId:current?.cardId||null,year:current?.year||null,songKey:current?.song?(E.songUseKey?.(current.song)||E.songKey(current.song)):null,outcome,...extra});saveMatch()}
  function newCardForRepeat(){
    if(!match||!current)return;
    recordSongUsed();logOutcome('repeat-replaced');
    stopPlayback();E.destroyYouTube();playing=false;playNeedsTap=false;
    nextRound();
  }
  function revealPhysical(){if(!current)return;recordSongUsed();stopPlayback();placementResult=null;match.placementResult=null;match.phase='reveal';syncCurrent();screen='reveal';render()}
  function lockPlacement(){
    if(pendingSlot===null||!current||cfg.playMode!=='virtual'||!['playing','guess'].includes(screen))return;
    const team=activeTeam(),years=[...(team.timeline||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b),slot=pendingSlot;
    if(!Number.isInteger(slot)||slot<0||slot>years.length){toast('Choose a valid placement first.');pendingSlot=null;match.pendingSlot=null;saveMatch();render();return}
    const left=slot>0?years[slot-1]:null,right=slot<years.length?years[slot]:null;
    const correct=(left===null||left<=current.year)&&(right===null||current.year<=right);
    placementResult={correct,left,right,slot};recordSongUsed();stopPlayback();
    if(correct){years.splice(slot,0,current.year);team.timeline=years;team.score++;team.correct=(team.correct||0)+1}else team.wrong=(team.wrong||0)+1;
    logOutcome(correct?'correct':'wrong',{slot,left,right});
    pendingSlot=null;match.pendingSlot=null;match.placementResult=placementResult;match.phase='reveal';syncCurrent();screen='reveal';render();resetScroll();
  }
  function finishPhysical(correct){
    if(screen!=='reveal'||!match)return;
    const team=activeTeam();
    if(correct){team.score++;team.correct=(team.correct||0)+1}else team.wrong=(team.wrong||0)+1;
    logOutcome(correct?'correct':'wrong');advanceTurn();
  }
  function finishVirtualTurn''', 'scoring block')

p.write_text(s)

# ---------- catalogue builder: one active mode, 12 target / 8 minimum per year ----------
builder = r'''#!/usr/bin/env python3
import csv, io, json, re, time, unicodedata
from pathlib import Path
import requests

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data'/'catalogue.json'
YEARS=list(range(1950,2023))
TARGET_POOL=12
MIN_POOL=8
BIMMUDA='https://raw.githubusercontent.com/madelinehamilton/BiMMuDa/main/metadata/bimmuda_per_song_metadata.csv'
MB='https://musicbrainz.org/ws/2/recording/'
UA='Guess-the-Song-Year/2.0 (private-use catalogue builder; https://github.com/hwatson14/Guess-the-Song-Year)'
S=requests.Session();S.headers.update({'User-Agent':UA})
_last_mb=0.0

def norm(v):return re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKD',str(v or '')).encode('ascii','ignore').decode().lower()).strip()
def toks(v):return set(norm(v).split())
def sim(a,b):
 a,b=toks(a),toks(b);return len(a&b)/max(len(a),len(b)) if a and b else 0
def clean(v):return str(v or '').strip().strip('“”"')
def main_artist(v):return re.split(r'feat\.|ft\.|&|,| and | featuring ',str(v or ''),maxsplit=1,flags=re.I)[0].strip()
def lucene(v):return re.sub(r'[+\-!(){}\[\]^"~*?:\\/]',' ',str(v or '')).strip()
def key(t,a):return norm(t)+'|'+norm(a)

def get(url,**kw):
 for i in range(6):
  try:
   r=S.get(url,timeout=45,**kw)
   if r.ok:return r
   if r.status_code not in (429,500,502,503,504):r.raise_for_status()
  except requests.RequestException:pass
  time.sleep(min(20,3*(i+1)))
 raise RuntimeError('GET failed: '+url)

def mb(query,limit=100):
 global _last_mb
 wait=max(0,1.15-(time.time()-_last_mb))
 if wait:time.sleep(wait)
 r=get(MB,params={'fmt':'json','limit':limit,'query':query},headers={'Accept':'application/json','User-Agent':UA})
 _last_mb=time.time();return r.json()

def bimmuda_rows():
 out=[]
 for r in csv.DictReader(io.StringIO(get(BIMMUDA).text)):
  try:y=int(r.get('Year') or 0);rank=float(re.match(r'\d+(?:\.\d+)?',str(r.get('Position') or '99')).group())
  except:continue
  if y not in YEARS:continue
  link=r.get('Link to Audio') or ''
  sp=(re.search(r'open\.spotify\.com/track/([A-Za-z0-9]+)',link) or [None,None])[1]
  yt=(re.search(r'[?&]v=([A-Za-z0-9_-]{11})',link) or [None,None])[1]
  out.append({'title':clean(r.get('Title')),'artist':clean(r.get('Artist')),'chartYear':y,'rank':rank,'spotifyId':sp or '','youtubeId':yt or ''})
 return out

def credit(rec):return ''.join(x if isinstance(x,str) else x.get('name') or (x.get('artist') or {}).get('name') or '' for x in rec.get('artist-credit',[])).strip()

def exact_candidates(year,clauses,limit=100):
 if not clauses:return []
 q=f'firstreleasedate:[{year}-01-01 TO {year}-12-31] AND ('+' OR '.join(clauses)+')'
 try:d=mb(q,limit)
 except Exception as e:
  print('MB batch failed',year,e);return []
 out=[];seen=set()
 for rec in d.get('recordings',[]):
  date=rec.get('first-release-date') or ''
  if not date.startswith(str(year)):continue
  title=clean(rec.get('title'));artist=credit(rec)
  if not title or not artist or re.search(r'karaoke|tribute|demo|live|remix|instrumental|acoustic|backing track',title,re.I):continue
  k=key(title,artist)
  if k in seen:continue
  seen.add(k);out.append({'title':title,'artist':artist,'year':year,'mbScore':float(rec.get('score') or 0)})
 return out

def attach(song,rows):
 best=None;score=0
 for r in rows:
  s=sim(song['title'],r['title'])*2+sim(song['artist'],r['artist'])
  if s>score:score=s;best=r
 if best and score>1.8:
  song['spotifyId']=best.get('spotifyId','');song['youtubeId']=best.get('youtubeId','')
 return song

def greatest_pool(year,bim):
 rows=sorted([r for r in bim if r['chartYear']==year],key=lambda r:r['rank'])[:50]
 if not rows:raise RuntimeError(f'No Billboard candidates for {year}')
 found={}
 for start in range(0,len(rows),10):
  chunk=rows[start:start+10]
  clauses=[f'(recording:"{lucene(r["title"])}" AND artistname:"{lucene(main_artist(r["artist"]))}")' for r in chunk]
  for f in exact_candidates(year,clauses):found.setdefault(key(f['title'],f['artist']),f)
  if len(found)>=TARGET_POOL*2:break
 ranked=[]
 for f in found.values():
  scored=[(sim(f['title'],r['title'])*2+sim(f['artist'],r['artist']),r) for r in rows]
  score,best=max(scored,key=lambda x:x[0])
  if score<1.35:continue
  ranked.append((best['rank'],-score,-f['mbScore'],f))
 ranked.sort(key=lambda x:(x[0],x[1],x[2]))
 pool=[];seen=set()
 for _,__,___,f in ranked:
  k=key(f['title'],f['artist'])
  if k in seen:continue
  seen.add(k)
  f.update({'source':'release-year-verified','sourceLabel':'Billboard hit · release year verified'})
  pool.append(attach(f,rows))
  if len(pool)>=TARGET_POOL:break
 if len(pool)<MIN_POOL:raise RuntimeError(f'{year} only produced {len(pool)} verified songs; need {MIN_POOL}')
 return pool

def main():
 OUT.parent.mkdir(parents=True,exist_ok=True)
 print('Loading Billboard/BiMMuDa source')
 bim=bimmuda_rows();greatest={}
 for y in YEARS:
  print('Greatest',y)
  greatest[str(y)]=greatest_pool(y,bim)
 data={'version':7,'generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'years':YEARS,'modes':{'greatest':greatest},'coverage':{'greatest':len(greatest)},'sources':{'greatest':f'Billboard candidates with MusicBrainz exact first-release verification; target {TARGET_POOL}, minimum {MIN_POOL} distinct songs per year'}}
 OUT.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
 print('Wrote',OUT,'songs',sum(len(v) for v in greatest.values()),'min',min(len(v) for v in greatest.values()),'max',max(len(v) for v in greatest.values()))

if __name__=='__main__':main()
'''
(ROOT/'scripts'/'build_catalogue.py').write_text(builder)

# ---------- validator + schema depth gates ----------
vp=ROOT/'scripts'/'validate_catalogue.py'; v=vp.read_text()
v=v.replace("    warnings = []\n", "    warnings = []\n    min_unique_required = 8\n")
v=v.replace("        if unique < 1:\n            fail(f'{year} has no unique playable candidate')",
            "        if unique < min_unique_required:\n            fail(f'{year} has only {unique} unique songs; need at least {min_unique_required}')")
v=v.replace("    app = APP.read_text(encoding='utf-8')", "    if set(data.get('modes',{})) != {'greatest'}:\n        fail('v7 catalogue must contain only the active Greatest Hits mode')\n\n    app = APP.read_text(encoding='utf-8')")
vp.write_text(v)

sp=ROOT/'data'/'catalogue.schema.json'; schema=json.loads(sp.read_text())
schema['properties']['modes']['properties']['greatest']['patternProperties']['^(19[5-9][0-9]|20[0-2][0-9])$']['minItems']=8
sp.write_text(json.dumps(schema,ensure_ascii=False,indent=2)+'\n')

# cache bust
ip=ROOT/'index.html'; h=ip.read_text()
for asset in ['app.css','engine.js','engine-v7.js','app.js']:
    h=re.sub(rf'{re.escape(asset)}\?v=[^"\']+',f'{asset}?v=7.3.0',h)
ip.write_text(h)
