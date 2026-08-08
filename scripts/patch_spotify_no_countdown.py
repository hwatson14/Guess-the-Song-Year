from pathlib import Path
import re

p = Path('app.js')
s = p.read_text()


def rep(old, new, label):
    global s
    if old not in s:
        raise SystemExit(f'missing {label}')
    s = s.replace(old, new, 1)

rep(
"""  async function playCurrent(){
    if(!current||playing)return;
    beginMusicCountdown();
  }""",
"""  async function playCurrent(){
    if(!current||playing)return;
    if(current.provider==='spotify'){await startSpotifyListening();return}
    beginMusicCountdown();
  }""",
'playCurrent provider split'
)

rep(
"""        if(cfg.playMode==='physical'){saveMatch();beginMusicCountdown();return}
        match.phase='ready';saveMatch();screen='ready';render();return;""",
"""        if(cfg.playMode==='physical'){
          saveMatch();
          if(current.provider==='spotify'){await startSpotifyListening();return}
          beginMusicCountdown();return;
        }
        match.phase='ready';saveMatch();screen='ready';render();return;""",
'physical post-scan provider split'
)

rep(
"""  function listenAgain(){
    if(!current)return;
    stopPlayback();
    beginMusicCountdown();
  }""",
"""  async function listenAgain(){
    if(!current)return;
    stopPlayback();
    if(current.provider==='spotify'){await startSpotifyListening();return}
    beginMusicCountdown();
  }""",
'listen again provider split'
)

p.write_text(s)

p = Path('index.html')
h = p.read_text()
h = re.sub(r'app\.css\?v=[^"\']+', 'app.css?v=7.2.5', h)
h = re.sub(r'engine\.js\?v=[^"\']+', 'engine.js?v=7.2.5', h)
h = re.sub(r'engine-v7\.js\?v=[^"\']+', 'engine-v7.js?v=7.2.5', h)
h = re.sub(r'app\.js\?v=[^"\']+', 'app.js?v=7.2.5', h)
p.write_text(h)
