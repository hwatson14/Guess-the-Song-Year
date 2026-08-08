(() => {
  'use strict';
  const d=document;
  const originalProcess=typeof processCard==='function'?processCard:null;
  const originalShow=typeof showAnswer==='function'?showAnswer:null;
  const originalReset=typeof resetRound==='function'?resetRound:null;
  const originalNewGame=typeof newGame==='function'?newGame:null;

  const CFG_KEY='gsy.uiConfig.v4', MATCH_KEY='gsy.match.v4';
  const DEFAULT_CFG={playMode:'physical',deckPolicy:'fixed',deck:'greatest',teams:2,victory:'10'};
  let cfg=load(CFG_KEY,DEFAULT_CFG),match=load(MATCH_KEY,null);
  let scanner=null,scanning=false,motionEnabled=false,faceDown=false,phase='uxHome',countTimer=null,playTimer=null,elapsed=0;
  let startMethod=localStorage.getItem('gsy.startMode')||'flip',clipLength=localStorage.getItem('gsy.clipLength')||'full';
  let pendingSlot=null,roundDeck=cfg.deck;

  const q=id=>d.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const modeName=(id=mode)=>{try{return id==='number1'?'#1 US':(MODES[id]?.name||'Greatest Hits')}catch{return 'Greatest Hits'}};
  const musicName=()=>{try{return provider==='spotify'?'Spotify':'YouTube'}catch{return 'YouTube'}};
  const hasSpotify=()=>{try{return !!auth()}catch{return false}};
  const activeTeam=()=>match?.teams?.[match.turn]||{name:'Team 1',score:0,timeline:[]};
  const targetLabel=()=>cfg.victory==='unlimited'?'Unlimited':cfg.victory+' cards';
  const playLabel=()=>cfg.playMode==='virtual'?'Virtual':'Real cards';
  const deckPolicyLabel=()=>cfg.deckPolicy==='each'?'Choose each song':modeName(cfg.deck);

  function load(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}}
  function saveCfg(){localStorage.setItem(CFG_KEY,JSON.stringify(cfg))}
  function saveMatch(){if(match)localStorage.setItem(MATCH_KEY,JSON.stringify(match));else localStorage.removeItem(MATCH_KEY)}
  function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}

  function build(){
    d.body.classList.add('ux-flow');
    const shell=d.createElement('div');shell.id='uxShell';
    shell.innerHTML=`
      <section class="ux-screen on" id="uxHome">
        <div class="ux-record-corner"></div>
        <div class="ux-home-head"><div><div class="ux-kicker">✦ MUSIC TIMELINE GAME</div><h1 class="ux-home-title">Guess the<span>Song Year</span></h1><p class="ux-page-sub">Scan. Listen. Place. Reveal.</p></div><button class="ux-icon-btn" id="uxHomeMusic" aria-label="Music settings">♫</button></div>
        <div class="ux-card ux-start-card">
          <div class="ux-scan-art"><span>▶</span></div>
          <div class="ux-start-copy"><div class="ux-kicker" id="uxHomeState">NEW GAME</div><h2 id="uxHomeActionTitle">Set up a game</h2><p id="uxHomeActionCopy">Choose real cards or virtual play, teams, deck and victory target.</p><button class="ux-btn primary" id="uxHomePrimary">New Game</button><button class="ux-btn ghost hidden" id="uxResume">Resume Game</button></div>
        </div>
        <div class="ux-section-label">Current setup</div>
        <div class="ux-card ux-summary-grid">
          <div><small>PLAY</small><strong id="uxSummaryPlay">Real cards</strong></div><div><small>DECK</small><strong id="uxSummaryDeck">Greatest Hits</strong></div><div><small>TEAMS</small><strong id="uxSummaryTeams">2</strong></div><div><small>WIN</small><strong id="uxSummaryTarget">10 cards</strong></div>
        </div>
        <div class="ux-section-label ux-how-label">How it works</div>
        <div class="ux-steps"><div class="ux-step"><b>1</b><span id="uxStep1">Scan</span></div><div class="ux-step"><b>2</b><span>Listen</span></div><div class="ux-step"><b>3</b><span>Place</span></div><div class="ux-step"><b>4</b><span>Reveal</span></div></div>
      </section>

      <section class="ux-screen" id="uxSetup">
        <div class="ux-page-head"><button class="ux-back" data-back="home">‹</button><div><div class="ux-kicker">NEW GAME</div><h1 class="ux-page-title">Game Setup</h1><p class="ux-page-sub">Set the table once, then get out of the way.</p></div></div>

        <div class="ux-section-label">Play style</div>
        <div class="ux-choice-grid" id="uxPlayMode">
          <button class="ux-choice" data-play="physical"><div class="ux-choice-icon">⌗</div><strong>Real cards</strong><span>Scan the QR on each physical card.</span></button>
          <button class="ux-choice" data-play="virtual"><div class="ux-choice-icon">◇</div><strong>Virtual</strong><span>The app deals cards and you place them on-screen.</span></button>
        </div>

        <div class="ux-section-label">Deck</div>
        <div class="ux-card ux-policy-row"><div><strong>Deck selection</strong><span>Lock one deck, or choose before every song.</span></div><div class="ux-segment compact" id="uxDeckPolicy"><button data-policy="fixed">Fixed</button><button data-policy="each">Every song</button></div></div>
        <div id="uxFixedDeckWrap"><div class="ux-deck-list" id="uxSetupDecks"></div></div>

        <div class="ux-section-label">Teams</div>
        <div class="ux-card ux-stepper-row"><div><strong>Number of teams</strong><span>Turns rotate automatically.</span></div><div class="ux-stepper"><button id="uxTeamsMinus">−</button><b id="uxTeamsCount">2</b><button id="uxTeamsPlus">+</button></div></div>

        <div class="ux-section-label">Victory target</div>
        <div class="ux-segment" id="uxVictory"><button data-victory="10">10 cards</button><button data-victory="unlimited">Unlimited</button></div>

        <div class="ux-section-label">Music</div>
        <button class="ux-card ux-music-row" id="uxSetupMusic"><span class="ux-service-icon">♪</span><span><strong id="uxSetupMusicName">Spotify</strong><small id="uxSetupMusicState">Not connected</small></span><span class="ux-chevron">›</span></button>

        <button class="ux-btn primary ux-start-game" id="uxStartGame">Start Game</button>
      </section>

      <section class="ux-screen" id="uxRoundDeck">
        <div class="ux-page-head"><div><div class="ux-kicker" id="uxRoundTeamKicker">TEAM 1</div><h1 class="ux-page-title">Choose a Deck</h1><p class="ux-page-sub">Pick the vibe for this song.</p></div></div>
        <div class="ux-deck-list" id="uxRoundDecks"></div>
      </section>

      <section class="ux-screen ux-full" id="uxScanner">
        <div class="ux-camera"><div id="uxReader"></div><div class="ux-camera-shade"></div></div>
        <div class="ux-camera-head"><div class="ux-camera-brand">Guess the Song Year</div><button class="ux-camera-setting" id="uxScannerExit">×</button></div>
        <div class="ux-camera-copy"><strong id="uxScannerTeam">Team 1</strong><span>Scan the QR code on the back of a card</span></div>
        <div class="ux-scan-frame"><i class="ux-corner tl"></i><i class="ux-corner tr"></i><i class="ux-corner bl"></i><i class="ux-corner br"></i><i class="ux-laser"></i></div>
        <div class="ux-camera-chip" id="uxScannerChip">Greatest Hits • 0 cards</div>
        <div class="ux-camera-actions"><div class="ux-round-action"><button id="uxTorch">☼</button><span>Torch</span></div><div class="ux-round-action"><button id="uxManual">#</button><span>Enter code</span></div></div>
      </section>

      <section class="ux-screen ux-centered" id="uxLoading">
        <div class="ux-kicker">SONG LOCKED</div><div class="ux-loader-ring"></div><h1 class="ux-ready-title">Finding the track</h1><p class="ux-page-sub">Preparing a ${musicName()} version while keeping the answer hidden.</p>
      </section>

      <section class="ux-screen" id="uxReady">
        <div class="ux-kicker">✦ &nbsp; <span id="uxReadySource">CARD SCANNED</span></div><h1 class="ux-ready-title">Ready to play</h1>
        <div class="ux-phone-art"><div class="ux-phone-body"></div><div class="ux-orbit"></div></div>
        <div class="ux-ready-copy"><h2>Flip your phone</h2><p>Music starts when the screen is face-down.</p></div>
        <div class="ux-lock-chip">▣ &nbsp; <span id="uxReadyCard">Card 01</span> • song locked</div>
        <button class="ux-countdown-link" id="uxUseCountdown">Use 3 second countdown instead</button>
        <div class="ux-team-strip"><span id="uxReadyTeam">Team 1</span><b id="uxReadyScore">0 cards</b></div>
      </section>

      <section class="ux-screen ux-centered" id="uxCountdown"><div class="ux-kicker">GET READY</div><div class="ux-count-number" id="uxCountNumber">3</div><p class="ux-page-sub">Hide the screen before the music starts.</p></section>

      <section class="ux-screen" id="uxPlaying">
        <div class="ux-playing-head"><div><div class="ux-kicker" id="uxPlayingTeam">TEAM 1</div><h1 class="ux-playing-title">Now Playing</h1></div><div class="ux-score-pill" id="uxPlayingScore">0</div></div>
        <div class="ux-device-line" id="uxPlayingDevice">Music device • metadata hidden</div>
        <div class="ux-wave-card"><div class="ux-wave-lines"></div><button class="ux-pause" id="uxPause">Ⅱ</button><div class="ux-progressbar"><span id="uxPlayProgress"></span></div><div class="ux-progress-time" id="uxElapsed">0:00</div></div>
        <div id="uxYoutubeHost" class="ux-youtube-host"></div>
        <div class="ux-place"><h2 id="uxPlaceTitle">Place the card on your timeline</h2><p id="uxPlaceCopy">Use the physical cards already on the table. No example years are shown here.</p></div>
        <div class="ux-abstract-table" id="uxPhysicalHint"><span></span><span></span><i></i><span></span><span></span></div>
        <button class="ux-replay" id="uxReplay">↻ &nbsp; Replay clip</button>
        <button class="ux-btn primary ux-reveal-btn" id="uxPlaceOrReveal">Reveal Answer</button><div class="ux-reveal-note" id="uxPlayingNote">Reveal only after the card has been placed.</div>
      </section>

      <section class="ux-screen" id="uxVirtualPlace">
        <div class="ux-playing-head"><div><div class="ux-kicker" id="uxPlaceTeam">TEAM 1</div><h1 class="ux-page-title">Place the Song</h1><p class="ux-page-sub">Tap a gap where you think this song belongs.</p></div></div>
        <div class="ux-card ux-timeline-card"><div class="ux-timeline" id="uxTimeline"></div></div>
        <div class="ux-selection-copy" id="uxSelectionCopy">Choose a position to continue.</div>
        <button class="ux-btn primary" id="uxLockPlacement" disabled>Lock In Placement</button>
        <button class="ux-replay" id="uxPlaceReplay">↻ &nbsp; Replay clip</button>
      </section>

      <section class="ux-screen" id="uxReveal">
        <div class="ux-record-corner"></div><div class="ux-kicker" id="uxRevealKicker">GREATEST HITS • TEAM 1</div><h1 class="ux-reveal-heading">Reveal</h1>
        <div class="ux-card ux-answer-card"><div class="ux-answer-top"><div class="ux-cover-art"></div><div><div class="ux-answer-song" id="uxAnswerSong">Song</div><div class="ux-answer-artist" id="uxAnswerArtist">Artist</div></div></div><div class="ux-answer-year" id="uxAnswerYear">1996</div><div class="ux-result-line" id="uxResultLine">Check where you placed it.</div></div>
        <div id="uxPhysicalResult">
          <div class="ux-section-label">Check the table</div><div class="ux-card ux-check-card"><div class="ux-check-icon">▦</div><div><strong id="uxCheckCopy">If the year fits where you placed the card, keep it.</strong><span>Otherwise discard it. The physical timeline decides.</span></div></div>
          <div class="ux-result-actions"><button class="ux-btn success" id="uxKeepCard">Keep card +1</button><button class="ux-btn ghost" id="uxDiscardCard">Discard</button></div>
        </div>
        <div id="uxVirtualResult" class="hidden"><div class="ux-card ux-result-card"><strong id="uxVirtualVerdict">Correct!</strong><span id="uxVirtualExplain">Your placement fits the timeline.</span></div><button class="ux-btn primary" id="uxVirtualNext">Next Team</button></div>
        <button class="ux-open-music" id="uxOpenTrack">♫ &nbsp; Show song in music app</button>
      </section>

      <section class="ux-screen" id="uxWin">
        <div class="ux-record-corner"></div><div class="ux-win-mark">✦</div><div class="ux-kicker">GAME COMPLETE</div><h1 class="ux-win-title" id="uxWinner">Team 1 wins</h1><p class="ux-page-sub" id="uxWinCopy">First to 10 cards.</p><div class="ux-card ux-scoreboard" id="uxScoreboard"></div><button class="ux-btn primary" id="uxPlayAgain">Play Again</button><button class="ux-btn ghost" id="uxWinHome">Home</button>
      </section>

      <section class="ux-screen" id="uxMusic">
        <div class="ux-page-head"><button class="ux-back" id="uxMusicBack">‹</button><div><div class="ux-kicker">PLAYBACK</div><h1 class="ux-page-title">Music</h1><p class="ux-page-sub">Choose how songs play.</p></div></div>
        <div class="ux-section-label">Service</div>
        <button class="ux-card ux-service" id="uxSpotifyService"><span class="ux-service-icon spotify">♪</span><span><strong>Spotify</strong><small id="uxSpotifyState">Not connected</small></span><b class="ux-service-check" id="uxSpotifyCheck"></b></button>
        <button class="ux-card ux-service" id="uxYoutubeService"><span class="ux-service-icon youtube">▶</span><span><strong>YouTube</strong><small id="uxYoutubeState">Ready • video UI may appear</small></span><b class="ux-service-check" id="uxYoutubeCheck"></b></button>
        <div class="ux-section-label">Playback</div><div class="ux-segment" id="uxClipLength"><button data-clip="full">Full track</button><button data-clip="30">30 sec</button></div>
        <div class="ux-section-label">Device</div><button class="ux-card ux-device-card" id="uxChangeDevice"><span class="ux-speaker-icon">▥</span><span><strong id="uxDeviceName">This device</strong><small id="uxDeviceSub">Playback device</small></span><span class="ux-chevron">›</span></button>
        <div class="ux-section-label">Hide track info</div><div class="ux-card ux-hide-card"><div><strong>Start with screen hidden</strong><span>Prevents the phone from giving away the answer.</span></div><div class="ux-segment" id="uxStartMethod"><button data-start="flip">Gyroscope</button><button data-start="countdown">3 sec</button></div></div>
        <button class="ux-btn primary" id="uxMusicDone">Done</button><button class="ux-text-btn" id="uxAdvanced">Advanced setup & diagnostics</button>
      </section>

      <div class="ux-sheet" id="uxDeckSheet"><div class="ux-sheet-card"><div class="ux-sheet-head"><div><div class="ux-kicker">DECK</div><h2>Choose a deck</h2></div><button class="ux-sheet-close" id="uxDeckSheetClose">×</button></div><div class="ux-deck-list" id="uxAllModes"></div></div></div>
    `;
    d.body.appendChild(shell);
    buildDeckLists();bind();renderAll();
    try{if(E?.ytWrap)q('uxYoutubeHost').appendChild(E.ytWrap)}catch{}
  }

  function buildDeckLists(){
    const ids=()=>{try{return Object.keys(MODES)}catch{return ['greatest','australian','unexpected']}};
    const make=(box,click)=>{box.innerHTML='';ids().forEach(id=>{const m=MODES[id];const b=d.createElement('button');b.className='ux-card ux-deck';b.dataset.mode=id;const cls=id==='australian'?'australian':id==='unexpected'?'unexpected':id==='number1'?'number1':id==='rock'?'rock':id==='party'?'party':'greatest';b.innerHTML=`<div class="ux-deck-art ${cls}"></div><div><h3>${esc(modeName(id))}</h3><p>${esc(m?.desc||'')}</p></div><span class="ux-deck-check">›</span>`;b.onclick=()=>click(id);box.appendChild(b)})};
    make(q('uxSetupDecks'),id=>{cfg.deck=id;saveCfg();renderAll()});
    make(q('uxRoundDecks'),id=>selectRoundDeck(id));
    make(q('uxAllModes'),id=>{cfg.deck=id;saveCfg();q('uxDeckSheet').classList.remove('on');renderAll()});
  }

  function bind(){
    q('uxHomePrimary').onclick=()=>setScreen('uxSetup');q('uxResume').onclick=resumeMatch;q('uxHomeMusic').onclick=()=>openMusic('uxHome');
    d.querySelectorAll('[data-back="home"]').forEach(x=>x.onclick=()=>setScreen('uxHome'));
    d.querySelectorAll('#uxPlayMode [data-play]').forEach(x=>x.onclick=()=>{cfg.playMode=x.dataset.play;saveCfg();renderAll()});
    d.querySelectorAll('#uxDeckPolicy [data-policy]').forEach(x=>x.onclick=()=>{cfg.deckPolicy=x.dataset.policy;saveCfg();renderAll()});
    q('uxTeamsMinus').onclick=()=>{cfg.teams=Math.max(1,Number(cfg.teams)-1);saveCfg();renderAll()};q('uxTeamsPlus').onclick=()=>{cfg.teams=Math.min(6,Number(cfg.teams)+1);saveCfg();renderAll()};
    d.querySelectorAll('#uxVictory [data-victory]').forEach(x=>x.onclick=()=>{cfg.victory=x.dataset.victory;saveCfg();renderAll()});
    q('uxSetupMusic').onclick=()=>openMusic('uxSetup');q('uxStartGame').onclick=startNewMatch;
    q('uxScannerExit').onclick=()=>{stopScanner();endMatchToHome()};q('uxTorch').onclick=()=>toast('Torch control depends on browser camera support.');q('uxManual').onclick=manualScan;
    q('uxUseCountdown').onclick=startCountdown;q('uxPause').onclick=togglePause;q('uxReplay').onclick=replay;q('uxPlaceReplay').onclick=replay;q('uxPlaceOrReveal').onclick=playingPrimary;
    q('uxLockPlacement').onclick=lockPlacement;q('uxKeepCard').onclick=()=>scorePhysical(true);q('uxDiscardCard').onclick=()=>scorePhysical(false);q('uxVirtualNext').onclick=advanceTurn;q('uxOpenTrack').onclick=openTrack;
    q('uxSpotifyService').onclick=selectSpotify;q('uxYoutubeService').onclick=()=>{try{selectProvider('youtube')}catch{};renderAll()};
    d.querySelectorAll('#uxClipLength [data-clip]').forEach(x=>x.onclick=()=>{clipLength=x.dataset.clip;localStorage.setItem('gsy.clipLength',clipLength);renderAll()});
    d.querySelectorAll('#uxStartMethod [data-start]').forEach(x=>x.onclick=()=>{startMethod=x.dataset.start;localStorage.setItem('gsy.startMode',startMethod);renderAll()});
    q('uxChangeDevice').onclick=changeDevice;q('uxMusicDone').onclick=closeMusic;q('uxAdvanced').onclick=openAdvanced;
    q('uxPlayAgain').onclick=()=>setScreen('uxSetup');q('uxWinHome').onclick=endMatchToHome;
    q('uxDeckSheetClose').onclick=()=>q('uxDeckSheet').classList.remove('on');q('uxDeckSheet').onclick=e=>{if(e.target===q('uxDeckSheet'))q('uxDeckSheet').classList.remove('on')};
    d.addEventListener('visibilitychange',()=>{if(d.hidden&&scanning)stopScanner()});
  }

  let musicReturn='uxSetup';
  function openMusic(returnTo){musicReturn=returnTo;setScreen('uxMusic')}
  function closeMusic(){setScreen(musicReturn||'uxSetup')}
  function setScreen(id){d.querySelectorAll('.ux-screen').forEach(x=>x.classList.toggle('on',x.id===id));phase=id;window.scrollTo({top:0,behavior:'instant'});renderAll()}
  function toast(text){q('uxTempToast')?.remove();const x=d.createElement('div');x.id='uxTempToast';x.className='ux-toast';x.textContent=text;d.body.appendChild(x);setTimeout(()=>x.remove(),4200)}
  function openAdvanced(){d.body.classList.remove('ux-flow');q('uxShell').style.display='none';try{view('settings')}catch{}}
  window.gsyReturnToGame=()=>{try{view('play')}catch{};d.body.classList.add('ux-flow');q('uxShell').style.display='';setScreen('uxHome')};

  function renderAll(){
    q('uxSummaryPlay').textContent=playLabel();q('uxSummaryDeck').textContent=deckPolicyLabel();q('uxSummaryTeams').textContent=cfg.teams;q('uxSummaryTarget').textContent=targetLabel();q('uxStep1').textContent=cfg.playMode==='virtual'?'Deal':'Scan';
    q('uxResume').classList.toggle('hidden',!match?.active);q('uxHomeState').textContent=match?.active?'GAME IN PROGRESS':'NEW GAME';q('uxHomeActionTitle').textContent=match?.active?'Ready for another turn?':'Set up a game';q('uxHomeActionCopy').textContent=match?.active?`${activeTeam().name} is up next.`:'Choose real cards or virtual play, teams, deck and victory target.';
    d.querySelectorAll('#uxPlayMode [data-play]').forEach(x=>x.classList.toggle('selected',x.dataset.play===cfg.playMode));d.querySelectorAll('#uxDeckPolicy [data-policy]').forEach(x=>x.classList.toggle('on',x.dataset.policy===cfg.deckPolicy));q('uxFixedDeckWrap').classList.toggle('hidden',cfg.deckPolicy!=='fixed');
    d.querySelectorAll('#uxSetupDecks [data-mode]').forEach(x=>x.classList.toggle('selected',x.dataset.mode===cfg.deck));q('uxTeamsCount').textContent=cfg.teams;d.querySelectorAll('#uxVictory [data-victory]').forEach(x=>x.classList.toggle('on',x.dataset.victory===cfg.victory));
    q('uxSetupMusicName').textContent=musicName();q('uxSetupMusicState').textContent=provider==='spotify'?(hasSpotify()?'Connected':'Tap to connect'):'Ready • ads/video UI may appear';
    const connected=hasSpotify();q('uxSpotifyState').textContent=connected?'Connected':'Not connected';q('uxSpotifyCheck').textContent=provider==='spotify'&&connected?'✓':'';q('uxYoutubeCheck').textContent=provider==='youtube'?'✓':'';
    d.querySelectorAll('#uxClipLength [data-clip]').forEach(x=>x.classList.toggle('on',x.dataset.clip===clipLength));d.querySelectorAll('#uxStartMethod [data-start]').forEach(x=>x.classList.toggle('on',x.dataset.start===startMethod));
    const dev=getDeviceInfo();q('uxDeviceName').textContent=dev.name;q('uxDeviceSub').textContent=dev.sub;
    if(match?.active){const t=activeTeam();const idx=match.turn+1;q('uxRoundTeamKicker').textContent=`TEAM ${idx} • ${t.score} CARDS`;q('uxScannerTeam').textContent=t.name;q('uxScannerChip').textContent=`${modeName(roundDeck)} • ${t.score} cards`;q('uxReadyTeam').textContent=t.name;q('uxReadyScore').textContent=t.score+' cards';q('uxPlayingTeam').textContent=t.name.toUpperCase();q('uxPlayingScore').textContent=t.score;q('uxPlaceTeam').textContent=t.name.toUpperCase()}
  }
  function getDeviceInfo(){try{const opt=E?.device?.selectedOptions?.[0];if(provider==='spotify'&&opt&&opt.value)return{name:opt.textContent||'Spotify device',sub:'Spotify Connect'};if(provider==='spotify')return{name:'Active Spotify device',sub:'Spotify Connect'};return{name:'This phone',sub:'YouTube player'}}catch{return{name:'This device',sub:'Playback device'}}}

  async function startNewMatch(){
    if(provider==='spotify'&&!hasSpotify()){openMusic('uxSetup');toast('Connect Spotify once, or choose YouTube.');return}
    try{game={history:[],used:[],assign:{}};saveGame?.();originalReset?.()}catch{}
    cfg.teams=Math.max(1,Math.min(6,Number(cfg.teams)||1));saveCfg();
    match={active:true,turn:0,round:0,teams:Array.from({length:cfg.teams},(_,i)=>({name:cfg.teams===1?'Solo':`Team ${i+1}`,score:0,timeline:[]})),virtualOrder:shuffle(Array.from({length:308},(_,i)=>i+1)),virtualPos:0};saveMatch();
    try{ensureCatalog?.().catch(()=>{})}catch{}
    await requestMotion();startTurn();
  }
  function resumeMatch(){if(!match?.active)return setScreen('uxSetup');startTurn()}
  function endMatchToHome(){stopScanner();clearInterval(playTimer);match=null;saveMatch();setScreen('uxHome')}
  function startTurn(){pendingSlot=null;roundDeck=cfg.deck;if(cfg.deckPolicy==='each')setScreen('uxRoundDeck');else launchRound()}
  function selectRoundDeck(id){roundDeck=id;try{selectMode(id)}catch{};launchRound()}
  function launchRound(){try{selectMode(roundDeck)}catch{};if(cfg.playMode==='physical')startScanner();else dealVirtual()}
  function dealVirtual(){if(!match?.virtualOrder?.length||match.virtualPos>=match.virtualOrder.length){match.virtualOrder=shuffle(Array.from({length:308},(_,i)=>i+1));match.virtualPos=0}const id=match.virtualOrder[match.virtualPos++];saveMatch();handleCard(String(id),'virtual')}

  async function loadQr(){if(window.Html5Qrcode)return;await new Promise((res,rej)=>{const s=d.createElement('script');s.src='https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';s.onload=res;s.onerror=rej;d.head.appendChild(s)})}
  async function startScanner(){
    if(provider==='spotify'&&!hasSpotify()){openMusic('uxSetup');toast('Connect Spotify first, or choose YouTube.');return}
    setScreen('uxScanner');try{await loadQr();if(scanner){try{await scanner.clear()}catch{}}scanner=new Html5Qrcode('uxReader');await scanner.start({facingMode:'environment'},{fps:12,qrbox:{width:260,height:320},aspectRatio:.72},async text=>{if(!scanning)return;scanning=false;navigator.vibrate?.(40);await stopScanner();await handleCard(text,'physical')},()=>{});scanning=true}catch(e){setScreen('uxHome');toast('Camera could not start. Allow camera access and try again.')}
  }
  async function stopScanner(){if(!scanner)return;try{if(scanning)await scanner.stop()}catch{}try{await scanner.clear()}catch{}scanning=false}
  function manualScan(){const v=prompt('Enter card ID or paste its QR URL');if(v){stopScanner();handleCard(v.trim(),'physical')}}

  async function handleCard(raw,source){
    let id=null;try{id=parseId(raw)}catch{};if(!id){toast('That card is not supported.');if(source==='physical')setTimeout(startScanner,900);return}
    setScreen('uxLoading');
    try{
      let saved=null;try{if(provider==='spotify'&&typeof spotifyPlay==='function'){saved=spotifyPlay;spotifyPlay=async()=>null}await originalProcess(raw)}finally{if(saved)spotifyPlay=saved}
      if(!current)throw new Error('No song could be selected');
      q('uxReadySource').textContent=source==='virtual'?'VIRTUAL CARD DEALT':'CARD SCANNED';q('uxReadyCard').textContent=`${source==='virtual'?'Virtual card':'Card'} ${String(match.round+1).padStart(2,'0')}`;setScreen('uxReady');
      if(startMethod==='countdown')setTimeout(startCountdown,350);else if(faceDown)beginPlayback();
    }catch(e){toast(e?.message||String(e));setTimeout(()=>{source==='physical'?startScanner():startTurn()},1400)}
  }

  async function requestMotion(){if(startMethod!=='flip')return false;try{if(typeof DeviceMotionEvent!=='undefined'&&typeof DeviceMotionEvent.requestPermission==='function'){const p=await DeviceMotionEvent.requestPermission();if(p!=='granted')return false}if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){const p=await DeviceOrientationEvent.requestPermission();if(p!=='granted')return false}if(!motionEnabled){window.addEventListener('deviceorientation',onOrientation,{passive:true});window.addEventListener('devicemotion',onMotion,{passive:true})}motionEnabled=true;return true}catch{return false}}
  function onOrientation(e){const b=Number(e.beta),g=Number(e.gamma);if(!Number.isFinite(b)||!Number.isFinite(g))return;const down=Math.abs(b)>135&&Math.abs(g)<70,was=faceDown;faceDown=down;if(phase==='uxReady'&&faceDown&&!was&&startMethod==='flip')beginPlayback()}
  function onMotion(e){const z=e.accelerationIncludingGravity?.z;if(phase==='uxReady'&&startMethod==='flip'&&faceDown&&typeof z==='number'&&Math.abs(z)>7)beginPlayback()}
  function startCountdown(){clearInterval(countTimer);setScreen('uxCountdown');let n=3;q('uxCountNumber').textContent=n;countTimer=setInterval(()=>{n--;if(n<=0){clearInterval(countTimer);countTimer=null;beginPlayback()}else q('uxCountNumber').textContent=n},850)}

  async function beginPlayback(){
    if(!current||phase==='uxPlaying')return;try{if(provider==='youtube'){try{E?.ytWrap?.classList.remove('hidden')}catch{};await startYoutubePlayback()}else if(current?.resolved?.uri){await spotifyPlay(current.resolved.uri)}elapsed=0;startPlayTimer();const dev=getDeviceInfo();q('uxPlayingDevice').textContent=provider==='spotify'?dev.name+' • track details hidden':dev.name+' • YouTube player visible';
      const virtual=cfg.playMode==='virtual';q('uxPlaceTitle').textContent=virtual?'Listen, then place it in your timeline':'Place the card on your timeline';q('uxPlaceCopy').textContent=virtual?'When you are ready, choose the gap where this song belongs.':'Use the physical cards on the table. The app deliberately shows no example years.';q('uxPhysicalHint').classList.toggle('hidden',virtual);q('uxPlaceOrReveal').textContent=virtual?'Place on Timeline':'Reveal Answer';q('uxPlayingNote').textContent=virtual?'The year stays hidden until you lock your placement.':'Reveal only after the physical card has been placed.';setScreen('uxPlaying')
    }catch(e){toast(e?.message||String(e))}
  }
  function startPlayTimer(){clearInterval(playTimer);q('uxElapsed').textContent='0:00';q('uxPlayProgress').style.width='2%';playTimer=setInterval(()=>{elapsed++;q('uxElapsed').textContent=Math.floor(elapsed/60)+':'+String(elapsed%60).padStart(2,'0');const denom=clipLength==='30'?30:180;q('uxPlayProgress').style.width=Math.min(100,(elapsed/denom)*100)+'%';if(clipLength==='30'&&elapsed>=30){clearInterval(playTimer);playTimer=null;pausePlayback()}},1000)}
  function pausePlayback(){try{if(provider==='youtube'&&ytPlayer?.pauseVideo)ytPlayer.pauseVideo()}catch{}clearInterval(playTimer)}
  function togglePause(){try{if(provider==='youtube'&&ytPlayer?.pauseVideo){ytPlayer.pauseVideo();q('uxPause').textContent='▶';clearInterval(playTimer)}else toast('Use the Spotify device to pause if needed.')}catch{}}
  async function replay(){try{if(provider==='youtube'&&ytPlayer?.seekTo){ytPlayer.seekTo(0,true);ytPlayer.playVideo();q('uxPause').textContent='Ⅱ'}else if(provider==='spotify'&&current?.resolved?.uri)await spotifyPlay(current.resolved.uri);elapsed=0;startPlayTimer()}catch(e){toast(e?.message||String(e))}}
  function playingPrimary(){if(cfg.playMode==='virtual'){renderVirtualTimeline();setScreen('uxVirtualPlace')}else revealPhysical()}

  function renderVirtualTimeline(){
    pendingSlot=null;q('uxLockPlacement').disabled=true;q('uxSelectionCopy').textContent='Choose a position to continue.';const box=q('uxTimeline');box.innerHTML='';const years=[...(activeTeam().timeline||[])].sort((a,b)=>a-b);
    for(let i=0;i<=years.length;i++){
      const slot=d.createElement('button');slot.className='ux-timeline-slot';slot.dataset.slot=i;slot.innerHTML='<span>＋</span>';slot.onclick=()=>selectSlot(i);box.appendChild(slot);
      if(i<years.length){const card=d.createElement('div');card.className='ux-timeline-year';card.innerHTML=`<small>${i+1}</small><strong>${years[i]}</strong>`;box.appendChild(card)}
    }
  }
  function selectSlot(i){pendingSlot=i;d.querySelectorAll('.ux-timeline-slot').forEach(x=>x.classList.toggle('selected',Number(x.dataset.slot)===i));q('uxLockPlacement').disabled=false;const years=[...(activeTeam().timeline||[])].sort((a,b)=>a-b);const left=i===0?'start':years[i-1],right=i===years.length?'end':years[i];q('uxSelectionCopy').textContent=`Locked between ${left} and ${right}.`}
  function lockPlacement(){if(pendingSlot===null)return;revealVirtual()}

  function baseReveal(){clearInterval(playTimer);pausePlayback();try{originalShow?.()}catch{};const y=Number(current?.year)||0;q('uxRevealKicker').textContent=`${modeName(roundDeck).toUpperCase()} • ${activeTeam().name.toUpperCase()}`;q('uxAnswerSong').textContent=current?.candidate?.title||'Unknown song';q('uxAnswerArtist').textContent=current?.candidate?.artist||'';q('uxAnswerYear').textContent=y;setScreen('uxReveal');return y}
  function revealPhysical(){const y=baseReveal();q('uxPhysicalResult').classList.remove('hidden');q('uxVirtualResult').classList.add('hidden');q('uxResultLine').textContent=`Does ${y} fit where you placed the card?`;q('uxCheckCopy').textContent=`If ${y} fits where you placed it, keep the card.`}
  function revealVirtual(){const y=baseReveal();q('uxPhysicalResult').classList.add('hidden');q('uxVirtualResult').classList.remove('hidden');const years=[...(activeTeam().timeline||[])].sort((a,b)=>a-b),i=pendingSlot,left=i===0?-Infinity:years[i-1],right=i===years.length?Infinity:years[i];const ok=y>=left&&y<=right;q('uxVirtualVerdict').textContent=ok?'Correct!':'Not quite';q('uxVirtualVerdict').classList.toggle('bad',!ok);q('uxVirtualExplain').textContent=ok?`${y} fits exactly where you placed it.`:`${y} belongs somewhere else on the timeline.`;q('uxResultLine').textContent=ok?'Timeline confirmed.':'Placement missed.';if(ok){activeTeam().score++;activeTeam().timeline.push(y);activeTeam().timeline.sort((a,b)=>a-b);saveMatch();checkWinner()}}
  function scorePhysical(keep){if(keep){activeTeam().score++;saveMatch();if(checkWinner())return}advanceTurn()}
  function checkWinner(){if(cfg.victory==='unlimited')return false;const goal=Number(cfg.victory)||10;if(activeTeam().score<goal)return false;showWinner(activeTeam());return true}
  function showWinner(team){match.active=false;saveMatch();q('uxWinner').textContent=team.name+' wins';q('uxWinCopy').textContent=`First to ${cfg.victory} cards.`;const box=q('uxScoreboard');box.innerHTML=match.teams.map((t,i)=>`<div class="ux-score-row"><b>${i+1}</b><span>${esc(t.name)}</span><strong>${t.score}</strong></div>`).join('');setScreen('uxWin')}
  function advanceTurn(){try{originalReset?.()}catch{};pendingSlot=null;if(!match?.active)return;match.turn=(match.turn+1)%match.teams.length;match.round++;saveMatch();startTurn()}
  function openTrack(){try{const a=E?.providerLink;if(a?.href&&a.href!=='#'){window.open(a.href,'_blank','noopener');return}}catch{}toast('Open the connected music app to view this track.')}

  async function selectSpotify(){try{selectProvider('spotify')}catch{};if(hasSpotify()){renderAll();return}try{if(typeof login==='function'){await login();return}}catch{}toast('Spotify could not start authorization.')}
  async function changeDevice(){try{if(provider==='spotify'&&hasSpotify()&&typeof devices==='function'){await devices();renderAll();toast('Spotify devices refreshed.');return}}catch(e){toast(e?.message||String(e))}openAdvanced()}

  build();
})();
