(() => {
  'use strict';
  const d=document;
  let uxScanner=null, uxScanning=false, currentPhase='home', motionEnabled=false, faceDown=false, countdownTimer=null, faceUpTimer=null, playbackStarted=0;
  const originalProcess=typeof processCard==='function'?processCard:null;
  const originalShow=typeof showAnswer==='function'?showAnswer:null;
  const originalReset=typeof resetRound==='function'?resetRound:null;

  function el(tag,cls,html){const x=d.createElement(tag);if(cls)x.className=cls;if(html!==undefined)x.innerHTML=html;return x}
  function modeLabel(){try{return MODES[mode]?.name||'Greatest Hits'}catch{return 'Greatest Hits'}}
  function providerLabel(){try{return provider==='spotify'?'Spotify':'YouTube'}catch{return 'YouTube'}}
  function setScreen(id){d.querySelectorAll('.ux-screen').forEach(x=>x.classList.toggle('on',x.id===id));currentPhase=id}
  function stopTimers(){if(countdownTimer){clearInterval(countdownTimer);countdownTimer=null}if(faceUpTimer){clearTimeout(faceUpTimer);faceUpTimer=null}}

  function build(){
    d.body.classList.add('ux-flow');
    const shell=el('div','',''); shell.id='uxShell';
    shell.innerHTML=`
      <section class="ux-screen on" id="uxHome">
        <div class="ux-top"><div class="ux-brand">GUESS THE SONG YEAR</div><button class="ux-icon" id="uxSettings" aria-label="Game settings">⚙</button></div>
        <div class="ux-center"><div class="ux-rings"></div><h1 class="ux-title">Ready to play?</h1><p class="ux-sub">Scan a card. Hear the song. Place it on the timeline. Reveal when everyone is locked in.</p><div class="ux-meta"><span class="ux-chip" id="uxModeChip"></span><span class="ux-chip" id="uxProviderChip"></span></div></div>
        <div class="ux-actions"><button class="ux-primary" id="uxPlay">Start game</button></div>
      </section>
      <section class="ux-screen" id="uxScan">
        <div class="ux-scan-wrap"><div id="uxReader"></div><div class="ux-scan-shade"></div><div class="ux-scan-frame"></div></div>
        <div class="ux-scan-copy"><h2>Scan the card</h2><p>Centre the QR code in the square</p></div>
        <div class="ux-scan-bottom"><button class="ux-icon" id="uxScanBack" aria-label="Back">‹</button><button class="ux-icon" id="uxScanSettings" aria-label="Game settings">⚙</button></div>
      </section>
      <section class="ux-screen" id="uxFinding"><div class="ux-top"><div class="ux-brand">SONG FOUND</div><button class="ux-icon" id="uxFindingSettings">⚙</button></div><div class="ux-center"><div class="ux-flip-icon">▰</div><h1 class="ux-title">Turn your phone face down</h1><p class="ux-sub" id="uxFindCopy">The music starts when the screen is hidden.</p></div><div class="ux-actions"><button class="ux-secondary" id="uxCountdownFallback">Use 3-second countdown</button></div></section>
      <section class="ux-screen" id="uxCountdown"><div class="ux-top"><div class="ux-brand">GET READY</div></div><div class="ux-center"><div class="ux-count" id="uxCount">3</div><p class="ux-sub">Put the phone face down before the music starts.</p></div></section>
      <section class="ux-screen" id="uxListening"><div class="ux-top"><div class="ux-brand">NOW PLAYING</div><button class="ux-icon" id="uxListenSettings">⚙</button></div><div class="ux-center"><div class="ux-listen-wave"><i></i><i></i><i></i><i></i><i></i></div><div id="uxYoutubeSlot" class="ux-youtube-slot"></div><h1 class="ux-title">Place the card</h1><p class="ux-sub" id="uxListenCopy">Listen, decide where it belongs, then reveal the answer.</p><div class="ux-meta"><span class="ux-chip" id="uxListenMode"></span></div></div><div class="ux-actions"><button class="ux-primary" id="uxReveal">Reveal answer</button><button class="ux-secondary" id="uxReplay">Play again</button></div></section>
      <section class="ux-screen" id="uxRevealScreen"><div class="ux-top"><div class="ux-brand">REVEAL</div><button class="ux-icon" id="uxRevealSettings">⚙</button></div><div class="ux-center"><div class="ux-year" id="uxYear">----</div><div class="ux-song" id="uxSong">Song</div><div class="ux-artist" id="uxArtist">Artist</div><div class="ux-source" id="uxRevealMeta"></div></div><div class="ux-actions"><button class="ux-primary" id="uxNext">Scan next card</button></div></section>
      <div class="ux-sheet" id="uxSheet"><div class="ux-sheet-card"><div class="ux-sheet-head"><div><div class="ux-brand">QUICK SETTINGS</div><h3>Game setup</h3></div><button class="ux-icon" id="uxCloseSheet">×</button></div><div class="ux-section"><div class="ux-label">MODE</div><div class="ux-mode-list" id="uxModes"></div></div><div class="ux-section"><div class="ux-label">PLAYBACK</div><div class="ux-options"><button class="ux-option" data-provider="youtube">▶ YouTube</button><button class="ux-option" data-provider="spotify">● Spotify</button></div></div><div class="ux-section"><div class="ux-label">START MUSIC</div><div class="ux-options"><button class="ux-option" data-start="flip">↻ Face down</button><button class="ux-option" data-start="countdown">3s Countdown</button></div></div><div class="ux-section"><button class="ux-settings-link" id="uxAdvanced">Advanced setup & diagnostics →</button></div></div></div>`;
    d.body.appendChild(shell);
    bind(); renderQuick();
  }

  function bind(){
    q('uxPlay').onclick=async()=>{await requestMotion(); startScanner()};
    q('uxSettings').onclick=openSheet;q('uxScanSettings').onclick=openSheet;q('uxFindingSettings').onclick=openSheet;q('uxListenSettings').onclick=openSheet;q('uxRevealSettings').onclick=openSheet;
    q('uxCloseSheet').onclick=closeSheet;q('uxSheet').onclick=e=>{if(e.target.id==='uxSheet')closeSheet()};
    q('uxScanBack').onclick=()=>{stopScanner();setScreen('uxHome')};
    q('uxCountdownFallback').onclick=()=>startCountdown();
    q('uxReveal').onclick=reveal;
    q('uxNext').onclick=next;
    q('uxReplay').onclick=()=>{setScreen('uxFinding');q('uxFindCopy').textContent='Turn the phone face down to play the song again.'};
    q('uxAdvanced').onclick=()=>{closeSheet(); d.body.classList.remove('ux-flow'); shellHide(true); try{view('settings')}catch{} };
    d.querySelectorAll('#uxSheet [data-provider]').forEach(b=>b.onclick=()=>{try{selectProvider(b.dataset.provider)}catch{};renderQuick()});
    d.querySelectorAll('#uxSheet [data-start]').forEach(b=>b.onclick=()=>{localStorage.setItem('gsy.startMode',b.dataset.start);renderQuick()});
    buildModeButtons();
    d.addEventListener('visibilitychange',()=>{if(d.hidden&&uxScanning)stopScanner()});
    try{if(E?.ytWrap)q('uxYoutubeSlot').appendChild(E.ytWrap)}catch{}
  }
  function q(id){return d.getElementById(id)}
  function shellHide(h){q('uxShell').style.display=h?'none':''}
  window.gsyReturnToGame=()=>{try{view('play')}catch{};d.body.classList.add('ux-flow');shellHide(false);renderQuick();setScreen('uxHome')};

  function buildModeButtons(){const box=q('uxModes');box.innerHTML='';try{Object.entries(MODES).forEach(([id,m])=>{const b=el('button','ux-option',`<b>${m.icon||''} ${escapeHtml(m.name)}</b><small>${escapeHtml(m.desc||'')}</small>`);b.dataset.mode=id;b.onclick=()=>{selectMode(id);renderQuick()};box.appendChild(b)})}catch{}}
  function renderQuick(){q('uxModeChip').textContent=modeLabel();q('uxProviderChip').textContent=providerLabel();q('uxListenMode').textContent=modeLabel();d.querySelectorAll('#uxSheet [data-provider]').forEach(b=>b.classList.toggle('on',b.dataset.provider===provider));const sm=localStorage.getItem('gsy.startMode')||'flip';d.querySelectorAll('#uxSheet [data-start]').forEach(b=>b.classList.toggle('on',b.dataset.start===sm));d.querySelectorAll('#uxModes [data-mode]').forEach(b=>b.classList.toggle('on',b.dataset.mode===mode))}
  function openSheet(){renderQuick();q('uxSheet').classList.add('on')}
  function closeSheet(){q('uxSheet').classList.remove('on')}

  async function requestMotion(){
    if(localStorage.getItem('gsy.startMode')==='countdown')return false;
    try{
      if(typeof DeviceMotionEvent!=='undefined'&&typeof DeviceMotionEvent.requestPermission==='function'){const p=await DeviceMotionEvent.requestPermission();if(p!=='granted')return false}
      if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){const p=await DeviceOrientationEvent.requestPermission();if(p!=='granted')return false}
      if(typeof DeviceMotionEvent!=='undefined')window.addEventListener('devicemotion',onMotion,{passive:true});
      if(typeof DeviceOrientationEvent!=='undefined')window.addEventListener('deviceorientation',onOrientation,{passive:true});
      motionEnabled=typeof DeviceMotionEvent!=='undefined'||typeof DeviceOrientationEvent!=='undefined';return motionEnabled
    }catch{}
    return false;
  }
  function onMotion(e){const z=e.accelerationIncludingGravity?.z;if(typeof z!=='number')return;if(Math.abs(z)>7&&currentPhase==='uxFinding'&&localStorage.getItem('gsy.startMode')!=='countdown'&&faceDown)beginPlayback()}
  function onOrientation(e){const b=Number(e.beta),g=Number(e.gamma);if(!Number.isFinite(b)||!Number.isFinite(g))return;const down=Math.abs(b)>135&&Math.abs(g)<70;const was=faceDown;faceDown=down;if(currentPhase==='uxFinding'&&faceDown&&!was&&localStorage.getItem('gsy.startMode')!=='countdown')beginPlayback();if(currentPhase==='uxListening'&&!faceDown&&was&&provider==='youtube'&&Date.now()-playbackStarted>900){try{ytPlayer?.pauseVideo?.();E?.ytWrap?.classList.add('hidden')}catch{}q('uxListenCopy').textContent='Phone is face up. Playback paused so the answer stays hidden.'}}

  async function loadQrLib(){if(window.Html5Qrcode)return;await new Promise((res,rej)=>{const s=el('script');s.src='https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';s.onload=res;s.onerror=rej;d.head.appendChild(s)})}
  async function startScanner(){
    stopTimers(); setScreen('uxScan');
    try{await loadQrLib();if(uxScanner){try{await uxScanner.clear()}catch{}} uxScanner=new Html5Qrcode('uxReader');await uxScanner.start({facingMode:'environment'},{fps:12,qrbox:{width:260,height:260},aspectRatio:1},async text=>{if(!uxScanning)return;uxScanning=false;navigator.vibrate?.(40);await stopScanner();await handleScan(text)},()=>{});uxScanning=true}
    catch(e){setScreen('uxHome');showUxError('Camera could not start. Allow camera access and try again.')}
  }
  async function stopScanner(){if(!uxScanner)return;try{if(uxScanning)await uxScanner.stop()}catch{}try{await uxScanner.clear()}catch{}uxScanning=false}
  function parseCard(raw){try{return parseId(raw)}catch{return null}}

  async function handleScan(raw){
    const id=parseCard(raw); if(!id){showUxError('That QR is not one of the supported cards.');return startScanner()}
    setScreen('uxFinding'); q('uxFindCopy').textContent='Finding a '+modeLabel()+' track. The answer stays hidden.';
    try{
      let savedSpotify=null;
      try{if(provider==='spotify'&&typeof spotifyPlay==='function'){savedSpotify=spotifyPlay;spotifyPlay=async()=>null}await originalProcess(raw)}finally{if(savedSpotify)spotifyPlay=savedSpotify}
      if(!current)throw new Error('No song was selected');
      const sm=localStorage.getItem('gsy.startMode')||'flip';
      if(sm==='countdown'||!motionEnabled){
        startCountdown();
      }else if(faceDown){
        beginPlayback();
      }
    }catch(e){showUxError(e?.message||String(e));setTimeout(()=>startScanner(),1600)}
  }

  function startCountdown(){stopTimers();setScreen('uxCountdown');let n=3;q('uxCount').textContent=n;countdownTimer=setInterval(()=>{n--;if(n<=0){clearInterval(countdownTimer);countdownTimer=null;beginPlayback()}else q('uxCount').textContent=n},900)}
  async function beginPlayback(){
    if(!current)return;
    try{
      if(provider==='youtube'){
        try{E?.ytWrap?.classList.remove('hidden')}catch{}
        await startYoutubePlayback();
      }else if(provider==='spotify'&&current?.resolved?.uri){await spotifyPlay(current.resolved.uri)}
      playbackStarted=Date.now();q('uxListenCopy').textContent='Listen, decide where it belongs, then reveal the answer.';setScreen('uxListening');renderQuick();
    }catch(e){showUxError(e?.message||String(e))}
  }
  function reveal(){
    if(!current)return;
    try{if(provider==='youtube'){ytPlayer?.pauseVideo?.();E?.ytWrap?.classList.add('hidden')}}catch{}
    try{originalShow()}catch{}
    q('uxYear').textContent=current.year||'----';q('uxSong').textContent=current.candidate?.title||'Unknown song';q('uxArtist').textContent=current.candidate?.artist||'';q('uxRevealMeta').textContent=`${modeLabel()} · ${providerLabel()}`;setScreen('uxRevealScreen')
  }
  async function next(){try{originalReset()}catch{};stopTimers();await startScanner()}
  function showUxError(text){let old=q('uxTempError');if(old)old.remove();const e=el('div','ux-error',escapeHtml(text));e.id='uxTempError';const screen=d.querySelector('.ux-screen.on');screen?.appendChild(e);setTimeout(()=>e.remove(),4500)}
  function escapeHtml(s){return String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}

  d.addEventListener('click',e=>{const b=e.target.closest?.('.nav button[data-view="play"]');if(b)setTimeout(window.gsyReturnToGame,0)},true);
  build();
})();
