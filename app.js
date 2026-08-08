(() => {
  'use strict';

  const E=window.GSYEngine;
  const root=document.getElementById('app'),toastEl=document.getElementById('toast');
  const CFG_KEY='gsy.config.v7',MATCH_KEY='gsy.match.v7';
  const DEFAULT_CFG={playMode:'physical',teams:2,victory:'10'};
  const MODE='greatest';

  let cfg=load(CFG_KEY,DEFAULT_CFG),match=load(MATCH_KEY,null);
  let screen=match?.active?(match.phase==='gameover'?'gameover':'resume'):'setup',current=match?.current||null,pendingSlot=Number.isInteger(match?.pendingSlot)?match.pendingSlot:null,placementResult=match?.placementResult||null;
  let scanner=null,scanning=false,scanBusy=false,motionReady=false,faceDown=false,playing=false,playNeedsTap=false,toastTimer=null;
  let musicModal=false,deviceList=[],backGuardReady=false,prepareSeq=0,countdownTimer=null,youtubeListenTimer=null,youtubeDownAt=0;

  const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  function load(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}}
  function saveCfg(){localStorage.setItem(CFG_KEY,JSON.stringify(cfg))}
  function saveMatch(){if(match)localStorage.setItem(MATCH_KEY,JSON.stringify(match));else localStorage.removeItem(MATCH_KEY)}
  function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
  function activeTeam(){return match?.teams?.[match.turn]||{name:'Team 1',score:0,timeline:[]}}
  function winner(){return cfg.victory==='10'?match?.teams?.find(t=>t.score>=10)||null:null}
  function victoryLabel(){return cfg.victory==='unlimited'?'Unlimited':'10 cards'}
  function providerName(){return E.getProvider()==='spotify'?'Spotify':'YouTube'}
  function providerReady(){return E.getProvider()==='youtube'||E.isSpotifyConnected()}
  function toast(msg){clearTimeout(toastTimer);toastEl.textContent=msg;toastEl.classList.add('on');toastTimer=setTimeout(()=>toastEl.classList.remove('on'),4200)}
  function errorText(err){return err?.message||String(err||'Something went wrong.')}
  function syncCurrent(){if(!match)return;match.current=current;match.placementResult=placementResult;saveMatch()}
  function resetScroll(){requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'instant'}))}

  async function boot(){
    try{await E.init()}catch(err){toast(errorText(err))}
    normalizeConfig();
    migrateMatch();
    render();
    armBrowserBack();
    if(E.isSpotifyConnected())refreshDevices(false).catch(()=>{});
  }

  function normalizeConfig(){
    cfg={...DEFAULT_CFG,...cfg};
    cfg.teams=Math.max(1,Math.min(6,Number(cfg.teams)||2));
    if(!['physical','virtual'].includes(cfg.playMode))cfg.playMode='physical';
    if(!['10','unlimited'].includes(cfg.victory))cfg.victory='10';
    delete cfg.deck;delete cfg.deckPolicy;
    saveCfg();
  }

  function takeVirtualCardId(){
    if(!match)return null;
    if(!Array.isArray(match.virtualDeck)||!match.virtualDeck.length)match.virtualDeck=shuffle(Array.from({length:308},(_,i)=>i+1));
    if(match.virtualPos>=match.virtualDeck.length){match.virtualDeck=shuffle(Array.from({length:308},(_,i)=>i+1));match.virtualPos=0}
    return match.virtualDeck[match.virtualPos++];
  }

  function ensureVirtualStarters(){
    if(cfg.playMode!=='virtual'||!match)return;
    match.virtualDeck=Array.isArray(match.virtualDeck)&&match.virtualDeck.length?match.virtualDeck:shuffle(Array.from({length:308},(_,i)=>i+1));
    match.virtualPos=Math.max(0,Number(match.virtualPos)||0);
    for(const team of match.teams||[]){
      team.timeline=Array.isArray(team.timeline)?team.timeline.map(Number).filter(Number.isFinite):[];
      if(!team.timeline.length){
        const id=takeVirtualCardId(),year=E.cardYear(id);
        if(year){team.timeline=[year];team.starterCardId=id;team.starterYear=year}
      }else if(!Number.isFinite(Number(team.starterYear))){
        team.starterYear=team.timeline[0];
      }
    }
  }

  function migrateMatch(){
    if(!match?.active)return;
    match.mode=MODE;
    match.phase=match.phase||'between';
    match.current=match.current||null;
    match.placementResult=match.placementResult||null;
    match.pendingSlot=Number.isInteger(match.pendingSlot)?match.pendingSlot:null;
    match.used=Array.isArray(match.used)?match.used:[];
    match.assign=match.assign&&typeof match.assign==='object'?match.assign:{};
    if(cfg.playMode==='virtual')ensureVirtualStarters();
    saveMatch();
  }

  function render(){
    const content=screen==='setup'?setupScreen():screen==='resume'?resumeScreen():screen==='scanner'?scannerScreen():screen==='loading'?loadingScreen():screen==='ready'?readyScreen():screen==='countdown'?countdownScreen():screen==='youtube'?youtubeListeningScreen():screen==='playing'?playingScreen():screen==='guess'?guessScreen():screen==='reveal'?revealScreen():screen==='gameover'?gameOverScreen():setupScreen();
    root.innerHTML=`<div class="app">${content}</div>${musicSheet()}`;
    bind();
    if(screen==='scanner')setTimeout(startScanner,20);
  }

  function topLine(back=false,music=true){return `<div class="topline">${back?'<button class="icon-btn" data-action="back" aria-label="Back">‹</button>':'<div class="brand-small">Guess the Song Year</div>'}${music?'<button class="icon-btn" data-action="music" aria-label="Music settings">♫</button>':'<span></span>'}</div>`}

  function setupScreen(){
    return `${topLine(false)}
      <div class="kicker">NEW GAME</div><h1 class="display title">Game <span class="mint">Setup</span></h1><p class="subtitle">Greatest Hits. Pick how you want to play, then start.</p>
      <div class="setup-grid">
        <section class="card option-card">
          <div class="option-head"><h3>1. Play style</h3><span>${cfg.playMode==='physical'?'QR cards + camera':'Fully in-app timeline'}</span></div>
          <div class="choice-row"><button class="choice ${cfg.playMode==='physical'?'on':''}" data-play="physical">Real cards<small>Scan each QR card</small></button><button class="choice ${cfg.playMode==='virtual'?'on':''}" data-play="virtual">Virtual<small>Starter year + app dealt cards</small></button></div>
        </section>
        <section class="card option-card">
          <div class="option-head"><h3>2. Teams</h3><span>Turns rotate automatically</span></div>
          <div class="stepper"><button data-action="teams-minus">−</button><b>${cfg.teams}</b><button data-action="teams-plus">+</button></div>
        </section>
        <section class="card option-card">
          <div class="option-head"><h3>3. Victory target</h3><span>${victoryLabel()}</span></div>
          <div class="choice-row"><button class="choice ${cfg.victory==='10'?'on':''}" data-victory="10">First to 10<small>Classic finish</small></button><button class="choice ${cfg.victory==='unlimited'?'on':''}" data-victory="unlimited">Unlimited<small>End whenever you like</small></button></div>
        </section>
      </div>
      <div class="card music-inline"><div><strong>${providerName()}</strong><small>${E.getProvider()==='spotify'?(E.isSpotifyConnected()?'Connected':'Needs connection'):'Ready · ads/player UI may appear'}</small></div><button data-action="music">Change ›</button></div>
      <div class="setup-footer"><button class="btn primary" data-action="start-game">Start Game</button></div>`;
  }

  function resumeScreen(){
    const phase=match?.phase||'between';
    const phaseText=phase==='reveal'?'Answer ready':['ready','countdown','youtube','playing','guess'].includes(phase)?'Song in progress':phase==='scanner'?'Waiting for a card':'Ready for the next card';
    return `${topLine(false)}<div class="kicker">GAME IN PROGRESS</div><h1 class="display title">Ready to <span class="mint">continue?</span></h1>
      <section class="hero"><h2>${esc(activeTeam().name)} is up</h2><p>${cfg.playMode==='physical'?'Real cards':'Virtual'} · Greatest Hits · ${cfg.teams} team${cfg.teams===1?'':'s'} · ${victoryLabel()} · ${phaseText}</p><div class="hero-actions"><button class="btn primary" data-action="resume">Resume Game</button><button class="btn ghost" data-action="new-game">New Game</button>${cfg.victory==='unlimited'?'<button class="btn text" data-action="end-game">End Game</button>':''}</div></section>${scoreStrip()}`;
  }

  function matchHeader(){return `<div class="match-bar"><div class="match-team">${esc(activeTeam().name)}</div><div class="match-meta">Turn ${Number(match?.round||0)+1}<br>${cfg.victory==='10'?`${activeTeam().score}/10 cards`:`${activeTeam().score} cards`}</div>${cfg.victory==='unlimited'?'<button class="btn text" data-action="end-game">End game</button>':''}</div>`}
  function scoreStrip(){if(!match)return'';return `<div class="score-strip">${match.teams.map((t,i)=>`<div class="team-pill ${i===match.turn?'on':''}"><small>${esc(t.name)}</small><b>${t.score}${cfg.victory==='10'?'/10':''}</b></div>`).join('')}</div>`}

  function scannerScreen(){return `<div class="scanner"><div class="camera"><div id="reader"></div><div class="camera-shade"></div></div><div class="scanner-head"><div class="scanner-brand">Guess the Song Year</div><button class="round-btn" data-action="back" aria-label="Back">×</button></div><div class="scanner-copy">${esc(activeTeam().name)} · scan the QR code on the back of a card</div><div class="scan-frame"><div class="scan-line"></div></div><div class="scanner-bottom"><button class="round-btn" data-action="manual">#</button></div></div>`}
  function loadingScreen(){return `${topLine(true,false)}${matchHeader()}${scoreStrip()}<div class="center"><div class="loader"></div><h1>Preparing song</h1><p>Greatest Hits · ${providerName()}. The answer stays hidden.</p></div>`}

  function readyScreen(){
    const isYt=current?.provider==='youtube';
    const copy=isYt?'Tap Start music, then you get 3 seconds to put the phone face-down before YouTube starts.':'Flip the phone face-down, or tap Start music.';
    return `${topLine(true,false)}${matchHeader()}${scoreStrip()}<div class="kicker">✦ ${cfg.playMode==='physical'?'CARD SCANNED':'CARD DEALT'}</div><h1 class="ready-title">Ready to play</h1><div class="ready-visual" aria-hidden="true"><div class="ready-glow"></div><div class="ready-phone"><div class="ready-phone-screen"><span>?</span></div><i></i></div></div><div class="ready-copy"><h2>${isYt?'Phone down in 3':'Flip your phone'}</h2><p>${copy}</p><div class="locked">▣ Song locked · year hidden</div><div class="ready-actions"><button class="btn primary" data-action="play-current">Start music</button>${!isYt?'<button class="btn ghost" data-action="motion">Enable flip-to-start</button>':''}</div></div>`;
  }

  function countdownScreen(){
    return `${topLine(true,false)}${matchHeader()}${scoreStrip()}<div class="countdown-wrap"><div class="kicker">PUT PHONE FACE-DOWN</div><div class="countdown-number" id="countdownNumber">3</div><h1>Music is about to start</h1><p>Keep the screen face-down until you are ready to guess.</p></div>`;
  }

  function youtubeListeningScreen(){
    return `${topLine(false,false)}${matchHeader()}${scoreStrip()}<div class="youtube-listening"><div class="kicker">NOW PLAYING · PHONE DOWN</div><h1>Listen, then guess</h1><p>Listen for as long as you want. Lift the phone or tap Guess now whenever you are ready.</p><div class="youtube-guess-actions"><button class="btn primary" data-action="guess-now">Guess now</button></div><div class="youtube-player"><div id="youtubePlayer"></div></div><button class="btn primary yt-start-fallback hidden" id="ytStartFallback" data-action="yt-start">Tap to start YouTube</button><small class="provider-warning">If your browser blocks autoplay, tap the button above and put the phone face-down again.</small></div>`;
  }

  function playingScreen(){
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

  function virtualTimeline(){
    const team=activeTeam(),years=[...(team.timeline||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b);let html='';
    for(let i=0;i<=years.length;i++){
      const label=i===0?`Before ${years[0]??'timeline'}`:i===years.length?`After ${years[years.length-1]??'timeline'}`:`Between ${years[i-1]} and ${years[i]}`;
      html+=`<button class="slot ${pendingSlot===i?'on':''}" data-slot="${i}" aria-label="${label}" aria-pressed="${pendingSlot===i?'true':'false'}"></button>`;
      if(i<years.length)html+=`<div class="year-card">${years[i]}</div>`;
    }
    const starter=Number(team.starterYear);
    return `<div class="card"><div class="timeline">${html}</div><div class="timeline-note">Starter year: <b>${Number.isFinite(starter)?starter:years[0]}</b> · Tap a + before, between or after the years.</div></div><div class="virtual-actions"><button class="btn ghost" data-action="listen-again">↻ Listen Again</button><button class="btn primary" data-action="lock-placement" ${pendingSlot===null?'disabled':''}>Lock Placement</button></div>`;
  }

  function revealScreen(){
    const virtual=cfg.playMode==='virtual';
    const result=virtual?(placementResult?.correct?'Correct placement':'Wrong position'):'Check your physical timeline';
    const resultClass=virtual?(placementResult?.correct?'ok':'bad'):'';
    const source=current?.song?.sourceLabel||current?.song?.source||'Greatest Hits catalogue';
    return `${topLine(true,false)}${matchHeader()}${scoreStrip()}<h1 class="reveal-heading">Reveal</h1><div class="reveal-sub">Greatest Hits · ${esc(activeTeam().name)}</div>
      <section class="card answer-card"><div class="answer-top"><div class="answer-art"></div><div><div class="answer-song">${esc(current?.song?.title||'Unknown')}</div><div class="answer-artist">${esc(current?.song?.artist||'')}</div></div></div><div class="answer-year">${current?.year||'----'}</div><div class="result-badge ${resultClass}">${esc(result)}</div></section>
      <div class="card reveal-help">${virtual?(placementResult?.correct?`It fits at that point in ${esc(activeTeam().name)}’s timeline. The card has been added.`:`It does not fit between those neighbouring years, so the card is discarded.`):`If ${current?.year} fits where ${esc(activeTeam().name)} placed the physical card, keep it. Otherwise discard it.`}</div>
      <div class="reveal-actions">${virtual?'':`<button class="btn ghost" data-action="discard">Discard</button><button class="btn primary" data-action="keep">Keep card</button>`}${virtual?'<button class="btn primary" data-action="next-turn">Next Team</button>':''}<button class="btn text" data-action="open-track">Open song in ${current?.provider==='spotify'?'Spotify':'YouTube'}</button></div><div class="source-note">Catalogue source: ${esc(source)}</div>`;
  }

  function gameOverScreen(){
    const w=winner(),ranked=[...(match?.teams||[])].sort((a,b)=>b.score-a.score);
    const title=w?`${esc(w.name)} <span class="mint">wins</span>`:'Game <span class="mint">complete</span>';
    const subtitle=w?'First to 10 cards.':'Final scores.';
    return `${topLine(false,false)}<div class="kicker">GAME COMPLETE</div><h1 class="display title">${title}</h1><p class="subtitle">${subtitle}</p><div class="scoreboard">${ranked.map((t,i)=>`<div class="card score-row ${i===0?'on':''}"><b>${i+1}. ${esc(t.name)}</b><strong>${t.score}</strong></div>`).join('')}</div><div class="hero-actions"><button class="btn primary" data-action="new-game">New Game</button></div>`;
  }

  function musicSheet(){
    const sp=E.isSpotifyConnected(),selected=E.getSpotifyDevice();
    return `<div class="modal ${musicModal?'on':''}" id="musicModal"><div class="sheet"><div class="sheet-head"><h2>Music</h2><button class="close" data-action="close-music">×</button></div><div class="service-grid"><button class="service ${E.getProvider()==='spotify'?'on':''}" data-provider="spotify"><strong>Spotify</strong><small>${sp?'Connected · best hidden playback':'Premium account required'}</small></button><button class="service ${E.getProvider()==='youtube'?'on':''}" data-provider="youtube"><strong>YouTube</strong><small>No login · keep phone face-down while YouTube plays</small></button></div>
      <div class="spotify-controls ${E.getProvider()==='spotify'?'':'hidden'}">${sp?`<select id="deviceSelect"><option value="">Automatic device</option>${deviceList.map(d=>`<option value="${esc(d.id)}" ${selected===d.id?'selected':''}>${esc(d.name)} · ${esc(d.type)}${d.is_active?' · active':''}</option>`).join('')}</select><button class="btn ghost" data-action="refresh-devices">Refresh devices</button><button class="btn danger" data-action="disconnect-spotify">Disconnect Spotify</button>`:'<button class="btn primary" data-action="connect-spotify">Connect Spotify</button>'}</div>
      <div class="diagnostic">${E.getProvider()==='spotify'?'For reliable playback, open Spotify on the target phone or speaker and play/pause once.':'YouTube remains a normal visible player while it plays. The game uses a countdown and face-down workflow so the video does not accidentally give away the song.'}</div></div></div>`;
  }

  function bind(){
    root.querySelectorAll('[data-play]').forEach(b=>b.onclick=()=>{cfg.playMode=b.dataset.play;saveCfg();render()});
    root.querySelectorAll('[data-victory]').forEach(b=>b.onclick=()=>{cfg.victory=b.dataset.victory;saveCfg();render()});
    root.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>selectSlot(Number(b.dataset.slot)));
    document.querySelectorAll('[data-provider]').forEach(b=>b.onclick=()=>selectProvider(b.dataset.provider));
    document.querySelectorAll('[data-action]').forEach(b=>{
      const a=b.dataset.action;
      if(a==='music')b.onclick=()=>{musicModal=true;render()};
      if(a==='close-music')b.onclick=()=>{musicModal=false;render()};
      if(a==='teams-minus')b.onclick=()=>{cfg.teams=Math.max(1,cfg.teams-1);saveCfg();render()};
      if(a==='teams-plus')b.onclick=()=>{cfg.teams=Math.min(6,cfg.teams+1);saveCfg();render()};
      if(a==='start-game')b.onclick=startMatch;
      if(a==='resume')b.onclick=resumeMatch;
      if(a==='new-game')b.onclick=newGame;
      if(a==='end-game')b.onclick=()=>endGame('manual');
      if(a==='back')b.onclick=handleBack;
      if(a==='manual')b.onclick=manualCard;
      if(a==='play-current')b.onclick=playCurrent;
      if(a==='motion')b.onclick=enableMotion;
      if(a==='toggle-play')b.onclick=togglePlay;
      if(a==='yt-start')b.onclick=startYouTubeFromTap;
      if(a==='guess-now')b.onclick=finishYouTubeListening;
      if(a==='listen-again')b.onclick=listenAgain;
      if(a==='replay')b.onclick=replay;
      if(a==='reveal')b.onclick=revealPhysical;
      if(a==='lock-placement')b.onclick=lockPlacement;
      if(a==='keep')b.onclick=()=>finishPhysical(true);
      if(a==='discard')b.onclick=()=>finishPhysical(false);
      if(a==='next-turn')b.onclick=finishVirtualTurn;
      if(a==='open-track')b.onclick=openTrack;
      if(a==='connect-spotify')b.onclick=()=>E.spotifyConnect();
      if(a==='disconnect-spotify')b.onclick=()=>{E.spotifyDisconnect();deviceList=[];toast('Spotify disconnected.');render()};
      if(a==='refresh-devices')b.onclick=()=>refreshDevices(true);
    });
    const ds=document.getElementById('deviceSelect');if(ds)ds.onchange=()=>{E.setSpotifyDevice(ds.value);toast(ds.value?'Playback device saved.':'Device selection set to automatic.')};
    const modal=document.getElementById('musicModal');if(modal)modal.onclick=e=>{if(e.target===modal){musicModal=false;render()}};
  }

  function armBrowserBack(){
    if(backGuardReady)return;
    backGuardReady=true;
    history.replaceState({...(history.state||{}),gsyBase:true},document.title,location.href);
    history.pushState({gsyGuard:true},document.title,location.href);
    window.addEventListener('popstate',()=>{
      handleBack();
      history.pushState({gsyGuard:true},document.title,location.href);
    });
  }

  function handleBack(){
    if(musicModal){musicModal=false;render();return}
    if(['scanner','loading','ready','countdown','youtube','playing','guess','reveal'].includes(screen)){
      cancelCountdown();cancelYoutubeListening();prepareSeq++;
      if(screen==='scanner')stopScanner();
      if(screen==='playing'||screen==='youtube')stopPlayback();
      screen='resume';render();resetScroll();return;
    }
    if(screen==='gameover'){toast('Game complete. Tap New Game to start again.');return}
    if(screen==='resume'){toast('Use Resume Game or New Game.');return}
    toast('You are already at the start of the app.');
  }

  async function selectProvider(kind){
    E.setProvider(kind);
    if(kind==='spotify'&&!E.isSpotifyConnected()){musicModal=true;render();return}
    if(kind==='spotify')await refreshDevices(false).catch(()=>{});
    render();
  }

  async function refreshDevices(showToast=true){
    if(!E.isSpotifyConnected())return;
    try{deviceList=await E.spotifyDevices();if(showToast)toast(deviceList.length?`${deviceList.length} Spotify device${deviceList.length===1?'':'s'} found.`:'No Spotify device found. Open Spotify and play/pause once.');render()}catch(err){if(showToast)toast(errorText(err))}
  }

  async function startMatch(){
    if(!providerReady()){musicModal=true;render();toast('Connect Spotify first, or switch to YouTube.');return}
    match={active:true,id:`g${Date.now()}`,mode:MODE,phase:'between',round:0,turn:0,teams:Array.from({length:cfg.teams},(_,i)=>({name:`Team ${i+1}`,score:0,timeline:[],starterYear:null,starterCardId:null})),used:[],assign:{},virtualDeck:shuffle(Array.from({length:308},(_,i)=>i+1)),virtualPos:0,current:null,placementResult:null,pendingSlot:null};
    if(cfg.playMode==='virtual')ensureVirtualStarters();
    current=null;placementResult=null;pendingSlot=null;
    saveCfg();saveMatch();
    await requestMotion(false);
    nextRound();
  }

  async function resumeMatch(){
    if(!match?.active){screen='setup';render();return}
    current=match.current||null;placementResult=match.placementResult||null;pendingSlot=Number.isInteger(match.pendingSlot)?match.pendingSlot:null;
    const phase=match.phase||'between';
    if(current&&current.provider!==E.getProvider()){
      try{
        screen='loading';render();
        current={...current,resolved:await E.resolveSong(current.song,E.getProvider()),provider:E.getProvider()};
        match.current=current;saveMatch();
      }catch(err){toast(errorText(err));screen='resume';render();return}
    }
    if(phase==='scanner'&&cfg.playMode==='physical'){screen='scanner';render();return}
    if(['ready','countdown','youtube','playing'].includes(phase)&&current){match.phase='ready';saveMatch();screen='ready';render();return}
    if(phase==='guess'&&current){screen='guess';render();return}
    if(phase==='reveal'&&current){screen='reveal';render();return}
    if(phase==='gameover'){screen='gameover';render();return}
    nextRound();
  }

  function newGame(){
    cancelCountdown();cancelYoutubeListening();stopScanner();E.destroyYouTube();playing=false;playNeedsTap=false;musicModal=false;
    prepareSeq++;match=null;current=null;pendingSlot=null;placementResult=null;
    localStorage.removeItem(MATCH_KEY);screen='setup';render();resetScroll();
  }

  function clearRoundState(){
    cancelCountdown();cancelYoutubeListening();prepareSeq++;
    current=null;pendingSlot=null;placementResult=null;playing=false;playNeedsTap=false;youtubeDownAt=0;
    E.destroyYouTube();
    if(match){match.current=null;match.placementResult=null;match.pendingSlot=null;match.phase='between'}
  }

  function nextRound(){
    if(winner()){endGame('target');return}
    clearRoundState();saveMatch();
    if(cfg.playMode==='physical'){match.phase='scanner';saveMatch();screen='scanner';render();resetScroll()}
    else{const id=nextVirtualCard();prepareCard(id)}
  }

  function nextVirtualCard(){const id=takeVirtualCardId();saveMatch();return id}

  async function prepareCard(cardId){
    const seq=++prepareSeq;
    const year=E.cardYear(cardId);if(!year){toast('That card has no year mapping.');return nextRound()}
    match.phase='loading';saveMatch();screen='loading';render();
    const assignKey=String(cardId),excluded=[...(match.used||[])];let lastErr=null;
    for(let attempt=0;attempt<4;attempt++){
      try{
        let song=attempt===0?match.assign[assignKey]:null;
        if(!song){song=await E.chooseSong(year,MODE,excluded);match.assign[assignKey]=song;saveMatch()}
        if(Number(song.year)!==Number(year))throw new E.AppError('CATALOGUE_YEAR_MISMATCH',`Catalogue error: ${song.title} is not mapped to ${year}.`);
        const resolved=await E.resolveSong(song,E.getProvider());
        if(seq!==prepareSeq)return;
        current={cardId,year,song,resolved,provider:E.getProvider(),mode:MODE};
        match.current=current;match.placementResult=null;match.phase='ready';saveMatch();
        screen='ready';render();return;
      }catch(err){
        lastErr=err;
        const failed=match.assign[assignKey];
        if(failed){const k=E.songKey(failed);if(!excluded.includes(k))excluded.push(k)}
        const retryable=['SPOTIFY_TRACK_NOT_FOUND','YOUTUBE_VIDEO_NOT_FOUND','YOUTUBE_PLAY_FAILED'].includes(err?.code);
        if(retryable){delete match.assign[assignKey];saveMatch();continue}
        break;
      }
    }
    if(seq!==prepareSeq)return;
    toast(errorText(lastErr));
    if(['NO_SPOTIFY_DEVICE','SPOTIFY_NOT_CONNECTED','SPOTIFY_REAUTH'].includes(lastErr?.code)){musicModal=true;screen='resume';render();return}
    if(cfg.playMode==='physical'){setTimeout(()=>{if(seq!==prepareSeq)return;match.phase='scanner';saveMatch();screen='scanner';render()},1200)}
    else setTimeout(()=>{if(seq===prepareSeq)nextRound()},1200);
  }

  async function loadQr(){if(window.Html5Qrcode)return;await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s)})}
  async function startScanner(){
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

  function manualCard(){const raw=prompt('Enter the card number (1–308) or paste its QR URL');const id=E.parseCardId(raw);if(!id){if(raw)toast('Card number not recognised.');return}stopScanner().finally(()=>prepareCard(id))}

  async function requestMotion(showToast=true){
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

  async function replaceCurrentSong(){
    if(!current)return;
    const seq=++prepareSeq;
    const {cardId,year}=current,assignKey=String(cardId),excluded=[...(match.used||[]),E.songKey(current.song)];
    delete match.assign[assignKey];saveMatch();E.destroyYouTube();playing=false;match.phase='loading';saveMatch();screen='loading';render();
    let lastErr=null;
    for(let attempt=0;attempt<3;attempt++){
      try{
        const song=await E.chooseSong(year,MODE,excluded),k=E.songKey(song);if(!excluded.includes(k))excluded.push(k);
        const resolved=await E.resolveSong(song,E.getProvider());
        if(seq!==prepareSeq)return;
        match.assign[assignKey]=song;current={cardId,year,song,resolved,provider:E.getProvider(),mode:MODE};
        match.current=current;match.phase='ready';saveMatch();screen='ready';render();toast('A replacement track is ready.');return;
      }catch(err){lastErr=err}
    }
    if(seq!==prepareSeq)return;
    toast(errorText(lastErr)||'No alternative song could be prepared.');
    if(cfg.playMode==='physical'){match.phase='scanner';saveMatch();screen='scanner';render()}else nextRound();
  }

  async function togglePlay(){if(!current)return;if(current.provider==='youtube'){const p=E.youtubePlayer();try{const state=p?.getPlayerState?.();if(state===1){E.pauseYouTube();playing=false}else{E.resumeYouTube();playing=true}}catch{}}else{if(playing){await E.pauseSpotify();playing=false}else{await E.playSpotify(current.resolved.uri);playing=true}}}
  async function replay(){if(!current)return;try{if(current.provider==='youtube')E.replayYouTube();else await E.playSpotify(current.resolved.uri);playing=true}catch(err){toast(errorText(err))}}
  function stopPlayback(){if(!current)return;if(current.provider==='youtube')E.pauseYouTube();else E.pauseSpotify();playing=false}

  function selectSlot(slot){
    if(cfg.playMode!=='virtual'||!current||!['playing','guess'].includes(screen))return;
    const years=[...(activeTeam().timeline||[])];
    if(!Number.isInteger(slot)||slot<0||slot>years.length){toast('That placement is not available.');return}
    pendingSlot=slot;match.pendingSlot=slot;saveMatch();
    root.querySelectorAll('[data-slot]').forEach(x=>{const on=Number(x.dataset.slot)===slot;x.classList.toggle('on',on);x.setAttribute('aria-pressed',on?'true':'false')});
    const lock=root.querySelector('[data-action="lock-placement"]');if(lock)lock.disabled=false;
  }
  function revealPhysical(){if(!current)return;recordSongUsed();stopPlayback();placementResult=null;match.placementResult=null;match.phase='reveal';syncCurrent();screen='reveal';render()}
  function lockPlacement(){
    if(pendingSlot===null||!current||cfg.playMode!=='virtual'||!['playing','guess'].includes(screen))return;
    const team=activeTeam(),years=[...(team.timeline||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b),slot=pendingSlot;
    if(!Number.isInteger(slot)||slot<0||slot>years.length){toast('Choose a valid placement first.');pendingSlot=null;match.pendingSlot=null;saveMatch();render();return}
    const left=slot>0?years[slot-1]:null,right=slot<years.length?years[slot]:null;
    const correct=(left===null||left<=current.year)&&(right===null||current.year<=right);
    placementResult={correct,left,right,slot};recordSongUsed();stopPlayback();
    if(correct){years.splice(slot,0,current.year);team.timeline=years;team.score++}
    pendingSlot=null;match.pendingSlot=null;match.placementResult=placementResult;match.phase='reveal';syncCurrent();screen='reveal';render();resetScroll();
  }
  function recordSongUsed(){if(!current?.song)return;const key=E.songKey(current.song);if(!match.used.includes(key))match.used.push(key)}
  function finishPhysical(keep){if(screen!=='reveal'||!match)return;if(keep)activeTeam().score++;advanceTurn()}
  function finishVirtualTurn(){if(screen!=='reveal'||!match)return;advanceTurn()}
  function advanceTurn(){if(!match)return;match.turn=(match.turn+1)%match.teams.length;match.round++;saveMatch();nextRound()}
  function endGame(reason){if(!match)return;cancelCountdown();cancelYoutubeListening();prepareSeq++;stopScanner();stopPlayback();E.destroyYouTube();match.endReason=reason;match.phase='gameover';match.current=current;saveMatch();screen='gameover';render();resetScroll()}
  function openTrack(){const url=current?.resolved?.url;if(url)window.open(url,'_blank','noopener')}

  boot();
})();
