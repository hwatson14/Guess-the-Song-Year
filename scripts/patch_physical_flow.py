from pathlib import Path
import re

p = Path('app.js')
s = p.read_text()


def rep(old, new, label):
    global s
    if old not in s:
        raise SystemExit(f'missing {label}')
    s = s.replace(old, new, 1)


rep('  function beginYouTubeCountdown(){', '  function beginMusicCountdown(){', 'countdown function name')
rep(
    "      if(seq===prepareSeq&&screen==='countdown')startYouTubeListening();",
    "      if(seq===prepareSeq&&screen==='countdown'){if(current?.provider==='youtube')startYouTubeListening();else startSpotifyListening()}",
    'countdown completion',
)

old_play = """  async function playCurrent(){
    if(!current||playing)return;
    if(current.provider==='youtube'){beginYouTubeCountdown();return}
    match.phase='playing';match.current=current;saveMatch();screen='playing';render();resetScroll();
    try{
      await E.playSpotify(current.resolved.uri);playing=true;playNeedsTap=false
    }catch(err){
      playing=false;toast(errorText(err));
      if(err?.code?.startsWith('SPOTIFY')){screen='resume';musicModal=true;render()}
    }
  }"""
new_play = """  async function playCurrent(){
    if(!current||playing)return;
    beginMusicCountdown();
  }

  async function startSpotifyListening(){
    if(!current||current.provider!=='spotify')return;
    match.phase='playing';match.current=current;saveMatch();screen='playing';render();resetScroll();
    try{
      await E.playSpotify(current.resolved.uri);playing=true;playNeedsTap=false
    }catch(err){
      playing=false;toast(errorText(err));
      if(err?.code?.startsWith('SPOTIFY')){screen='resume';musicModal=true;render()}
    }
  }"""
rep(old_play, new_play, 'playCurrent block')

old_ready = """        current={cardId,year,song,resolved,provider:E.getProvider(),mode:MODE};
        match.current=current;match.placementResult=null;match.phase='ready';saveMatch();
        screen='ready';render();return;"""
new_ready = """        current={cardId,year,song,resolved,provider:E.getProvider(),mode:MODE};
        match.current=current;match.placementResult=null;
        if(cfg.playMode==='physical'){saveMatch();beginMusicCountdown();return}
        match.phase='ready';saveMatch();screen='ready';render();return;"""
rep(old_ready, new_ready, 'post-scan ready transition')

old_again = """  function listenAgain(){
    if(!current)return;
    if(current.provider==='youtube'){beginYouTubeCountdown();return}
    replay();
  }"""
new_again = """  function listenAgain(){
    if(!current)return;
    stopPlayback();
    beginMusicCountdown();
  }"""
rep(old_again, new_again, 'listenAgain')

rep(
    "    if(screen==='youtube'){\n      if(down){",
    "    if(screen==='youtube'&&cfg.playMode==='virtual'){\n      if(down){",
    'orientation youtube guard',
)

marker = """  function finishYouTubeListening(){
    if(screen!=='youtube'||!current)return;"""
insert = """  function guessNow(){
    if(!current)return;
    if(cfg.playMode==='physical'){
      cancelYoutubeListening();
      E.pauseYouTube();E.destroyYouTube();playing=false;playNeedsTap=false;
      revealPhysical();return;
    }
    if(screen==='youtube')finishYouTubeListening();
  }

  function finishYouTubeListening(){
    if(screen!=='youtube'||!current)return;"""
rep(marker, insert, 'guessNow function')

rep(
    "      if(a==='guess-now')b.onclick=finishYouTubeListening;",
    "      if(a==='guess-now')b.onclick=guessNow;",
    'guess-now binding',
)

rep(
    '<button class="btn primary" data-action="reveal">Reveal Answer</button>',
    '<button class="btn primary" data-action="guess-now">Guess now</button>',
    'physical spotify guess button',
)

old_yt = """  function youtubeListeningScreen(){
    return `${topLine(false,false)}${matchHeader()}${scoreStrip()}<div class="youtube-listening"><div class="kicker">NOW PLAYING · PHONE DOWN</div><h1>Listen, then guess</h1><p>Listen for as long as you want. Lift the phone or tap Guess now whenever you are ready.</p><div class="youtube-guess-actions"><button class="btn primary" data-action="guess-now">Guess now</button></div><div class="youtube-player"><div id="youtubePlayer"></div></div><button class="btn primary yt-start-fallback hidden" id="ytStartFallback" data-action="yt-start">Tap to start YouTube</button><small class="provider-warning">If your browser blocks autoplay, tap the button above and put the phone face-down again.</small></div>`;
  }"""
new_yt = """  function youtubeListeningScreen(){
    const virtual=cfg.playMode==='virtual';
    const copy=virtual?'Listen for as long as you want. Lift the phone or tap Guess now when you are ready to place the song.':'Listen for as long as you want. Pick up the phone and tap Guess now when you are ready to reveal.';
    return `${topLine(false,false)}${matchHeader()}${scoreStrip()}<div class="youtube-listening"><div class="kicker">NOW PLAYING · PHONE DOWN</div><h1>Listen, then guess</h1><p>${copy}</p><div class="youtube-guess-actions"><button class="btn primary" data-action="guess-now">Guess now</button></div><div class="youtube-player"><div id="youtubePlayer"></div></div><button class="btn primary yt-start-fallback hidden" id="ytStartFallback" data-action="yt-start">Tap to start YouTube</button><small class="provider-warning">If your browser blocks autoplay, tap the button above and put the phone face-down again.</small></div>`;
  }"""
rep(old_yt, new_yt, 'youtube listening copy')

s = s.replace('beginYouTubeCountdown()', 'beginMusicCountdown()')
p.write_text(s)

p = Path('index.html')
h = p.read_text()
h = re.sub(r'app\.css\?v=[^"\']+', 'app.css?v=7.2.4', h)
h = re.sub(r'engine\.js\?v=[^"\']+', 'engine.js?v=7.2.4', h)
h = re.sub(r'engine-v7\.js\?v=[^"\']+', 'engine-v7.js?v=7.2.4', h)
h = re.sub(r'app\.js\?v=[^"\']+', 'app.js?v=7.2.4', h)
p.write_text(h)
