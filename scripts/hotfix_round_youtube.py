from pathlib import Path
import re


def replace_once(s, old, new, label):
    if old not in s:
        raise SystemExit(f"missing replacement: {label}")
    return s.replace(old, new, 1)


def between(s, start, end, new, label):
    i = s.find(start)
    if i < 0:
        raise SystemExit(f"missing start: {label}")
    j = s.find(end, i)
    if j < 0:
        raise SystemExit(f"missing end: {label}")
    return s[:i] + new + s[j:]


p = Path("app.js")
s = p.read_text()

s = replace_once(
    s,
    "let scanner=null,scanning=false,motionReady=false,faceDown=false,playing=false,playNeedsTap=false,toastTimer=null;\n  let musicModal=false,deviceList=[],backGuardReady=false,prepareSeq=0;",
    "let scanner=null,scanning=false,scanBusy=false,motionReady=false,faceDown=false,playing=false,playNeedsTap=false,toastTimer=null;\n  let musicModal=false,deviceList=[],backGuardReady=false,prepareSeq=0,countdownTimer=null,youtubeListenTimer=null,youtubeDownAt=0;",
    "runtime flags",
)

s = replace_once(
    s,
    "screen==='ready'?readyScreen():screen==='playing'?playingScreen():screen==='reveal'?revealScreen()",
    "screen==='ready'?readyScreen():screen==='countdown'?countdownScreen():screen==='youtube'?youtubeListeningScreen():screen==='playing'?playingScreen():screen==='guess'?guessScreen():screen==='reveal'?revealScreen()",
    "screen router",
)

s = replace_once(
    s,
    "const phaseText=phase==='reveal'?'Answer ready':phase==='ready'||phase==='playing'?'Song ready':phase==='scanner'?'Waiting for a card':'Ready for the next card';",
    "const phaseText=phase==='reveal'?'Answer ready':['ready','countdown','youtube','playing','guess'].includes(phase)?'Song in progress':phase==='scanner'?'Waiting for a card':'Ready for the next card';",
    "resume phase label",
)

s = between(
    s,
    "  function readyScreen(){",
    "  function playingScreen(){",
    r'''  function readyScreen(){
    const isYt=current?.provider==='youtube';
    const copy=isYt?'Tap Start music, then you get 3 seconds to put the phone face-down before YouTube starts.':'Flip the phone face-down, or tap Start music.';
    return `${topLine(true,false)}${matchHeader()}${scoreStrip()}<div class="kicker">✦ ${cfg.playMode==='physical'?'CARD SCANNED':'CARD DEALT'}</div><h1 class="ready-title">Ready to play</h1><div class="ready-visual" aria-hidden="true"><div class="ready-glow"></div><div class="ready-phone"><div class="ready-phone-screen"><span>?</span></div><i></i></div></div><div class="ready-copy"><h2>${isYt?'Phone down in 3':'Flip your phone'}</h2><p>${copy}</p><div class="locked">▣ Song locked · year hidden</div><div class="ready-actions"><button class="btn primary" data-action="play-current">Start music</button>${!isYt?'<button class="btn ghost" data-action="motion">Enable flip-to-start</button>':''}</div></div>`;
  }

  function countdownScreen(){
    return `${topLine(true,false)}${matchHeader()}${scoreStrip()}<div class="countdown-wrap"><div class="kicker">PUT PHONE FACE-DOWN</div><div class="countdown-number" id="countdownNumber">3</div><h1>Music is about to start</h1><p>Keep the screen face-down until you are ready to guess.</p></div>`;
  }

  function youtubeListeningScreen(){
    return `${topLine(false,false)}${matchHeader()}${scoreStrip()}<div class="youtube-listening"><div class="kicker">NOW PLAYING · PHONE DOWN</div><h1>Listen, then lift the phone</h1><p>When you lift the phone, playback stops before the guessing screen appears. It also stops automatically after 30 seconds.</p><div class="youtube-player"><div id="youtubePlayer"></div></div><button class="btn primary yt-start-fallback hidden" id="ytStartFallback" data-action="yt-start">Tap to start YouTube</button><small class="provider-warning">If your browser blocks autoplay, tap the button above and put the phone face-down again.</small></div>`;
  }

''',
    "ready/countdown/youtube screens",
)

s = between(
    s,
    "  function playingScreen(){",
    "  function virtualTimeline(){",
    r'''  function playingScreen(){
    const virtual=cfg.playMode==='virtual';
    return `${topLine(true,false)}${matchHeader()}${scoreStrip()}<div class="kicker">NOW PLAYING</div><div class="wave-card"><button class="play-core" data-action="toggle-play">Ⅱ</button><div class="wave"></div></div>
      <div class="playing-instruction"><h2>${virtual?'Place it on your timeline':'Place the physical card on your timeline'}</h2><p>${virtual?'Choose the gap where you think this song belongs.':'Use the cards already on the table. No example years are shown here so the app cannot influence your guess.'}</p></div>
      ${virtual?virtualTimeline():`<div class="play-actions"><button class="btn ghost" data-action="replay">↻ Replay</button><button class="btn primary" data-action="reveal">Reveal Answer</button></div>`}`;
  }

  function guessScreen(){
    const virtual=cfg.playMode==='virtual';
    return `${topLine(true,false)}${matchHeader()}${scoreStrip()}<div class="kicker">MUSIC STOPPED</div><div class="guess-stage"><div class="guess-disc" aria-hidden="true"></div><h1>${virtual?'Place the song':'Make your guess'}</h1><p>${virtual?'Choose where the song belongs on your timeline.':'Place the physical card on your timeline, then reveal the answer.'}</p></div>
      ${virtual?virtualTimeline():`<div class="play-actions"><button class="btn ghost" data-action="listen-again">↻ Listen again</button><button class="btn primary" data-action="reveal">Reveal Answer</button></div>`}`;
  }

''',
    "playing/guess screens",
)

s = replace_once(
    s,
    "if(a==='toggle-play')b.onclick=togglePlay;",
    "if(a==='toggle-play')b.onclick=togglePlay;\n      if(a==='yt-start')b.onclick=startYouTubeFromTap;\n      if(a==='listen-again')b.onclick=listenAgain;",
    "new actions",
)

s = replace_once(
    s,
    "if(['scanner','loading','ready','playing','reveal'].includes(screen)){\n      prepareSeq++;",
    "if(['scanner','loading','ready','countdown','youtube','playing','guess','reveal'].includes(screen)){\n      cancelCountdown();cancelYoutubeListening();prepareSeq++;",
    "browser back phases",
)

s = replace_once(
    s,
    "if(screen==='playing')stopPlayback();",
    "if(screen==='playing'||screen==='youtube')stopPlayback();",
    "browser back playback stop",
)

s = replace_once(
    s,
    "if((phase==='ready'||phase==='playing')&&current){match.phase='ready';saveMatch();screen='ready';render();return}",
    "if(['ready','countdown','youtube','playing'].includes(phase)&&current){match.phase='ready';saveMatch();screen='ready';render();return}\n    if(phase==='guess'&&current){screen='guess';render();return}",
    "resume current phase",
)

s = replace_once(
    s,
    "stopScanner();E.destroyYouTube();playing=false;playNeedsTap=false;musicModal=false;",
    "cancelCountdown();cancelYoutubeListening();stopScanner();E.destroyYouTube();playing=false;playNeedsTap=false;musicModal=false;",
    "new game teardown",
)

s = between(
    s,
    "  function nextRound(){",
    "  function nextVirtualCard(){",
    r'''  function clearRoundState(){
    cancelCountdown();cancelYoutubeListening();prepareSeq++;
    current=null;pendingSlot=null;placementResult=null;playing=false;playNeedsTap=false;youtubeDownAt=0;
    E.destroyYouTube();
    if(match){match.current=null;match.placementResult=null;match.phase='between'}
  }

  function nextRound(){
    if(winner()){endGame('target');return}
    clearRoundState();saveMatch();
    if(cfg.playMode==='physical'){match.phase='scanner';saveMatch();screen='scanner';render();resetScroll()}
    else{const id=nextVirtualCard();prepareCard(id)}
  }

''',
    "round teardown",
)

s = between(
    s,
    "  async function startScanner(){",
    "  function manualCard(){",
    r'''  async function startScanner(){
    if(screen!=='scanner'||scanning||scanBusy||scanner)return;
    scanBusy=true;
    let instance=null;
    try{
      await loadQr();
      if(screen!=='scanner')return;
      instance=new Html5Qrcode('reader');
      scanner=instance;
      await instance.start({facingMode:'environment'},{fps:12,qrbox:{width:260,height:260}},async text=>{
        if(scanner!==instance||!scanning||scanBusy)return;
        scanBusy=true;
        navigator.vibrate?.(35);
        await stopScanner();
        const id=E.parseCardId(text);
        if(!id){
          toast('That QR code is not one of the supported cards.');
          if(screen==='scanner')setTimeout(()=>render(),600);
          return;
        }
        await prepareCard(id);
      },()=>{});
      if(scanner!==instance||screen!=='scanner'){
        try{await instance.stop()}catch{}
        try{await instance.clear()}catch{}
        return;
      }
      scanning=true;
    }catch{
      if(scanner===instance)scanner=null;
      scanning=false;
      toast('Camera could not start. Allow camera access or enter the card number manually.');
    }finally{
      scanBusy=false;
    }
  }

  async function stopScanner(){
    const instance=scanner;
    scanner=null;
    const wasRunning=scanning;
    scanning=false;
    if(!instance){scanBusy=false;return}
    try{if(wasRunning)await instance.stop()}catch{}
    try{await instance.clear()}catch{}
    scanBusy=false;
  }

''',
    "scanner lifecycle",
)

s = between(
    s,
    "  async function requestMotion(showToast=true){",
    "  async function playCurrent(){",
    r'''  async function requestMotion(showToast=true){
    try{
      if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){const p=await DeviceOrientationEvent.requestPermission();if(p!=='granted')throw new Error('Motion permission not granted')}
      if(!motionReady){window.addEventListener('deviceorientation',onOrientation,{passive:true});motionReady=true}
      if(showToast)toast('Flip controls enabled.');return true
    }catch{if(showToast)toast('Flip controls are unavailable. Use the on-screen controls instead.');return false}
  }
  function enableMotion(){requestMotion(true)}
  function onOrientation(e){
    const b=Number(e.beta),g=Number(e.gamma);
    if(!Number.isFinite(b)||!Number.isFinite(g))return;
    const down=Math.abs(b)>135&&Math.abs(g)<70,changed=down!==faceDown;
    faceDown=down;
    if(screen==='ready'&&changed&&down&&current?.provider==='spotify'){playCurrent();return}
    if(screen==='youtube'){
      if(down){
        if(!youtubeDownAt)youtubeDownAt=Date.now();
      }else if(youtubeDownAt&&Date.now()-youtubeDownAt>700){
        youtubeDownAt=0;
        finishYouTubeListening();
      }else{
        youtubeDownAt=0;
      }
    }
  }

  function cancelCountdown(){
    if(countdownTimer){clearInterval(countdownTimer);countdownTimer=null}
  }

  function cancelYoutubeListening(){
    if(youtubeListenTimer){clearTimeout(youtubeListenTimer);youtubeListenTimer=null}
    youtubeDownAt=0;
  }

  function beginYouTubeCountdown(){
    if(!current)return;
    cancelCountdown();cancelYoutubeListening();
    const seq=++prepareSeq;
    match.phase='countdown';match.current=current;saveMatch();
    screen='countdown';render();resetScroll();
    let remaining=3;
    countdownTimer=setInterval(()=>{
      remaining--;
      const el=document.getElementById('countdownNumber');
      if(remaining>0){if(el)el.textContent=String(remaining);return}
      cancelCountdown();
      if(seq===prepareSeq&&screen==='countdown')startYouTubeListening();
    },1000);
  }

  async function playCurrent(){
    if(!current||playing)return;
    if(current.provider==='youtube'){beginYouTubeCountdown();return}
    match.phase='playing';match.current=current;saveMatch();screen='playing';render();resetScroll();
    try{
      await E.playSpotify(current.resolved.uri);playing=true;playNeedsTap=false
    }catch(err){
      playing=false;toast(errorText(err));
      if(err?.code?.startsWith('SPOTIFY')){screen='resume';musicModal=true;render()}
    }
  }

  async function startYouTubeListening(){
    if(!current||current.provider!=='youtube')return;
    cancelCountdown();cancelYoutubeListening();
    match.phase='youtube';match.current=current;saveMatch();
    screen='youtube';render();resetScroll();
    try{
      const r=await E.playYouTube('youtubePlayer',current.resolved);
      playing=!!r.started;playNeedsTap=!!r.needsTap;
      if(playNeedsTap){
        document.getElementById('ytStartFallback')?.classList.remove('hidden');
        toast('Browser blocked autoplay. Tap Start YouTube, then put the phone face-down.');
        return;
      }
      armYoutubeStopTimer();
    }catch(err){
      playing=false;
      if(err?.code==='YOUTUBE_PLAY_FAILED'){toast('That upload would not play. Swapping in another song from the same year.');await replaceCurrentSong();return}
      toast(errorText(err));
    }
  }

  function startYouTubeFromTap(){
    if(!current||current.provider!=='youtube'||screen!=='youtube')return;
    try{
      E.resumeYouTube();playing=true;playNeedsTap=false;
      document.getElementById('ytStartFallback')?.classList.add('hidden');
      armYoutubeStopTimer();
    }catch{toast('YouTube still could not start. Try again or switch to Spotify.')}
  }

  function armYoutubeStopTimer(){
    cancelYoutubeListening();
    youtubeListenTimer=setTimeout(()=>finishYouTubeListening(),30000);
  }

  function finishYouTubeListening(){
    if(screen!=='youtube'||!current)return;
    cancelYoutubeListening();
    E.pauseYouTube();E.destroyYouTube();playing=false;playNeedsTap=false;
    match.phase='guess';match.current=current;saveMatch();
    screen='guess';render();resetScroll();
    navigator.vibrate?.([35,60,35]);
  }

  function listenAgain(){
    if(!current)return;
    if(current.provider==='youtube'){beginYouTubeCountdown();return}
    replay();
  }

''',
    "motion/youtube flow",
)

s = replace_once(
    s,
    "function advanceTurn(){match.turn=(match.turn+1)%match.teams.length;match.round++;current=null;placementResult=null;pendingSlot=null;match.current=null;match.placementResult=null;match.phase='between';saveMatch();if(winner())endGame('target');else nextRound()}",
    "function advanceTurn(){if(!match)return;match.turn=(match.turn+1)%match.teams.length;match.round++;saveMatch();nextRound()}",
    "advance turn",
)
s = replace_once(
    s,
    "function finishPhysical(keep){if(keep)activeTeam().score++;advanceTurn()}",
    "function finishPhysical(keep){if(screen!=='reveal'||!match)return;if(keep)activeTeam().score++;advanceTurn()}",
    "physical finish guard",
)
s = replace_once(
    s,
    "function finishVirtualTurn(){advanceTurn()}",
    "function finishVirtualTurn(){if(screen!=='reveal'||!match)return;advanceTurn()}",
    "virtual finish guard",
)
s = replace_once(
    s,
    "function endGame(reason){if(!match)return;prepareSeq++;stopScanner();stopPlayback();E.destroyYouTube();",
    "function endGame(reason){if(!match)return;cancelCountdown();cancelYoutubeListening();prepareSeq++;stopScanner();stopPlayback();E.destroyYouTube();",
    "end game teardown",
)

s = s.replace(
    "<small>No login · ads/player UI possible</small>",
    "<small>No login · keep phone face-down while YouTube plays</small>",
)
s = s.replace(
    "'YouTube playback is the universal fallback. A visible player is required and autoplay can be restricted by the browser.'",
    "'YouTube remains a normal visible player while it plays. The game uses a countdown and face-down workflow so the video does not accidentally give away the song.'",
)

p.write_text(s)

p = Path("app.css")
c = p.read_text()
c += r'''

/* v7.2 gameplay fixes */
.ready-visual{width:min(78vw,390px);aspect-ratio:1/1.04;margin:20px auto 18px;position:relative;display:grid;place-items:center;overflow:hidden;border-radius:34px;border:1px solid #54e5c12e;background:radial-gradient(circle at 50% 42%,#1c6a5c45,#071014 58%,#04080a 100%);box-shadow:0 24px 70px #0009,inset 0 1px #ffffff0d}.ready-glow{position:absolute;width:72%;height:72%;border-radius:50%;background:radial-gradient(circle,#55e4c130,transparent 66%);filter:blur(12px)}.ready-phone{position:relative;width:45%;aspect-ratio:.54;border:3px solid #69eac9;border-radius:28px;background:#081619;box-shadow:0 0 32px #38dcb778,0 22px 50px #000a;transform:rotate(-7deg);padding:10px}.ready-phone-screen{height:86%;border-radius:19px;border:1px solid #5de9c94a;background:radial-gradient(circle at 50% 38%,#183e39,#071014 70%);display:grid;place-items:center}.ready-phone-screen span{font-family:var(--serif);font-size:76px;color:var(--mint);text-shadow:0 0 24px #55e4c188}.ready-phone i{display:block;width:22%;height:5px;border-radius:99px;background:#5de9c977;margin:8px auto 0}
.countdown-wrap{min-height:68dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.countdown-number{font-family:var(--serif);font-size:clamp(150px,45vw,260px);line-height:.78;color:var(--mint);text-shadow:0 0 55px #45e1ba55;margin:28px 0 22px}.countdown-wrap h1{font-family:var(--serif);font-size:48px;font-weight:500;letter-spacing:-.035em}.countdown-wrap p{color:var(--muted);font-size:16px;line-height:1.45;margin-top:10px;max-width:480px}
.youtube-listening{text-align:center}.youtube-listening h1{font-family:var(--serif);font-size:42px;font-weight:500;letter-spacing:-.035em;margin-top:8px}.youtube-listening>p{color:var(--muted);line-height:1.45;margin:9px auto 16px;max-width:520px}.youtube-listening .youtube-player{margin:12px auto;width:min(100%,520px);min-height:200px;border-radius:22px;overflow:hidden;background:#000}.youtube-listening .youtube-player iframe{width:100%;aspect-ratio:16/9;min-height:200px;display:block}.yt-start-fallback{display:block;width:min(100%,520px);margin:12px auto}.youtube-listening .provider-warning{display:block;max-width:520px;margin:8px auto 0}
.guess-stage{text-align:center;margin:24px 0}.guess-stage h1{font-family:var(--serif);font-size:48px;font-weight:500;letter-spacing:-.04em}.guess-stage p{color:var(--muted);margin-top:8px;line-height:1.45}.guess-disc{width:150px;height:150px;border-radius:50%;margin:0 auto 20px;background:radial-gradient(circle,#061113 0 22%,#55e4c1 23% 25%,#0c1c1e 26% 43%,#55e4c133 44% 46%,#071014 47% 100%);box-shadow:0 0 36px #35d9b22b}
.answer-art{background:radial-gradient(circle at 50% 50%,#061113 0 22%,#55e4c1 23% 25%,#0c1c1e 26% 43%,#55e4c133 44% 46%,#071014 47% 100%)!important}
'''
p.write_text(c)

p = Path("index.html")
h = p.read_text()
h = re.sub(r'app\.css\?v=[^"\']+', 'app.css?v=7.2', h)
h = re.sub(r'engine\.js\?v=[^"\']+', 'engine.js?v=7.2', h)
h = re.sub(r'engine-v7\.js\?v=[^"\']+', 'engine-v7.js?v=7.2', h)
h = re.sub(r'app\.js\?v=[^"\']+', 'app.js?v=7.2', h)
p.write_text(h)
