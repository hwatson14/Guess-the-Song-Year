(() => {
  'use strict';

  const E=window.GSYEngine;
  const root=document.getElementById('app'),toastEl=document.getElementById('toast');
  const CFG_KEY='gsy.config.v6',MATCH_KEY='gsy.match.v6';
  const DEFAULT_CFG={playMode:'physical',deckPolicy:'fixed',deck:'greatest',teams:2,victory:'10'};

  let cfg=load(CFG_KEY,DEFAULT_CFG),match=load(MATCH_KEY,null);
  let screen=match?.active?'resume':'setup',current=null,roundDeck=cfg.deck,pendingSlot=null,placementResult=null;
  let scanner=null,scanning=false,motionReady=false,faceDown=false,playing=false,playNeedsTap=false,toastTimer=null;
  let musicModal=false,deviceList=[];

  const modeIds=()=>Object.keys(E.MODES);
  const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  function load(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}}
  function saveCfg(){localStorage.setItem(CFG_KEY,JSON.stringify(cfg))}
  function saveMatch(){if(match)localStorage.setItem(MATCH_KEY,JSON.stringify(match));else localStorage.removeItem(MATCH_KEY)}
  function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
  function activeTeam(){return match?.teams?.[match.turn]||{name:'Team 1',score:0,timeline:[]}}
  function winner(){return cfg.victory==='10'?match?.teams?.find(t=>t.score>=10)||null:null}
  function victoryLabel(){return cfg.victory==='unlimited'?'Unlimited':'10 cards'}
  function modeName(id){return E.MODES[id]?.name||'Greatest Hits'}
  function providerName(){return E.getProvider()==='spotify'?'Spotify':'YouTube'}
  function providerReady(){return E.getProvider()==='youtube'||E.isSpotifyConnected()}
  function toast(msg){clearTimeout(toastTimer);toastEl.textContent=msg;toastEl.classList.add('on');toastTimer=setTimeout(()=>toastEl.classList.remove('on'),4200)}
  function errorText(err){return err?.message||String(err||'Something went wrong.')}

  async function boot(){
    try{await E.init()}catch(err){toast(errorText(err))}
    normalizeConfig();render();
    if(E.isSpotifyConnected())refreshDevices(false).catch(()=>{});
  }

  function normalizeConfig(){
    if(cfg.deck==='number1')cfg.deck='number1_us';
    if(!E.MODES[cfg.deck])cfg.deck='greatest';
    cfg.teams=Math.max(1,Math.min(6,Number(cfg.teams)||2));
    if(!['physical','virtual'].includes(cfg.playMode))cfg.playMode='physical';
    if(!['fixed','each'].includes(cfg.deckPolicy))cfg.deckPolicy='fixed';
    if(!['10','unlimited'].includes(cfg.victory))cfg.victory='10';
    saveCfg();
  }

  function render(){
    const content=screen==='setup'?setupScreen():screen==='resume'?resumeScreen():screen==='deckpick'?deckPickerScreen():screen==='scanner'?scannerScreen():screen==='loading'?loadingScreen():screen==='ready'?readyScreen():screen==='playing'?playingScreen():screen==='reveal'?revealScreen():screen==='gameover'?gameOverScreen():setupScreen();
    root.innerHTML=`<div class="app">${content}</div>${musicSheet()}`;
    bind();
    if(screen==='scanner')setTimeout(startScanner,20);
  }

  function topLine(back=false,music=true){return `<div class="topline">${back?'<button class="icon-btn" data-action="back">‹</button>':'<div class="brand-small">Guess the Song Year</div>'}${music?'<button class="icon-btn" data-action="music" aria-label="Music settings">♫</button>':'<span></span>'}</div>`}

  function setupScreen(){
    const decks=modeIds().map(id=>`<button class="deck-option ${cfg.deck===id?'on':''}" data-deck="${id}"><b>${esc(E.MODES[id].name)}</b><span>${esc(E.MODES[id].desc)}</span></button>`).join('');
    return `${topLine(false)}
      <div class="kicker">NEW GAME</div><h1 class="display title">Game <span class="mint">Setup</span></h1><p class="subtitle">Four choices, then play. Everything else stays out of the game loop.</p>
      <div class="setup-grid">
        <section class="card option-card">
          <div class="option-head"><h3>1. Play style</h3><span>${cfg.playMode==='physical'?'QR cards + camera':'Fully in-app timeline'}</span></div>
          <div class="choice-row"><button class="choice ${cfg.playMode==='physical'?'on':''}" data-play="physical">Real cards<small>Scan each QR card</small></button><button class="choice ${cfg.playMode==='virtual'?'on':''}" data-play="virtual">Virtual<small>App deals the cards</small></button></div>
        </section>
        <section class="card option-card">
          <div class="option-head"><h3>2. Deck</h3><span>${cfg.deckPolicy==='fixed'?modeName(cfg.deck):'Choose before every song'}</span></div>
          <div class="policy"><button class="choice ${cfg.deckPolicy==='fixed'?'on':''}" data-policy="fixed">One deck</button><button class="choice ${cfg.deckPolicy==='each'?'on':''}" data-policy="each">Choose each song</button></div>
          <div class="deck-options ${cfg.deckPolicy==='each'?'hidden':''}">${decks}</div>
        </section>
        <section class="card option-card">
          <div class="option-head"><h3>3. Teams</h3><span>Turns rotate automatically</span></div>
          <div class="stepper"><button data-action="teams-minus">−</button><b>${cfg.teams}</b><button data-action="teams-plus">+</button></div>
        </section>
        <section class="card option-card">
          <div class="option-head"><h3>4. Victory target</h3><span>${victoryLabel()}</span></div>
          <div class="choice-row"><button class="choice ${cfg.victory==='10'?'on':''}" data-victory="10">First to 10<small>Classic finish</small></button><button class="choice ${cfg.victory==='unlimited'?'on':''}" data-victory="unlimited">Unlimited<small>Stop whenever you like</small></button></div>
        </section>
      </div>
      <div class="card music-inline"><div><strong>${providerName()}</strong><small>${E.getProvider()==='spotify'?(E.isSpotifyConnected()?'Connected':'Needs connection'):'Ready · ads/player UI may appear'}</small></div><button data-action="music">Change ›</button></div>
      <div class="setup-footer"><button class="btn primary" data-action="start-game">Start Game</button></div>`;
  }

  function resumeScreen(){
    return `${topLine(false)}<div class="kicker">GAME IN PROGRESS</div><h1 class="display title">Ready to <span class="mint">continue?</span></h1>
      <section class="hero"><h2>${esc(activeTeam().name)} is up</h2><p>${cfg.playMode==='physical'?'Real cards':'Virtual'} · ${cfg.deckPolicy==='each'?'deck chosen each song':modeName(cfg.deck)} · ${cfg.teams} team${cfg.teams===1?'':'s'} · ${victoryLabel()}</p><div class="hero-actions"><button class="btn primary" data-action="resume">Resume Game</button><button class="btn ghost" data-action="new-game">New Game</button></div></section>${scoreStrip()}`;
  }

  function deckPickerScreen(){
    const decks=modeIds().map(id=>`<button class="deck-option" data-round-deck="${id}"><b>${esc(E.MODES[id].name)}</b><span>${esc(E.MODES[id].desc)}</span></button>`).join('');
    return `${topLine(false)}${matchHeader()}<div class="deck-picker"><div class="kicker">${esc(activeTeam().name.toUpperCase())}</div><h1>Choose a Deck</h1><p>Pick the vibe for this song. This choice lasts for one turn.</p><div class="deck-options">${decks}</div></div>${scoreStrip()}`;
  }

  function matchHeader(){return `<div class="match-bar"><div class="match-team">${esc(activeTeam().name)}</div><div class="match-meta">Round ${Number(match?.round||0)+1}<br>${cfg.victory==='10'?`${activeTeam().score}/10 cards`:`${activeTeam().score} cards`}</div></div>`}
  function scoreStrip(){if(!match)return'';return `<div class="score-strip">${match.teams.map((t,i)=>`<div class="team-pill ${i===match.turn?'on':''}"><small>${esc(t.name)}</small><b>${t.score}${cfg.victory==='10'?'/10':''}</b></div>`).join('')}</div>`}

  function scannerScreen(){return `<div class="scanner"><div class="camera"><div id="reader"></div><div class="camera-shade"></div></div><div class="scanner-head"><div class="scanner-brand">Guess the Song Year</div><button class="round-btn" data-action="abort-round">×</button></div><div class="scanner-copy">${esc(activeTeam().name)} · scan the QR code on the back of a card</div><div class="scan-frame"><div class="scan-line"></div></div><div class="scanner-bottom"><button class="round-btn" data-action="manual">#</button></div></div>`}

  function loadingScreen(){return `${topLine(false,false)}${matchHeader()}${scoreStrip()}<div class="center"><div class="loader"></div><h1>Preparing song</h1><p>${modeName(roundDeck)} · ${providerName()}. The answer stays hidden.</p></div>`}

  function readyScreen(){
    const isYt=current?.provider==='youtube';
    const copy=isYt?'Tap Start music. YouTube needs a real player and may require a tap.':'Flip the phone face-down, or tap Start music.';
    return `${topLine(false,false)}${matchHeader()}${scoreStrip()}<div class="kicker">✦ ${cfg.playMode==='physical'?'CARD SCANNED':'CARD DEALT'}</div><h1 class="ready-title">Ready to play</h1><div class="flip-art"></div><div class="ready-copy"><h2>${isYt?'Start the music':'Flip your phone'}</h2><p>${copy}</p><div class="locked">▣ Song locked · year hidden</div><div class="ready-actions"><button class="btn primary" data-action="play-current">Start music</button>${!isYt?'<button class="btn ghost" data-action="motion">Enable flip-to-start</button>':''}</div></div>`;
  }

  function playingScreen(){
    const virtual=cfg.playMode==='virtual';
    return `${topLine(false,false)}${matchHeader()}${scoreStrip()}<div class="kicker">NOW PLAYING</div><div class="wave-card"><button class="play-core" data-action="toggle-play">Ⅱ</button><div class="wave"></div></div>
      ${current?.provider==='youtube'?`<div class="youtube-player"><div id="youtubePlayer"></div></div><div class="provider-warning">YouTube requires a visible player. If playback does not start automatically, tap the player.</div>`:''}
      <div class="playing-instruction"><h2>${virtual?'Place it on your timeline':'Place the physical card on your timeline'}</h2><p>${virtual?'Choose the gap where you think this song belongs.':'Use the cards already on the table. No example years are shown here so the app cannot influence your guess.'}</p></div>
      ${virtual?virtualTimeline():`<div class="play-actions"><button class="btn ghost" data-action="replay">↻ Replay</button><button class="btn primary" data-action="reveal">Reveal Answer</button></div>`}`;
  }

  function virtualTimeline(){
    const years=[...(activeTeam().timeline||[])].sort((a,b)=>a-b);let html='';
    for(let i=0;i<=years.length;i++){
      html+=`<button class="slot ${pendingSlot===i?'on':''}" data-slot="${i}" aria-label="Place here"></button>`;
      if(i<years.length)html+=`<div class="year-card">${years[i]}</div>`;
    }
    if(!years.length)html='<button class="slot on" data-slot="0" style="flex-basis:80px"></button>';
    return `<div class="card"><div class="timeline">${html}</div><div class="timeline-note">Before, after, or between your existing cards.</div></div><div class="virtual-actions"><button class="btn primary" data-action="lock-placement" ${pendingSlot===null?'disabled':''}>Lock Placement</button></div>`;
  }

  function revealScreen(){
    const virtual=cfg.playMode==='virtual';
    const result=virtual?(placementResult?.correct?'Correct placement':'Wrong position'):'Check your physical timeline';
    const resultClass=virtual?(placementResult?.correct?'ok':'bad'):'';
    const source=current?.song?.sourceLabel||current?.song?.source||modeName(roundDeck);
    return `${topLine(false,false)}${matchHeader()}${scoreStrip()}<h1 class="reveal-heading">Reveal</h1><div class="reveal-sub">${modeName(roundDeck)} · ${esc(activeTeam().name)}</div>
      <section class="card answer-card"><div class="answer-top"><div class="answer-art"></div><div><div class="answer-song">${esc(current?.song?.title||'Unknown')}</div><div class="answer-artist">${esc(current?.song?.artist||'')}</div></div></div><div class="answer-year">${current?.year||'----'}</div><div class="result-badge ${resultClass}">${esc(result)}</div></section>
      <div class="card reveal-help">${virtual?(placementResult?.correct?`It fits at that point in ${esc(activeTeam().name)}’s timeline. The card has been added.`:`It does not fit between those neighbouring years, so the card is discarded.`):`If ${current?.year} fits where ${esc(activeTeam().name)} placed the physical card, keep it. Otherwise discard it.`}</div>
      <div class="reveal-actions">${virtual?'':`<button class="btn ghost" data-action="discard">Discard</button><button class="btn primary" data-action="keep">Keep card</button>`}${virtual?`<button class="btn primary" data-action="next-turn">Next Team</button>`:''}<button class="btn text" data-action="open-track">Open song in ${current?.provider==='spotify'?'Spotify':'YouTube'}</button></div><div class="source-note">Catalogue source: ${esc(source)}</div>`;
  }

  function gameOverScreen(){const w=winner();return `${topLine(false,false)}<div class="kicker">GAME COMPLETE</div><h1 class="display title">${esc(w?.name||'Game')} <span class="mint">wins</span></h1><p class="subtitle">First to ${cfg.victory==='10'?'10 cards':'the finish'}.</p><div class="scoreboard">${match.teams.slice().sort((a,b)=>b.score-a.score).map((t,i)=>`<div class="card score-row ${i===0?'on':''}"><b>${i+1}. ${esc(t.name)}</b><strong>${t.score}</strong></div>`).join('')}</div><div class="hero-actions"><button class="btn primary" data-action="new-game">New Game</button></div>`}

  function musicSheet(){
    const sp=E.isSpotifyConnected();const selected=E.getSpotifyDevice();
    return `<div class="modal ${musicModal?'on':''}" id="musicModal"><div class="sheet"><div class="sheet-head"><h2>Music</h2><button class="close" data-action="close-music">×</button></div><div class="service-grid"><button class="service ${E.getProvider()==='spotify'?'on':''}" data-provider="spotify"><strong>Spotify</strong><small>${sp?'Connected · best hidden playback':'Premium account required'}</small></button><button class="service ${E.getProvider()==='youtube'?'on':''}" data-provider="youtube"><strong>YouTube</strong><small>No login · ads/player UI possible</small></button></div>
      <div class="spotify-controls ${E.getProvider()==='spotify'?'':'hidden'}">${sp?`<select id="deviceSelect"><option value="">Automatic device</option>${deviceList.map(d=>`<option value="${esc(d.id)}" ${selected===d.id?'selected':''}>${esc(d.name)} · ${esc(d.type)}${d.is_active?' · active':''}</option>`).join('')}</select><button class="btn ghost" data-action="refresh-devices">Refresh devices</button><button class="btn danger" data-action="disconnect-spotify">Disconnect Spotify</button>`:`<button class="btn primary" data-action="connect-spotify">Connect Spotify</button>`}</div>
      <div class="diagnostic">${E.getProvider()==='spotify'?'For reliable playback, open Spotify on the target phone or speaker and play/pause once. The app will automatically refresh tokens and recover the device when possible.':'YouTube playback is the universal fallback. A visible player is required and autoplay can be restricted by the browser.'}</div></div></div>`;
  }

  function bind(){
    root.querySelectorAll('[data-play]').forEach(b=>b.onclick=()=>{cfg.playMode=b.dataset.play;saveCfg();render()});
    root.querySelectorAll('[data-policy]').forEach(b=>b.onclick=()=>{cfg.deckPolicy=b.dataset.policy;saveCfg();render()});
    root.querySelectorAll('[data-deck]').forEach(b=>b.onclick=()=>{cfg.deck=b.dataset.deck;saveCfg();render()});
    root.querySelectorAll('[data-victory]').forEach(b=>b.onclick=()=>{cfg.victory=b.dataset.victory;saveCfg();render()});
    root.querySelectorAll('[data-round-deck]').forEach(b=>b.onclick=()=>{roundDeck=b.dataset.roundDeck;beginRound(roundDeck)});
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
      if(a==='abort-round')b.onclick=abortRound;
      if(a==='manual')b.onclick=manualCard;
      if(a==='play-current')b.onclick=playCurrent;
      if(a==='motion')b.onclick=enableMotion;
      if(a==='toggle-play')b.onclick=togglePlay;
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
      if(a==='back')b.onclick=()=>{screen=match?.active?'resume':'setup';render()};
    });
    const ds=document.getElementById('deviceSelect');if(ds)ds.onchange=()=>{E.setSpotifyDevice(ds.value);toast(ds.value?'Playback device saved.':'Device selection set to automatic.')};
    const modal=document.getElementById('musicModal');if(modal)modal.onclick=e=>{if(e.target===modal){musicModal=false;render()}};
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
    match={active:true,id:`g${Date.now()}`,round:0,turn:0,teams:Array.from({length:cfg.teams},(_,i)=>({name:`Team ${i+1}`,score:0,timeline:[]})),used:[],assign:{},virtualDeck:shuffle(Array.from({length:308},(_,i)=>i+1)),virtualPos:0};
    saveCfg();saveMatch();pendingSlot=null;placementResult=null;current=null;
    await requestMotion(false);
    nextRound();
  }

  function resumeMatch(){if(!match?.active){screen='setup';render();return}nextRound()}
  function newGame(){stopScanner();E.destroyYouTube();match=null;current=null;pendingSlot=null;placementResult=null;saveMatch();screen='setup';render()}
  function nextRound(){if(winner()){screen='gameover';render();return}current=null;pendingSlot=null;placementResult=null;playing=false;playNeedsTap=false;E.destroyYouTube();roundDeck=cfg.deck;if(cfg.deckPolicy==='each'){screen='deckpick';render()}else beginRound(cfg.deck)}

  async function beginRound(deck){roundDeck=deck;if(cfg.playMode==='physical'){screen='scanner';render()}else{const id=nextVirtualCard();await prepareCard(id)}}
  function nextVirtualCard(){if(match.virtualPos>=match.virtualDeck.length){match.virtualDeck=shuffle(Array.from({length:308},(_,i)=>i+1));match.virtualPos=0}const id=match.virtualDeck[match.virtualPos++];saveMatch();return id}

  async function prepareCard(cardId){
    const year=E.cardYear(cardId);if(!year){toast('That card has no year mapping.');return nextRound()}
    screen='loading';render();
    const assignKey=`${roundDeck}:${cardId}`;
    const excluded=[...(match.used||[])];
    let lastErr=null;
    for(let attempt=0;attempt<4;attempt++){
      try{
        let song=attempt===0?match.assign[assignKey]:null;
        if(!song){song=await E.chooseSong(year,roundDeck,excluded);match.assign[assignKey]=song;saveMatch()}
        const resolved=await E.resolveSong(song,E.getProvider());
        current={cardId,year,song,resolved,provider:E.getProvider(),deck:roundDeck};
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
    toast(errorText(lastErr));
    if(['NO_SPOTIFY_DEVICE','SPOTIFY_NOT_CONNECTED','SPOTIFY_REAUTH'].includes(lastErr?.code)){musicModal=true;screen='setup';render();return}
    if(cfg.playMode==='physical'){setTimeout(()=>{screen='scanner';render()},1200)}else{setTimeout(nextRound,1200)}
  }

  async function loadQr(){if(window.Html5Qrcode)return;await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s)})}
  async function startScanner(){if(screen!=='scanner'||scanning)return;try{await loadQr();scanner=new Html5Qrcode('reader');await scanner.start({facingMode:'environment'},{fps:12,qrbox:{width:260,height:260}},async text=>{if(!scanning)return;scanning=false;navigator.vibrate?.(35);await stopScanner();const id=E.parseCardId(text);if(!id){toast('That QR code is not one of the supported cards.');setTimeout(()=>{screen='scanner';render()},900);return}await prepareCard(id)},()=>{});scanning=true}catch(err){toast('Camera could not start. Allow camera access or enter the card number manually.') }}
  async function stopScanner(){if(!scanner)return;try{if(scanning)await scanner.stop()}catch{}try{await scanner.clear()}catch{}scanner=null;scanning=false}
  function manualCard(){const raw=prompt('Enter the card number (1–308) or paste its QR URL');const id=E.parseCardId(raw);if(!id){if(raw)toast('Card number not recognised.');return}stopScanner().finally(()=>prepareCard(id))}
  function abortRound(){stopScanner();screen='resume';render()}

  async function requestMotion(showToast=true){
    try{
      if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){const p=await DeviceOrientationEvent.requestPermission();if(p!=='granted')throw new Error('Motion permission not granted')}
      if(!motionReady){window.addEventListener('deviceorientation',onOrientation,{passive:true});motionReady=true}
      if(showToast)toast('Flip-to-start enabled.');return true;
    }catch{if(showToast)toast('Flip-to-start is unavailable. Use Start music instead.');return false}
  }
  function enableMotion(){requestMotion(true)}
  function onOrientation(e){const b=Number(e.beta),g=Number(e.gamma);if(!Number.isFinite(b)||!Number.isFinite(g))return;const down=Math.abs(b)>135&&Math.abs(g)<70,changed=down!==faceDown;faceDown=down;if(changed&&down&&screen==='ready'&&current?.provider==='spotify')playCurrent()}

  async function playCurrent(){
    if(!current||playing)return;
    screen='playing';render();
    try{
      if(current.provider==='spotify'){await E.playSpotify(current.resolved.uri);playing=true;playNeedsTap=false}
      else{const r=await E.playYouTube('youtubePlayer',current.resolved);playing=!!r.started;playNeedsTap=!!r.needsTap;if(playNeedsTap)toast('YouTube is ready. Tap the visible player to start audio.')}
    }catch(err){
      playing=false;
      if(err?.code==='YOUTUBE_PLAY_FAILED'){
        toast('That upload would not play. Swapping in another song from the same year.');
        await replaceCurrentSong();return;
      }
      toast(errorText(err));
      if(err?.code?.startsWith('SPOTIFY')){musicModal=true;render()}
    }
  }

  async function replaceCurrentSong(){
    if(!current)return;
    const {cardId,year}=current,assignKey=`${roundDeck}:${current.cardId}`;
    const excluded=[...(match.used||[]),E.songKey(current.song)];
    delete match.assign[assignKey];saveMatch();E.destroyYouTube();playing=false;
    screen='loading';render();
    let lastErr=null;
    for(let attempt=0;attempt<3;attempt++){
      try{
        const song=await E.chooseSong(year,roundDeck,excluded);
        const k=E.songKey(song);if(!excluded.includes(k))excluded.push(k);
        const resolved=await E.resolveSong(song,E.getProvider());
        match.assign[assignKey]=song;saveMatch();
        current={cardId,year,song,resolved,provider:E.getProvider(),deck:roundDeck};
        screen='ready';render();toast('A replacement track is ready.');return;
      }catch(err){lastErr=err}
    }
    toast(errorText(lastErr)||'No alternative song could be prepared.');
    if(cfg.playMode==='physical'){screen='scanner';render()}else nextRound();
  }

  async function togglePlay(){if(!current)return;if(current.provider==='youtube'){const p=E.youtubePlayer();try{const state=p?.getPlayerState?.();if(state===1){E.pauseYouTube();playing=false}else{E.resumeYouTube();playing=true}}catch{}}else{if(playing){await E.pauseSpotify();playing=false}else{await E.playSpotify(current.resolved.uri);playing=true}}}
  async function replay(){if(!current)return;try{if(current.provider==='youtube')E.replayYouTube();else await E.playSpotify(current.resolved.uri);playing=true}catch(err){toast(errorText(err))}}
  function stopPlayback(){if(!current)return;if(current.provider==='youtube')E.pauseYouTube();else E.pauseSpotify();playing=false}

  function selectSlot(slot){pendingSlot=slot;root.querySelectorAll('[data-slot]').forEach(x=>x.classList.toggle('on',Number(x.dataset.slot)===slot));const lock=root.querySelector('[data-action="lock-placement"]');if(lock)lock.disabled=false}
  function revealPhysical(){recordSongUsed();saveMatch();stopPlayback();screen='reveal';render()}
  function lockPlacement(){if(pendingSlot===null||!current)return;const years=[...(activeTeam().timeline||[])].sort((a,b)=>a-b),left=pendingSlot>0?years[pendingSlot-1]:null,right=pendingSlot<years.length?years[pendingSlot]:null;const correct=(left===null||left<=current.year)&&(right===null||current.year<=right);placementResult={correct,left,right,slot:pendingSlot};recordSongUsed();stopPlayback();if(correct){years.splice(pendingSlot,0,current.year);activeTeam().timeline=years;activeTeam().score++}screen='reveal';saveMatch();render()}
  function recordSongUsed(){const key=E.songKey(current.song);if(!match.used.includes(key))match.used.push(key)}
  function finishPhysical(keep){if(keep)activeTeam().score++;advanceTurn()}
  function finishVirtualTurn(){advanceTurn()}
  function advanceTurn(){match.turn=(match.turn+1)%match.teams.length;match.round++;saveMatch();if(winner()){screen='gameover';render()}else nextRound()}
  function openTrack(){const url=current?.resolved?.url;if(url)window.open(url,'_blank','noopener')}

  boot();
})();
