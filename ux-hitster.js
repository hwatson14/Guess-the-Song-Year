(() => {
  'use strict';
  const d=document;
  const originalProcess=typeof processCard==='function'?processCard:null;
  const originalShow=typeof showAnswer==='function'?showAnswer:null;
  const originalReset=typeof resetRound==='function'?resetRound:null;
  const originalNewGame=typeof newGame==='function'?newGame:null;
  let scanner=null,scanning=false,motionEnabled=false,faceDown=false,phase='uxHome',countTimer=null,playTimer=null,elapsed=0;
  let target=Number(localStorage.getItem('gsy.target')||10),shared=localStorage.getItem('gsy.shared')==='1';
  let startMethod=localStorage.getItem('gsy.startMode')||'flip',clipLength=localStorage.getItem('gsy.clipLength')||'full';

  const q=id=>d.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const modeName=()=>{try{if(mode==='number1')return '#1 US';return MODES[mode]?.name||'Greatest Hits'}catch{return 'Greatest Hits'}};
  const musicName=()=>{try{return provider==='spotify'?'Spotify':'YouTube'}catch{return 'YouTube'}};
  const hasSpotify=()=>{try{return !!auth()}catch{return false}};
  const gameCount=()=>{try{return Number(game?.history?.length||0)}catch{return 0}};
  const cardNumber=()=>Math.min(target,gameCount()+1);

  function build(){
    d.body.classList.add('ux-flow');
    const shell=d.createElement('div');shell.id='uxShell';
    shell.innerHTML=`
      <section class="ux-screen on" id="uxHome">
        <div class="ux-record-corner"></div>
        <h1 class="ux-home-title">Guess the<span>Song Year</span></h1>
        <div class="ux-home-tagline">Scan. Listen. Place. Reveal.</div>
        <div class="ux-card glow ux-start-card">
          <div class="ux-scan-art"></div>
          <div class="ux-start-copy"><h2>Start Game</h2><p>Use your existing cards</p><button class="ux-btn primary" id="uxHomeStart">Start scanning</button></div>
        </div>
        <div class="ux-section-label">Current setup</div>
        <div class="ux-card ux-setup-card" id="uxCurrentSetup">
          <div class="ux-setup-item"><small>Deck</small><strong id="uxHomeDeck">Greatest Hits</strong></div>
          <div class="ux-setup-item"><small>Music</small><strong id="uxHomeMusic">YouTube</strong></div>
          <div class="ux-setup-item"><small>Target</small><strong id="uxHomeTarget">10 cards</strong></div>
          <button class="ux-gear" id="uxHomeGear" aria-label="Change setup">⚙</button>
        </div>
        <div class="ux-section-label">How it works</div>
        <div class="ux-steps"><div class="ux-step"><b>1</b><span>Scan</span></div><div class="ux-step"><b>2</b><span>Listen</span></div><div class="ux-step"><b>3</b><span>Place card</span></div><div class="ux-step"><b>4</b><span>Reveal</span></div></div>
        <button class="ux-btn ux-join-home" id="uxJoinHome">Join Shared Game &nbsp; ♟</button>
        <div class="ux-optional">Optional • several phones can scan the same game</div>
      </section>

      <section class="ux-screen" id="uxNewGame">
        <button class="ux-back" data-back="home">‹</button><div class="ux-record-corner"></div>
        <h1 class="ux-page-title">New Game</h1><p class="ux-page-sub">Choose what you want to hear.</p>
        <div class="ux-section-label">Deck</div>
        <div class="ux-deck-list">
          <button class="ux-card ux-deck" data-deck="greatest"><div class="ux-deck-art greatest"></div><div><h3>Greatest Hits</h3><p>Iconic songs across the decades.</p></div><span class="ux-deck-check">✓</span></button>
          <button class="ux-card ux-deck" data-deck="australian"><div class="ux-deck-art australian"></div><div><h3>Australian</h3><p>Homegrown classics and favourites.</p></div><span class="ux-deck-check">›</span></button>
          <button class="ux-card ux-deck" data-deck="unexpected"><div class="ux-deck-art unexpected"></div><div><h3>Unexpected Years</h3><p>Songs that feel older or newer than they are.</p></div><span class="ux-deck-check">›</span></button>
        </div>
        <button class="ux-btn text" id="uxMoreDecks">More decks and modes</button>
        <div class="ux-section-label">Target</div>
        <div class="ux-segment" id="uxTarget"><button data-target="6">6 cards</button><button data-target="10">10 cards</button></div>
        <div class="ux-section-label">Game</div>
        <div class="ux-card ux-shared-row"><div><h3>Shared game</h3><p>Several phones use the same card mappings</p></div><div class="ux-toggle" id="uxSharedToggle"></div></div>
        <div class="ux-note"><span>▣</span><span>Every scanned card is mapped to a new song from the same release year for this game.</span></div>
        <button class="ux-btn primary ux-start-scan" id="uxNewStart">Start Scanning</button>
      </section>

      <section class="ux-screen ux-full" id="uxScanner">
        <div class="ux-camera"><div id="uxReader"></div><div class="ux-camera-shade"></div></div>
        <div class="ux-camera-head"><div class="ux-camera-brand">Guess the Song Year</div><button class="ux-camera-setting" id="uxScannerSettings">⚙</button></div>
        <div class="ux-camera-copy">Scan the QR code on the back of a card</div>
        <div class="ux-scan-frame"><i class="ux-corner tl"></i><i class="ux-corner tr"></i><i class="ux-corner bl"></i><i class="ux-corner br"></i><i class="ux-laser"></i></div>
        <div class="ux-camera-chip" id="uxScannerChip">Greatest Hits • 10-card game</div>
        <div class="ux-camera-actions"><div class="ux-round-action"><button id="uxTorch">☼</button><span>Torch</span></div><div class="ux-round-action"><button id="uxManual">#</button><span>Enter code</span></div></div>
      </section>

      <section class="ux-screen" id="uxReady">
        <div class="ux-kicker">✦ &nbsp; Card scanned</div><h1 class="ux-ready-title">Ready to play</h1>
        <div class="ux-phone-art"></div>
        <div class="ux-ready-copy"><h2>Flip your phone</h2><p>Music starts when the screen is face-down</p></div>
        <div class="ux-lock-chip">▣ &nbsp; <span id="uxReadyCard">Card 01</span> • song locked</div>
        <button class="ux-countdown-link" id="uxUseCountdown">Use 3 second countdown instead</button>
        <div class="ux-progress-caption" id="uxProgressCaption">0 / 10 cards collected</div><div class="ux-progress-dots" id="uxProgressDots"></div>
      </section>

      <section class="ux-screen" id="uxCountdown"><div><div class="ux-kicker">Get ready</div><div class="ux-count-number" id="uxCountNumber">3</div><p class="ux-page-sub">Put the phone face-down before the music starts.</p></div></section>

      <section class="ux-screen" id="uxPlaying">
        <h1 class="ux-playing-title">Now Playing</h1><div class="ux-device-line" id="uxPlayingDevice">Music device • metadata hidden</div>
        <div class="ux-wave-card"><button class="ux-pause" id="uxPause">Ⅱ</button><div class="ux-progressbar"><span id="uxPlayProgress"></span></div><div class="ux-progress-time" id="uxElapsed">0:00</div></div>
        <div id="uxYoutubeHost" class="ux-youtube-host"></div>
        <div class="ux-place"><h2>Place the card on your timeline</h2><p>Before, after, or between the cards already on the table.</p></div>
        <div class="ux-table"><div class="ux-physical-card" style="--c:#d6b260;--r:-7deg">1978</div><div class="ux-physical-card" style="--c:#ad5e5b;--r:3deg">1989</div><div class="ux-slot"></div><div class="ux-physical-card" style="--c:#77a9b9;--r:-2deg">2004</div><div class="ux-physical-card" style="--c:#916fa4;--r:5deg">2016</div></div>
        <button class="ux-replay" id="uxReplay">↻ &nbsp; Replay clip</button>
        <button class="ux-btn primary ux-reveal-btn" id="uxRevealBtn">Reveal Answer</button><div class="ux-reveal-note">Reveal only after the card has been placed</div>
      </section>

      <section class="ux-screen" id="uxReveal">
        <div class="ux-record-corner"></div><h1 class="ux-reveal-heading">Reveal</h1><div class="ux-reveal-sub" id="uxRevealSub">Greatest Hits • Card 01</div>
        <div class="ux-card glow ux-answer-card"><div class="ux-answer-top"><div class="ux-cover-art"></div><div><div class="ux-answer-song" id="uxAnswerSong">Song</div><div class="ux-answer-artist" id="uxAnswerArtist">Artist</div></div></div><div class="ux-answer-year" id="uxAnswerYear">1996</div><div class="ux-same-year">Your card is also <b id="uxCardYear">1996</b> &nbsp; ✓</div></div>
        <div class="ux-section-label">Check the table</div><div class="ux-card ux-check-card"><div class="ux-check-icon">▦</div><div class="ux-check-copy"><strong id="uxCheckCopy">If 1996 fits where you placed the card, keep it.</strong><span>Otherwise discard it.<br>The physical timeline decides. No digital score needed.</span></div></div>
        <button class="ux-btn primary ux-next-card" id="uxNextCard">Scan Next Card &nbsp; ›</button><button class="ux-open-music" id="uxOpenTrack">♫ &nbsp; Show song in music app</button>
      </section>

      <section class="ux-screen" id="uxMusic">
        <button class="ux-back" data-back="home">‹</button><div class="ux-record-corner"></div><h1 class="ux-page-title">Music</h1><p class="ux-page-sub">Choose how songs play.</p>
        <div class="ux-section-label">Service</div>
        <button class="ux-card ux-service spotify" id="uxSpotifyService"><span class="ux-service-icon">♪</span><span><h3>Spotify</h3><p id="uxSpotifyState">Not connected</p></span><b class="ux-service-check" id="uxSpotifyCheck"></b></button>
        <button class="ux-card ux-service" id="uxYoutubeService"><span class="ux-service-icon">♪</span><span><h3>YouTube</h3><p id="uxYoutubeState">Ready</p></span><b class="ux-service-check" id="uxYoutubeCheck"></b></button>
        <div class="ux-section-label">Playback</div><div class="ux-segment ux-music-segment" id="uxClipLength"><button data-clip="full">Full track</button><button data-clip="30">30 sec</button></div>
        <div class="ux-section-label">Device</div><div class="ux-card ux-device-card"><span class="ux-speaker-icon">▥</span><span class="ux-device-copy"><strong id="uxDeviceName">This device</strong><span id="uxDeviceSub">Playback device</span></span><button class="ux-change" id="uxChangeDevice">Change</button></div>
        <div class="ux-section-label">Hide track info</div><div class="ux-card ux-hide-card"><div class="ux-hide-top"><div><strong>Flip phone to start</strong><span>Keeps song title and artist hidden from players</span></div><div class="ux-toggle on" id="uxHideToggle"></div></div><div class="ux-segment ux-start-method" id="uxStartMethod"><button data-start="flip">Gyroscope</button><button data-start="countdown">3 sec countdown</button></div></div>
        <button class="ux-disconnect" id="uxDisconnect">Disconnect</button><button class="ux-btn primary ux-done" id="uxMusicDone">Done</button>
      </section>

      <section class="ux-screen" id="uxJoin">
        <button class="ux-back" data-back="home">‹</button><div class="ux-record-corner"></div><h1 class="ux-page-title" style="font-size:50px">Join Shared Game</h1><p class="ux-page-sub">Use any phone. Keep one shared mapping.</p>
        <div class="ux-section-label">Room code</div><div class="ux-card ux-room-entry"><input id="uxRoomCode" maxlength="6" placeholder="M7K4"><button class="ux-btn primary" id="uxJoinRoom">Join</button></div>
        <div class="ux-card ux-room-info"><div class="ux-info-icon">i</div><div><h3>How shared games work</h3><p>Everyone in the same game gets the same deck settings and the same card-to-song assignments, so any phone can scan the next card.</p></div></div>
        <div class="ux-section-label">Connected</div><div class="ux-card ux-connected" id="uxConnected"><div class="ux-row"><h3 id="uxRoomTitle">Room</h3><span class="ux-sync">Synced ✓</span></div><div class="ux-room-line"><span>▣</span><small>Deck</small><b id="uxRoomDeck">Greatest Hits</b></div><div class="ux-room-line"><span>◎</span><small>Target</small><b id="uxRoomTarget">10 cards</b></div><div class="ux-room-line"><span>▯</span><small>Phones</small><b>1 connected</b></div></div>
        <button class="ux-btn primary ux-open-scanner" id="uxJoinScanner" disabled>⌗ &nbsp; Open Scanner</button><button class="ux-leave" id="uxLeaveRoom">Leave game</button>
      </section>

      <div class="ux-sheet" id="uxSheet"><div class="ux-sheet-card"><div class="ux-sheet-head"><div class="ux-sheet-title">Game setup</div><button class="ux-sheet-close" id="uxSheetClose">×</button></div><div class="ux-deck-list" id="uxAllModes"></div><div class="ux-section-label">Playback</div><div class="ux-segment"><button data-provider="youtube">YouTube</button><button data-provider="spotify">Spotify</button></div><button class="ux-btn text" id="uxAdvanced">Advanced setup & diagnostics →</button></div></div>
    `;
    d.body.appendChild(shell);bind();renderAll();
    try{if(E?.ytWrap)q('uxYoutubeHost').appendChild(E.ytWrap)}catch{}
  }

  function setScreen(id){d.querySelectorAll('.ux-screen').forEach(x=>x.classList.toggle('on',x.id===id));phase=id;window.scrollTo({top:0,behavior:'instant'});renderAll()}
  function toast(text){q('uxTempToast')?.remove();const x=d.createElement('div');x.id='uxTempToast';x.className='ux-toast';x.textContent=text;d.body.appendChild(x);setTimeout(()=>x.remove(),4200)}
  function bind(){
    q('uxHomeStart').onclick=startFresh;q('uxHomeGear').onclick=()=>setScreen('uxNewGame');q('uxJoinHome').onclick=()=>setScreen('uxJoin');
    d.querySelectorAll('[data-back="home"]').forEach(x=>x.onclick=()=>setScreen('uxHome'));
    d.querySelectorAll('#uxNewGame [data-deck]').forEach(x=>x.onclick=()=>chooseDeck(x.dataset.deck));
    q('uxMoreDecks').onclick=openSheet;q('uxSharedToggle').onclick=()=>{shared=!shared;localStorage.setItem('gsy.shared',shared?'1':'0');renderAll()};
    d.querySelectorAll('#uxTarget [data-target]').forEach(x=>x.onclick=()=>{target=Number(x.dataset.target);localStorage.setItem('gsy.target',target);renderAll()});
    q('uxNewStart').onclick=startFresh;q('uxScannerSettings').onclick=()=>{stopScanner();setScreen('uxNewGame')};q('uxManual').onclick=manualScan;q('uxTorch').onclick=()=>toast('Torch control depends on browser camera support.');
    q('uxUseCountdown').onclick=startCountdown;q('uxPause').onclick=togglePause;q('uxReplay').onclick=replay;q('uxRevealBtn').onclick=reveal;q('uxNextCard').onclick=nextCard;q('uxOpenTrack').onclick=openTrack;
    q('uxSpotifyService').onclick=selectSpotify;q('uxYoutubeService').onclick=()=>{try{selectProvider('youtube')}catch{};renderAll()};
    d.querySelectorAll('#uxClipLength [data-clip]').forEach(x=>x.onclick=()=>{clipLength=x.dataset.clip;localStorage.setItem('gsy.clipLength',clipLength);renderAll()});
    d.querySelectorAll('#uxStartMethod [data-start]').forEach(x=>x.onclick=()=>{startMethod=x.dataset.start;localStorage.setItem('gsy.startMode',startMethod);renderAll()});
    q('uxHideToggle').onclick=()=>{startMethod=startMethod==='flip'?'countdown':'flip';localStorage.setItem('gsy.startMode',startMethod);renderAll()};
    q('uxChangeDevice').onclick=changeDevice;q('uxDisconnect').onclick=disconnectMusic;q('uxMusicDone').onclick=()=>setScreen('uxHome');
    q('uxJoinRoom').onclick=joinRoom;q('uxJoinScanner').onclick=()=>startScanner(false);q('uxLeaveRoom').onclick=()=>{q('uxConnected').classList.remove('on');q('uxJoinScanner').disabled=true;q('uxRoomCode').value=''};
    q('uxSheetClose').onclick=closeSheet;q('uxSheet').onclick=e=>{if(e.target===q('uxSheet'))closeSheet()};q('uxAdvanced').onclick=openAdvanced;
    d.querySelectorAll('#uxSheet [data-provider]').forEach(x=>x.onclick=()=>{if(x.dataset.provider==='spotify')selectSpotify();else{try{selectProvider('youtube')}catch{};renderAll()}});
    buildAllModes();
    d.addEventListener('visibilitychange',()=>{if(d.hidden&&scanning)stopScanner()});
  }

  function chooseDeck(id){const map={greatest:'greatest',australian:'australian',unexpected:'unexpected'};try{selectMode(map[id]||id)}catch{};renderAll()}
  function buildAllModes(){const box=q('uxAllModes');box.innerHTML='';try{Object.entries(MODES).forEach(([id,m])=>{const b=d.createElement('button');b.className='ux-card ux-deck';b.dataset.mode=id;const art=id==='australian'?'australian':id==='unexpected'?'unexpected':'greatest';const display=id==='number1'?'#1 US':m.name;b.innerHTML=`<div class="ux-deck-art ${art}"></div><div><h3>${esc(display)}</h3><p>${esc(m.desc||'')}</p></div><span class="ux-deck-check">›</span>`;b.onclick=()=>{try{selectMode(id)}catch{};closeSheet();renderAll()};box.appendChild(b)})}catch{}}
  function openSheet(){renderAll();q('uxSheet').classList.add('on')}function closeSheet(){q('uxSheet').classList.remove('on')}
  function openAdvanced(){closeSheet();d.body.classList.remove('ux-flow');q('uxShell').style.display='none';try{view('settings')}catch{}}
  window.gsyReturnToGame=()=>{try{view('play')}catch{};d.body.classList.add('ux-flow');q('uxShell').style.display='';setScreen('uxHome')};

  function renderAll(){
    const deck=modeName(),music=musicName();
    q('uxHomeDeck').textContent=deck;q('uxHomeMusic').textContent=music;q('uxHomeTarget').textContent=target+' cards';q('uxScannerChip').textContent=deck+' • '+target+'-card game';
    d.querySelectorAll('#uxNewGame [data-deck]').forEach(x=>x.classList.toggle('selected',(x.dataset.deck==='greatest'&&mode==='greatest')||(x.dataset.deck==='australian'&&mode==='australian')||(x.dataset.deck==='unexpected'&&mode==='unexpected')));
    d.querySelectorAll('#uxTarget [data-target]').forEach(x=>x.classList.toggle('on',Number(x.dataset.target)===target));q('uxSharedToggle').classList.toggle('on',shared);
    const connected=hasSpotify();q('uxSpotifyState').textContent=connected?'Connected':'Not connected';q('uxSpotifyCheck').textContent=provider==='spotify'&&connected?'✓':'';q('uxYoutubeCheck').textContent=provider==='youtube'?'✓':'';q('uxYoutubeState').textContent='Ready';
    d.querySelectorAll('#uxClipLength [data-clip]').forEach(x=>x.classList.toggle('on',x.dataset.clip===clipLength));d.querySelectorAll('#uxStartMethod [data-start]').forEach(x=>x.classList.toggle('on',x.dataset.start===startMethod));q('uxHideToggle').classList.toggle('on',startMethod==='flip');
    d.querySelectorAll('#uxSheet [data-provider]').forEach(x=>x.classList.toggle('on',x.dataset.provider===provider));
    const deviceInfo=getDeviceInfo();q('uxDeviceName').textContent=deviceInfo.name;q('uxDeviceSub').textContent=deviceInfo.sub;
    q('uxRoomDeck').textContent=deck;q('uxRoomTarget').textContent=target+' cards';
    renderProgress();
  }
  function getDeviceInfo(){try{const opt=E?.device?.selectedOptions?.[0];if(provider==='spotify'&&opt&&opt.value)return{name:opt.textContent||'Spotify device',sub:'Spotify Connect'};if(provider==='spotify')return{name:'Active Spotify device',sub:'Spotify Connect'};return{name:'This phone',sub:'YouTube player'}}catch{return{name:'This device',sub:'Playback device'}}}
  function renderProgress(){const n=Math.min(gameCount(),target);q('uxProgressCaption').textContent=n+' / '+target+' cards collected';const box=q('uxProgressDots');box.innerHTML='';for(let i=0;i<target;i++){const dot=d.createElement('i');if(i<n)dot.className='done';box.appendChild(dot)}}

  async function startFresh(){try{originalNewGame?.()}catch{};await requestMotion();startScanner(false)}
  async function loadQr(){if(window.Html5Qrcode)return;await new Promise((res,rej)=>{const s=d.createElement('script');s.src='https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';s.onload=res;s.onerror=rej;d.head.appendChild(s)})}
  async function startScanner(continueGame=true){
    if(provider==='spotify'&&!hasSpotify()){setScreen('uxMusic');toast('Connect Spotify first, or choose YouTube.');return}
    setScreen('uxScanner');try{await loadQr();if(scanner){try{await scanner.clear()}catch{}}scanner=new Html5Qrcode('uxReader');await scanner.start({facingMode:'environment'},{fps:12,qrbox:{width:260,height:320},aspectRatio:.72},async text=>{if(!scanning)return;scanning=false;navigator.vibrate?.(40);await stopScanner();await handleCard(text)},()=>{});scanning=true}catch(e){setScreen('uxHome');toast('Camera could not start. Allow camera access and try again.')}
  }
  async function stopScanner(){if(!scanner)return;try{if(scanning)await scanner.stop()}catch{}try{await scanner.clear()}catch{}scanning=false}
  function manualScan(){const v=prompt('Enter card ID or paste its QR URL');if(v)handleCard(v.trim())}

  async function handleCard(raw){
    let id=null;try{id=parseId(raw)}catch{};if(!id){toast('That QR is not one of the supported cards.');setTimeout(()=>startScanner(true),900);return}
    setScreen('uxReady');q('uxReadyCard').textContent='Card '+String(cardNumber()).padStart(2,'0');q('uxReady').style.opacity='.72';
    try{
      let saved=null;try{if(provider==='spotify'&&typeof spotifyPlay==='function'){saved=spotifyPlay;spotifyPlay=async()=>null}await originalProcess(raw)}finally{if(saved)spotifyPlay=saved}
      if(!current)throw new Error('No song could be selected');q('uxReady').style.opacity='1';renderProgress();
      if(startMethod==='countdown')setTimeout(startCountdown,450);else if(faceDown)beginPlayback();
    }catch(e){q('uxReady').style.opacity='1';toast(e?.message||String(e));setTimeout(()=>startScanner(true),1400)}
  }

  async function requestMotion(){if(startMethod!=='flip')return false;try{if(typeof DeviceMotionEvent!=='undefined'&&typeof DeviceMotionEvent.requestPermission==='function'){const p=await DeviceMotionEvent.requestPermission();if(p!=='granted')return false}if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){const p=await DeviceOrientationEvent.requestPermission();if(p!=='granted')return false}if(!motionEnabled){window.addEventListener('deviceorientation',onOrientation,{passive:true});window.addEventListener('devicemotion',onMotion,{passive:true})}motionEnabled=true;return true}catch{return false}}
  function onOrientation(e){const b=Number(e.beta),g=Number(e.gamma);if(!Number.isFinite(b)||!Number.isFinite(g))return;const down=Math.abs(b)>135&&Math.abs(g)<70,was=faceDown;faceDown=down;if(phase==='uxReady'&&faceDown&&!was&&startMethod==='flip')beginPlayback()}
  function onMotion(e){const z=e.accelerationIncludingGravity?.z;if(phase==='uxReady'&&startMethod==='flip'&&faceDown&&typeof z==='number'&&Math.abs(z)>7)beginPlayback()}
  function startCountdown(){clearInterval(countTimer);setScreen('uxCountdown');let n=3;q('uxCountNumber').textContent=n;countTimer=setInterval(()=>{n--;if(n<=0){clearInterval(countTimer);countTimer=null;beginPlayback()}else q('uxCountNumber').textContent=n},850)}

  async function beginPlayback(){if(!current||phase==='uxPlaying')return;try{if(provider==='youtube'){try{E?.ytWrap?.classList.remove('hidden')}catch{};await startYoutubePlayback()}else if(current?.resolved?.uri){await spotifyPlay(current.resolved.uri)}elapsed=0;startPlayTimer();const dev=getDeviceInfo();q('uxPlayingDevice').textContent=dev.name+' • metadata hidden';setScreen('uxPlaying')}catch(e){toast(e?.message||String(e))}}
  function startPlayTimer(){clearInterval(playTimer);q('uxElapsed').textContent='0:00';q('uxPlayProgress').style.width='2%';playTimer=setInterval(()=>{elapsed++;q('uxElapsed').textContent='0:'+String(elapsed).padStart(2,'0');const denom=clipLength==='30'?30:60;q('uxPlayProgress').style.width=Math.min(100,(elapsed/denom)*100)+'%';if(clipLength==='30'&&elapsed>=30){clearInterval(playTimer);playTimer=null}},1000)}
  function togglePause(){try{if(provider==='youtube'&&ytPlayer?.pauseVideo){ytPlayer.pauseVideo();q('uxPause').textContent='▶';clearInterval(playTimer)}else toast('Pause from the Spotify device if needed.')}catch{}}
  async function replay(){try{if(provider==='youtube'&&ytPlayer?.seekTo){ytPlayer.seekTo(0,true);ytPlayer.playVideo()}else if(provider==='spotify'&&current?.resolved?.uri)await spotifyPlay(current.resolved.uri);elapsed=0;startPlayTimer()}catch(e){toast(e?.message||String(e))}}

  function reveal(){if(!current)return;clearInterval(playTimer);try{if(provider==='youtube'&&ytPlayer?.pauseVideo)ytPlayer.pauseVideo()}catch{};try{originalShow?.()}catch{};const y=current.year||'----',song=current.candidate?.title||'Unknown song',artist=current.candidate?.artist||'';q('uxRevealSub').textContent=modeName()+' • Card '+String(Math.max(1,gameCount())).padStart(2,'0');q('uxAnswerSong').textContent=song;q('uxAnswerArtist').textContent=artist;q('uxAnswerYear').textContent=y;q('uxCardYear').textContent=y;q('uxCheckCopy').textContent='If '+y+' fits where you placed the card, keep it.';setScreen('uxReveal');renderProgress()}
  async function nextCard(){try{originalReset?.()}catch{};await startScanner(true)}
  function openTrack(){try{const a=E?.providerLink;if(a?.href&&a.href!=='#'){window.open(a.href,'_blank','noopener');return}}catch{}toast('Open the connected music app to view this track.')}

  async function selectSpotify(){try{selectProvider('spotify')}catch{};if(hasSpotify()){renderAll();return}try{if(typeof login==='function'){await login();return}}catch{};setScreen('uxMusic');toast('Spotify needs its Client ID configured once in Advanced setup.')}
  function disconnectMusic(){try{if(provider==='spotify'&&typeof logout==='function')logout()}catch{};try{selectProvider('youtube')}catch{};renderAll()}
  async function changeDevice(){try{if(provider==='spotify'&&hasSpotify()&&typeof devices==='function'){await devices();const opt=E?.device?.selectedOptions?.[0];renderAll();toast(opt?.value?'Using '+opt.textContent:'Open Spotify on the target speaker or phone, play/pause once, then refresh devices in Advanced setup.');return}}catch{};openAdvanced()}

  function joinRoom(){const code=q('uxRoomCode').value.trim().toUpperCase();if(code.length<4){toast('Enter the room code from the host phone.');return}toast('Shared-game syncing needs a small realtime backend. The visual flow is ready, but cross-phone rooms are not enabled yet.')}

  build();
})();
