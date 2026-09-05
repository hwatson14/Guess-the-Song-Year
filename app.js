(() => {
  'use strict';

  const E=window.GSYEngine,P=window.GSYAppPolicy;
  if(!E||!P)throw new Error('GSYEngine and GSYAppPolicy must load before app.js');
  const root=document.getElementById('app'),toastEl=document.getElementById('toast');
  const CFG_KEY='gsy.config.v7',MATCH_KEY='gsy.match.v7';
  const DEFAULT_CFG={playMode:'physical',teams:2,victory:'10',mode:'greatest',minYear:P.GAME_YEAR_MIN,maxYear:P.GAME_YEAR_MAX};

  let cfg=load(CFG_KEY,DEFAULT_CFG),match=load(MATCH_KEY,null);
  let screen=match?.active?(match.phase==='gameover'?'gameover':'resume'):'setup',current=match?.current||null,pendingSlot=Number.isInteger(match?.pendingSlot)?match.pendingSlot:null,placementResult=match?.placementResult||null,runtimeError=match?.error||null;
  let scanner=null,scanning=false,scanBusy=false,motionReady=false,faceDown=false,playing=false,playNeedsTap=false,toastTimer=null;
  let musicModal=false,deviceList=[],backGuardReady=false,prepareSeq=0,playbackSeq=0,countdownTimer=null,youtubeListenTimer=null,youtubeDownAt=0;
  let lastRenderedScreen=null,lastModalOpen=false;
  let modeReports={};

  const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  function load(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}}
  function saveCfg(){localStorage.setItem(CFG_KEY,JSON.stringify(cfg))}
  function saveMatch(){if(match)localStorage.setItem(MATCH_KEY,JSON.stringify(match));else localStorage.removeItem(MATCH_KEY)}
  function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
  function activeTeam(){return match?.teams?.[match.turn]||{name:'Team 1',score:0,correct:0,wrong:0,timeline:[]}}
  function winner(){return cfg.victory==='10'?match?.teams?.find(t=>t.score>=10)||null:null}
  function victoryLabel(){return cfg.victory==='unlimited'?'Unlimited':'10 cards'}
  function providerName(){return E.getProvider()==='spotify'?'Spotify':'YouTube'}
  function providerReady(){return E.getProvider()==='youtube'||E.isSpotifyConnected()}
  function modeId(){return match?.mode||cfg.mode||'greatest'}
  function modeInfo(id=modeId()){return E.MODES?.[id]||E.MODES?.greatest||{name:'Greatest Hits',short:'Hits',desc:''}}
  function modeReport(id=modeId()){return modeReports[id]||{id,status:'preview',statusLabel:'Loading',coverage:0,totalYears:73,coverageLabel:'Checking coverage',years:[],selectable:true,statusNote:'Catalogue status is being checked.'}}
  function modeStatusClass(id=modeId()){return ['ready','beta','preview'].includes(modeReport(id).status)?modeReport(id).status:'building'}
  function selectedRange(){const settings=match?.settings||cfg;return P.normalizeYearRange(settings.minYear,settings.maxYear)}
  function rangeStats(id=cfg.mode){const range=selectedRange();return {...P.rangeStats(modeReport(id),range.minYear,range.maxYear),eligibleCards:virtualCardsForMode(id).length}}
  function yearHasAvailableSong(year){const report=modeReport(modeId());if(!(report.years||[]).includes(Number(year)))return false;if(report.repeatPolicy==='fixed')return true;const keys=report.yearSongKeys?.[year]||report.yearSongKeys?.[String(year)]||[],legacy=report.songLegacyKeys?.[year]||report.songLegacyKeys?.[String(year)]||{};return keys.some(k=>!(match?.used||[]).includes(k)&&!(legacy[k]||[]).some(alias=>(match?.used||[]).includes(alias)))}
  function rangeHasAvailableSong(){const report=modeReport(modeId());if(report.repeatPolicy==='fixed')return true;return rangeStats(modeId()).years.some(year=>yearHasAvailableSong(year))}
  function virtualCardsForMode(id=modeId()){const r=selectedRange(),years=new Set((modeReport(id).years||[]).filter(y=>y>=r.minYear&&y<=r.maxYear)),all=Array.from({length:308},(_,i)=>i+1);return years.size?all.filter(cardId=>years.has(E.cardYear(cardId))&&P.yearInRange(E.cardYear(cardId),r)):[]}
  function toast(msg){clearTimeout(toastTimer);toastEl.textContent=msg;toastEl.classList.add('on');toastTimer=setTimeout(()=>toastEl.classList.remove('on'),4200)}
  function errorText(err){return err?.message||String(err||'Something went wrong.')}
  function syncCurrent(){if(!match)return;match.current=current;match.placementResult=placementResult;saveMatch()}
  function resetScroll(){requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'instant'}))}

  async function boot(){
    try{await E.init();modeReports=await E.modeReports?.()||{}}catch(err){toast(errorText(err))}
    normalizeConfig();
    migrateMatch();
    render();
    armBrowserBack();
    if(E.isSpotifyConnected())refreshDevices(false).catch(()=>{});
  }

  function normalizeConfig(){
    cfg={...DEFAULT_CFG,...cfg};
    cfg.teams=Math.max(1,Math.min(6,Number(cfg.teams)||2));
    Object.assign(cfg,P.normalizeYearRange(cfg.minYear,cfg.maxYear));
    if(!['physical','virtual'].includes(cfg.playMode))cfg.playMode='physical';
    if(!['10','unlimited'].includes(cfg.victory))cfg.victory='10';
    delete cfg.deck;delete cfg.deckPolicy;
    const firstSelectable=Object.keys(E.MODES||{}).find(id=>modeReport(id).selectable!==false);
    if(!E.MODES?.[cfg.mode]||modeReport(cfg.mode).selectable===false)cfg.mode=firstSelectable||'greatest';
    saveCfg();
  }

  function takeVirtualCardId(){
    if(!match)return null;
    const refill=()=>{const cards=virtualCardsForMode(modeId()).filter(id=>P.yearInRange(E.cardYear(id),match.settings||cfg)&&yearHasAvailableSong(E.cardYear(id)));match.virtualDeck=shuffle(cards);match.virtualPos=0};
    if(!Array.isArray(match.virtualDeck))refill();
    for(let pass=0;pass<2;pass++){
      while(match.virtualPos<match.virtualDeck.length){const id=match.virtualDeck[match.virtualPos++],year=E.cardYear(id);if(P.yearInRange(year,match.settings||cfg)&&yearHasAvailableSong(year))return id}
      if(pass===0)refill();
    }
    return null;
  }

  function ensureVirtualStarters(){
    if(cfg.playMode!=='virtual'||!match)return;
    const starterCards=shuffle(virtualCardsForMode(modeId()));
    match.virtualDeck=Array.isArray(match.virtualDeck)&&match.virtualDeck.length?match.virtualDeck:shuffle(starterCards);
    match.virtualPos=Math.max(0,Number(match.virtualPos)||0);
    for(const team of match.teams||[]){
      team.timeline=Array.isArray(team.timeline)?team.timeline.map(Number).filter(Number.isFinite):[];
      if(!team.timeline.length){
        const id=starterCards.length?starterCards[(match.teams.indexOf(team))%starterCards.length]:null,year=E.cardYear(id);
        if(year){team.timeline=[year];team.starterCardId=id;team.starterYear=year}
      }else if(!Number.isFinite(Number(team.starterYear))){
        team.starterYear=team.timeline[0];
      }
    }
  }

  function migrateMatch(){
    if(!match?.active)return;
    const oldSettings=match.settings&&typeof match.settings==='object'?match.settings:{};
    match.settings={...cfg,...oldSettings,teams:Array.isArray(match.teams)&&match.teams.length?match.teams.length:cfg.teams,mode:E.MODES?.[match.mode]?match.mode:cfg.mode};
    Object.assign(match.settings,P.normalizeYearRange(match.settings.minYear,match.settings.maxYear));Object.assign(cfg,match.settings);
    match.mode=E.MODES?.[match.mode]&&modeReport(match.mode).selectable!==false?match.mode:cfg.mode;
    match.phase=match.phase||'between';
    match.current=match.current||null;
    match.placementResult=match.placementResult||null;
    match.pendingSlot=Number.isInteger(match.pendingSlot)?match.pendingSlot:null;
    match.error=match.error&&typeof match.error==='object'?match.error:null;
    match.used=Array.isArray(match.used)?match.used:[];
    match.history=Array.isArray(match.history)?match.history:[];
    for(const team of match.teams||[]){team.correct=Number(team.correct)||Number(team.score)||0;team.wrong=Number(team.wrong)||0;team.timeline=Array.isArray(team.timeline)?team.timeline:[]}
    delete match.assign;
    if(match.settings.playMode==='virtual')ensureVirtualStarters();
    saveMatch();
  }

  function render(){
    const screenChanged=screen!==lastRenderedScreen,modalWasOpen=lastModalOpen,modalChanged=musicModal!==modalWasOpen;
    const active=document.activeElement;
    const focusAttr=['action','play','victory','provider','slot','modePicker','range'].find(key=>active?.dataset?.[key]!==undefined);
    const focusSelector=focusAttr?`[data-${focusAttr.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}="${active.dataset[focusAttr]}"]`:null;
    const content=screen==='setup'?setupScreen():screen==='resume'?resumeScreen():screen==='scanner'?scannerScreen():screen==='loading'?loadingScreen():screen==='error'?errorScreen():screen==='ready'?readyScreen():screen==='countdown'?countdownScreen():screen==='youtube'?youtubeListeningScreen():screen==='playing'?playingScreen():screen==='guess'?guessScreen():screen==='reveal'?revealScreen():screen==='gameover'?gameOverScreen():setupScreen();
    root.innerHTML=`<main class="app screen-${esc(screen)}" id="mainContent" ${musicModal?'inert aria-hidden="true"':''}>${content}</main>${musicSheet()}`;
    bind();
    requestAnimationFrame(()=>{
      if(musicModal){if(modalChanged)root.querySelector('[data-action="close-music"]')?.focus();return}
      if(modalWasOpen){root.querySelector('[data-action="music"]')?.focus();return}
      if(!screenChanged&&focusSelector){const prior=root.querySelector(focusSelector);if(prior){prior.focus();return}}
      if(screenChanged){
        const target=root.querySelector('h1,h2')||document.getElementById('mainContent');
        if(target){target.setAttribute('tabindex','-1');target.focus()}
      }
    });
    lastRenderedScreen=screen;lastModalOpen=musicModal;
    if(screen==='scanner')setTimeout(startScanner,20);
  }

  function errorScreen(){
    const err=runtimeError||{},kind=err.kind||P.preparationErrorKind(err.code);
    const retryable=!!err.cardId&&P.canRetryPreparationError(err.code);
    const title=kind==='catalogue'?'No song is available':kind==='track'?'This track would not play':'Music could not be prepared',nextLabel=cfg.playMode==='physical'?'Scan another card':'Deal another card';
    return `${topLine(true,false)}${matchHeader()}${scoreStrip()}<section class="card error-card" role="alert"><div class="kicker">PLAYBACK PAUSED</div><h1>${esc(title)}</h1><p>${esc(err.message||'Check the music service and try again.')}</p><div class="error-code">${esc(err.code||'PREPARE_FAILED')}</div><div class="error-actions">${retryable?'<button class="btn primary" data-action="retry-card">Retry this card</button>':''}<button class="btn ghost" data-action="skip-card">${nextLabel}</button><button class="btn text" data-action="music">Music settings</button></div></section>`;
  }

  function topLine(back=false,music=true){return `<div class="topline">${back?'<button class="icon-btn" data-action="back" aria-label="Back">‹</button>':'<div class="brand-small">Guess the Song Year</div>'}${music?'<button class="icon-btn" data-action="music" aria-label="Music settings">♫</button>':'<span></span>'}</div>`}

  function setupScreen(){
    const report=modeReport(cfg.mode),info=modeInfo(cfg.mode);
    const rs={...rangeStats(cfg.mode),eligibleCards:virtualCardsForMode(cfg.mode).length},target=cfg.victory==='10'?cfg.teams*9+1:0;
    const rangeWarning=report.repeatPolicy!=='fixed'&&target&&rs.songs<target?`Only ${rs.songs} usable songs for a ${target}-card target; the game may end before a winner.`:'';
    const modeOptions=Object.entries(E.MODES||{}).map(([id,m])=>{const r=modeReport(id);return `<option value="${esc(id)}" ${cfg.mode===id?'selected':''} ${r.selectable===false?'disabled':''}>${esc(m.name)} — ${esc(r.statusLabel)} · ${esc(r.coverageLabel)}</option>`}).join('');
    return `${topLine(false)}
      <div class="kicker">NEW GAME</div><h1 class="display title">Game <span class="mint">Setup</span></h1><p class="subtitle">Choose a music mode, then pick how you want to play.</p>
      <div class="setup-grid">
        <section class="card option-card mode-card">
          <div class="option-head"><h3>1. Music mode</h3><span class="mode-status ${modeStatusClass(cfg.mode)}">${esc(report.statusLabel)}</span></div>
          <select class="mode-select" data-mode-picker aria-label="Music mode">${modeOptions}</select>
          <div class="mode-detail"><b>${esc(report.coverageLabel)} · ${report.yearBasis==='chart'?'chart year':'release year'}</b><span>${esc(info.desc)} ${esc(report.statusNote)}</span></div>
        </section>
        <section class="card option-card">
          <div class="option-head"><h3>2. Play style</h3><span>${cfg.playMode==='physical'?'QR cards + camera':'Fully in-app timeline'}</span></div>
          <div class="choice-row"><button class="choice ${cfg.playMode==='physical'?'on':''}" data-play="physical">Real cards<small>Scan each QR card</small></button><button class="choice ${cfg.playMode==='virtual'?'on':''}" data-play="virtual">Virtual<small>Starter year + app dealt cards</small></button></div>
        </section>
        <section class="card option-card range-card"><div class="option-head"><h3>Year range</h3><span>${rs.eligibleCards} cards · ${rs.songs} songs</span></div><div class="range-values"><b>${cfg.minYear}</b><b>${cfg.maxYear}</b></div><div class="range-wrap"><input type="range" data-range="min" min="${P.GAME_YEAR_MIN}" max="${P.GAME_YEAR_MAX}" value="${cfg.minYear}" aria-label="Earliest year"><input type="range" data-range="max" min="${P.GAME_YEAR_MIN}" max="${P.GAME_YEAR_MAX}" value="${cfg.maxYear}" aria-label="Latest year"></div>${rangeWarning?`<small class="range-warning">${esc(rangeWarning)}</small>`:''}</section>
        <section class="card option-card">
          <div class="option-head"><h3>3. Teams</h3><span>Turns rotate automatically</span></div>
          <div class="stepper"><button data-action="teams-minus">−</button><b>${cfg.teams}</b><button data-action="teams-plus">+</button></div>
        </section>
        <section class="card option-card">
          <div class="option-head"><h3>4. Victory target</h3><span>${victoryLabel()}</span></div>
          <div class="choice-row"><button class="choice ${cfg.victory==='10'?'on':''}" data-victory="10">First to 10<small>Classic finish</small></button><button class="choice ${cfg.victory==='unlimited'?'on':''}" data-victory="unlimited">Unlimited<small>End whenever you like</small></button></div>
        </section>
      </div>
      <div class="card music-inline"><div><strong>${providerName()}</strong><small>${E.getProvider()==='spotify'?(E.isSpotifyConnected()?'Connected':'Needs connection'):'Ready · ads/player UI may appear'}</small></div><button data-action="music">Change ›</button></div>
      <div class="setup-footer"><button class="btn primary" data-action="start-game" ${report.selectable===false||!rs.years.length?'disabled':''}>Start Game</button></div>`;
  }

  function resumeScreen(){
    const phase=match?.phase||'between';
    const phaseText=phase==='reveal'?'Answer ready':['ready','countdown','youtube','playing','guess'].includes(phase)?'Song in progress':phase==='scanner'?'Waiting for a card':'Ready for the next card';
    return `${topLine(false)}<div class="kicker">GAME IN PROGRESS</div><h1 class="display title">Ready to <span class="mint">continue?</span></h1>
      <section class="hero"><h2>${esc(activeTeam().name)} is up</h2><p>${cfg.playMode==='physical'?'Real cards':'Virtual'} · ${esc(modeInfo(match.mode).name)} (${esc(modeReport(match.mode).statusLabel)}) · ${cfg.teams} team${cfg.teams===1?'':'s'} · ${victoryLabel()} · ${phaseText}</p><div class="hero-actions"><button class="btn primary" data-action="resume">Resume Game</button><button class="btn ghost" data-action="new-game">New Game</button>${cfg.victory==='unlimited'?'<button class="btn text" data-action="end-game">End Game</button>':''}</div></section>${scoreStrip()}`;
  }

  function matchHeader(){return `<div class="match-bar"><div class="match-team">${esc(activeTeam().name)}</div><div class="match-meta">${esc(modeInfo().short)} · ${esc(modeReport().statusLabel)} · Turn ${Number(match?.round||0)+1}<br>${cfg.victory==='10'?`${activeTeam().score}/10 cards`:`${activeTeam().score} cards`}</div>${cfg.victory==='unlimited'?'<button class="btn text" data-action="end-game">End game</button>':''}</div>`}
  function scoreStrip(){if(!match)return'';return `<div class="score-strip">${match.teams.map((t,i)=>`<div class="team-pill ${i===match.turn?'on':''}"><small>${esc(t.name)}</small><b>${t.score}${cfg.victory==='10'?'/10':''}</b></div>`).join('')}</div>`}

  function scannerScreen(){return `<div class="scanner"><div class="camera"><div id="reader"></div><div class="camera-shade"></div></div><div class="scanner-head"><div class="scanner-brand">Guess the Song Year</div><button class="round-btn" data-action="back" aria-label="Back">×</button></div><div class="scanner-copy">${esc(activeTeam().name)} · scan the QR code on the back of a card</div><div class="scan-frame"><div class="scan-line"></div></div><div class="scanner-bottom"><button class="round-btn" data-action="manual">#</button></div></div>`}
  function loadingScreen(){return `${topLine(true,false)}${matchHeader()}${scoreStrip()}<div class="center"><div class="loader"></div><h1>Preparing song</h1><p>${esc(modeInfo().name)} · ${providerName()}. The answer stays hidden.</p></div>`}

  function readyScreen(){
    const isYt=current?.provider==='youtube';
    const copy=isYt?'Tap Start music, then you get 3 seconds to put the phone face-down before YouTube starts.':'Flip the phone face-down, or tap Start music.';
    return `${topLine(true,false)}${matchHeader()}${scoreStrip()}<div class="kicker">✦ ${cfg.playMode==='physical'?'CARD SCANNED':'CARD DEALT'}</div><h1 class="ready-title">Ready to play</h1><div class="ready-visual" aria-hidden="true"><div class="ready-glow"></div><div class="ready-phone"><div class="ready-phone-screen"><span>?</span></div><i></i></div></div><div class="ready-copy"><h2>${isYt?'Phone down in 3':'Flip your phone'}</h2><p>${copy}</p><div class="locked">▣ Song locked · year hidden</div><div class="ready-actions"><button class="btn primary" data-action="play-current">Start music</button>${!isYt?'<button class="btn ghost" data-action="motion">Enable flip-to-start</button>':''}</div></div>`;
  }

  function countdownScreen(){
    return `${topLine(true,false)}${matchHeader()}${scoreStrip()}<div class="countdown-wrap"><div class="kicker">PUT PHONE FACE-DOWN</div><div class="countdown-number" id="countdownNumber">3</div><h1>Music is about to start</h1><p>Keep the screen face-down until you are ready to guess.</p></div>`;
  }

  function youtubeListeningScreen(){
    const virtual=cfg.playMode==='virtual',replaceLabel=virtual?'Deal new card':'Scan new card';
    const copy=virtual?'Listen for as long as you want. Tap Guess now when you are ready to place the song.':'Listen for as long as you want. Tap Guess now when you are ready to reveal.';
    return `${topLine(false,false)}${matchHeader()}${scoreStrip()}<div class="youtube-listening"><div class="kicker">NOW PLAYING · PHONE DOWN</div><h1>Listen, then guess</h1><p>${copy}</p><div class="youtube-guess-actions"><button class="btn primary" data-action="guess-now">Guess now</button><button class="btn ghost" data-action="new-card">↻ ${replaceLabel}</button></div><div class="youtube-player"><div id="youtubePlayer"></div></div><button class="btn primary yt-start-fallback hidden" id="ytStartFallback" data-action="yt-start">Tap to start YouTube</button><small class="provider-warning">Recognised a recent repeat? Use ${replaceLabel}; the current team keeps its turn and the hidden year changes.</small></div>`;
  }

  function playingScreen(){
    const virtual=cfg.playMode==='virtual';
    return `${topLine(true,false)}${matchHeader()}${scoreStrip()}<div class="kicker">NOW PLAYING</div><div class="wave-card"><button class="play-core" data-action="toggle-play">Ⅱ</button><div class="wave"></div></div>
      <div class="playing-instruction"><h2>${virtual?'Place it on your timeline':'Place the physical card on your timeline'}</h2><p>${virtual?'Choose the gap where you think this song belongs.':'Use the cards already on the table. No example years are shown here so the app cannot influence your guess.'}</p></div>
      ${virtual?virtualTimeline():`<div class="play-actions"><button class="btn ghost" data-action="replay">↻ Replay</button><button class="btn ghost" data-action="new-card">↻ Scan new card</button><button class="btn primary" data-action="guess-now">Guess now</button></div>`}`;
  }

  function guessScreen(){
    const virtual=cfg.playMode==='virtual';
    return `${topLine(true,false)}${matchHeader()}${scoreStrip()}<div class="kicker">MUSIC STOPPED</div><div class="guess-stage"><div class="guess-disc" aria-hidden="true"></div><h1>${virtual?'Place the song':'Make your guess'}</h1><p>${virtual?'Choose where the song belongs on your timeline.':'Place the physical card on your timeline, then reveal the answer.'}</p></div>
      ${virtual?virtualTimeline():`<div class="play-actions"><button class="btn ghost" data-action="listen-again">↻ Listen again</button><button class="btn ghost" data-action="new-card">↻ Scan new card</button><button class="btn primary" data-action="reveal">Reveal Answer</button></div>`}`;
  }

  function virtualTimeline(){
    const team=activeTeam(),years=[...(team.timeline||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b);let html='';
    for(let i=0;i<=years.length;i++){
      const label=i===0?`Before ${years[0]??'timeline'}`:i===years.length?`After ${years[years.length-1]??'timeline'}`:`Between ${years[i-1]} and ${years[i]}`;
      html+=`<button class="slot ${pendingSlot===i?'on':''}" data-slot="${i}" aria-label="${label}" aria-pressed="${pendingSlot===i?'true':'false'}"></button>`;
      if(i<years.length)html+=`<div class="year-card">${years[i]}</div>`;
    }
    const starter=Number(team.starterYear);
    return `<div class="card"><div class="timeline">${html}</div><div class="timeline-note">Starter year: <b>${Number.isFinite(starter)?starter:years[0]}</b> · Tap a + before, between or after the years.</div></div><div class="virtual-actions"><button class="btn ghost" data-action="listen-again">↻ Listen Again</button><button class="btn ghost" data-action="new-card">↻ Deal new card</button><button class="btn primary" data-action="lock-placement" ${pendingSlot===null?'disabled':''}>Lock Placement</button></div>`;
  }

  function revealScreen(){
    const virtual=cfg.playMode==='virtual';
    const reference=!virtual&&current?.cardId?E.cardYearReference(current.cardId):null;
    const cardLabel=reference?String(reference.cardId).padStart(5,'0'):'';
    const physicalResult=!reference?'Mark the answer':reference.year===Number(current?.year)
      ?`Card ${cardLabel} - ${reference.overridden?'corrected on this device':'built-in reference'}`
      :`Card ${cardLabel} - future scans use ${reference.year}`;
    const result=virtual?(placementResult?.correct?'Correct placement':'Wrong position'):physicalResult;
    const resultClass=virtual?(placementResult?.correct?'ok':'bad'):'';
    const source=current?.song?.sourceLabel||current?.song?.source||`${modeInfo().name} catalogue`;
    return `${topLine(true,false)}${matchHeader()}${scoreStrip()}<h1 class="reveal-heading">Reveal</h1><div class="reveal-sub">${esc(modeInfo().name)} · ${esc(activeTeam().name)}</div>
      <section class="card answer-card"><div class="answer-top"><div class="answer-art"></div><div><div class="answer-song">${esc(current?.song?.title||'Unknown')}</div><div class="answer-artist">${esc(current?.song?.artist||'')}</div></div></div><div class="answer-year">${current?.year||'----'}</div><div class="result-badge ${resultClass}">${esc(result)}</div></section>
      <div class="card reveal-help">${virtual?(placementResult?.correct?`It fits at that point in ${esc(activeTeam().name)}’s timeline. The card has been added.`:`It does not fit between those neighbouring years, so the card is discarded.`):`Did ${esc(activeTeam().name)} place the card correctly? Mark the result below.`}</div>
      <div class="reveal-actions">${virtual?'':`<button class="btn ghost mark-answer" data-action="wrong-answer">✕ Wrong answer</button><button class="btn primary mark-answer" data-action="correct-answer">✓ Correct answer</button><button class="btn ghost year-reference-action" data-action="update-card-year">Update card year reference</button>`}${virtual?'<button class="btn primary" data-action="next-turn">Next Team</button>':''}<button class="btn text" data-action="open-track">Open song in ${current?.provider==='spotify'?'Spotify':'YouTube'}</button></div><div class="source-note">Catalogue source: ${esc(source)}</div>`;
  }

  function gameOverScreen(){
    const w=winner(),ranked=[...(match?.teams||[])].sort((a,b)=>b.score-a.score);
    const title=w?`${esc(w.name)} <span class="mint">wins</span>`:'Game <span class="mint">complete</span>';
    const subtitle=w?'First to 10 cards.':match?.endReason==='range-exhausted'?'All songs in your selected range have been used. Final scores.':'Final scores.';
    return `${topLine(false,false)}<div class="kicker">GAME COMPLETE</div><h1 class="display title">${title}</h1><p class="subtitle">${subtitle}</p><div class="scoreboard">${ranked.map((t,i)=>`<div class="card score-row ${i===0?'on':''}"><b>${i+1}. ${esc(t.name)}</b><strong>${t.score}</strong></div>`).join('')}</div><div class="hero-actions"><button class="btn primary" data-action="new-game">New Game</button></div>`;
  }

  function musicSheet(){
    const sp=E.isSpotifyConnected(),selected=E.getSpotifyDevice();
    return `<div class="modal ${musicModal?'on':''}" id="musicModal"><div class="sheet"><div class="sheet-head"><h2>Music</h2><button class="close" data-action="close-music">×</button></div><div class="service-grid"><button class="service ${E.getProvider()==='spotify'?'on':''}" data-provider="spotify"><strong>Spotify</strong><small>${sp?'Connected · best hidden playback':'Premium account required'}</small></button><button class="service ${E.getProvider()==='youtube'?'on':''}" data-provider="youtube"><strong>YouTube</strong><small>No login · keep phone face-down while YouTube plays</small></button></div>
      <div class="spotify-controls ${E.getProvider()==='spotify'?'':'hidden'}">${sp?`<select id="deviceSelect"><option value="">Automatic device</option>${deviceList.map(d=>`<option value="${esc(d.id)}" ${selected===d.id?'selected':''}>${esc(d.name)} · ${esc(d.type)}${d.is_active?' · active':''}</option>`).join('')}</select><button class="btn ghost" data-action="refresh-devices">Refresh devices</button><button class="btn danger" data-action="disconnect-spotify">Disconnect Spotify</button>`:'<button class="btn primary" data-action="connect-spotify">Connect Spotify</button>'}</div>
      <div class="diagnostic">${E.getProvider()==='spotify'?'For reliable playback, open Spotify on the target phone or speaker and play/pause once.':'YouTube remains a normal visible player while it plays. The game uses a countdown and face-down workflow so the video does not accidentally give away the song.'}</div></div></div>`;
  }

  function bind(){
    root.querySelector('[data-mode-picker]')?.addEventListener('change',event=>{const id=event.currentTarget.value;if(E.MODES?.[id]&&modeReport(id).selectable!==false){cfg.mode=id;saveCfg();render()}});
    root.querySelectorAll('[data-play]').forEach(b=>{b.setAttribute('aria-pressed',b.dataset.play===cfg.playMode?'true':'false');b.onclick=()=>{cfg.playMode=b.dataset.play;saveCfg();render()}});
    root.querySelectorAll('[data-victory]').forEach(b=>{b.setAttribute('aria-pressed',b.dataset.victory===cfg.victory?'true':'false');b.onclick=()=>{cfg.victory=b.dataset.victory;saveCfg();render()}});
    root.querySelectorAll('[data-range]').forEach(input=>{input.oninput=()=>{const key=input.dataset.range==='min'?'minYear':'maxYear',next=P.normalizeYearRange(key==='minYear'?Number(input.value):cfg.minYear,key==='maxYear'?Number(input.value):cfg.maxYear);root.querySelector('.range-values b:first-child').textContent=next.minYear;root.querySelector('.range-values b:last-child').textContent=next.maxYear};input.onchange=()=>{const key=input.dataset.range==='min'?'minYear':'maxYear',next={...cfg,[key]:Number(input.value)};Object.assign(cfg,P.normalizeYearRange(next.minYear,next.maxYear));saveCfg();render()}});
    root.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>selectSlot(Number(b.dataset.slot)));
    root.querySelectorAll('[data-provider]').forEach(b=>{b.setAttribute('aria-pressed',b.dataset.provider===E.getProvider()?'true':'false');b.onclick=()=>selectProvider(b.dataset.provider)});
    const labels={'teams-minus':'Use one fewer team','teams-plus':'Use one more team','manual':'Enter card number manually','toggle-play':playing?'Pause music':'Resume music','close-music':'Close music settings'};
    for(const [action,label] of Object.entries(labels))root.querySelector(`[data-action="${action}"]`)?.setAttribute('aria-label',label);
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
      if(a==='guess-now')b.onclick=guessNow;
      if(a==='new-card')b.onclick=newCardForRepeat;
      if(a==='retry-card')b.onclick=retryFailedCard;
      if(a==='skip-card')b.onclick=skipFailedCard;
      if(a==='listen-again')b.onclick=listenAgain;
      if(a==='replay')b.onclick=replay;
      if(a==='reveal')b.onclick=revealPhysical;
      if(a==='update-card-year')b.onclick=updateCardYearReference;
      if(a==='lock-placement')b.onclick=lockPlacement;
      if(a==='correct-answer')b.onclick=()=>finishPhysical(true);
      if(a==='wrong-answer')b.onclick=()=>finishPhysical(false);
      if(a==='next-turn')b.onclick=finishVirtualTurn;
      if(a==='open-track')b.onclick=openTrack;
      if(a==='connect-spotify')b.onclick=()=>E.spotifyConnect();
      if(a==='disconnect-spotify')b.onclick=()=>{E.spotifyDisconnect();deviceList=[];toast('Spotify disconnected.');render()};
      if(a==='refresh-devices')b.onclick=()=>refreshDevices(true);
    });
    const ds=document.getElementById('deviceSelect');if(ds)ds.onchange=()=>{E.setSpotifyDevice(ds.value);toast(ds.value?'Playback device saved.':'Device selection set to automatic.')};
    const modal=document.getElementById('musicModal');
    if(modal){
      modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','musicTitle');
      modal.querySelector('.sheet-head h2')?.setAttribute('id','musicTitle');
      modal.onclick=e=>{if(e.target===modal){musicModal=false;render()}};
    }
  }

  function onGlobalKeydown(event){
    if(!musicModal)return;
    if(event.key==='Escape'){event.preventDefault();musicModal=false;render();return}
    if(event.key!=='Tab')return;
    const modal=document.getElementById('musicModal');
    const items=[...(modal?.querySelectorAll('button:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')||[])];
    if(!items.length)return;
    const first=items[0],last=items[items.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }
  document.addEventListener('keydown',onGlobalKeydown);

  function suspendForBackground(){
    if(screen==='scanner')stopScanner();
    if(screen==='countdown'){
      cancelCountdown();
      if(match){match.phase='ready';saveMatch()}
      screen='ready';render();
    }
    if(screen==='playing'||screen==='youtube'||playing)stopPlayback();
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'){suspendForBackground();return}
    if(screen==='scanner')setTimeout(startScanner,20);
  });
  window.addEventListener('pagehide',suspendForBackground);

  function armBrowserBack(){
    if(backGuardReady)return;
    backGuardReady=true;
    history.replaceState({...(history.state||{}),gsyBase:true},document.title,location.href);
    history.pushState({gsyGuard:true},document.title,location.href);
    const onPopState=()=>{
      if(handleBack()){history.pushState({gsyGuard:true},document.title,location.href);return}
      backGuardReady=false;
      window.removeEventListener('popstate',onPopState);
      setTimeout(()=>history.back(),0);
    };
    window.addEventListener('popstate',onPopState);
  }

  function handleBack(){
    if(!P.shouldInterceptBack({musicModal,screen}))return false;
    if(musicModal){musicModal=false;render();return true}
    cancelCountdown();cancelYoutubeListening();prepareSeq++;
    if(screen==='scanner')stopScanner();
    if(screen==='playing'||screen==='youtube')stopPlayback();
    screen='resume';render();resetScroll();return true;
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
    const report=modeReport(cfg.mode);
    if(report.selectable===false){toast(`${modeInfo(cfg.mode).name} is still being built. Choose a playable mode.`);return}
    const settings={...cfg},virtualDeck=shuffle(virtualCardsForMode(cfg.mode));
    if(!rangeStats(cfg.mode).years.length){toast('No usable songs exist in the selected year range.');return}
    if(cfg.playMode==='virtual'&&!virtualDeck.length){toast(`${modeInfo(cfg.mode).name} has no playable card years in this range.`);return}
    match={active:true,id:`g${Date.now()}`,mode:cfg.mode,settings,phase:'between',round:0,turn:0,teams:Array.from({length:cfg.teams},(_,i)=>({name:`Team ${i+1}`,score:0,correct:0,wrong:0,timeline:[],starterYear:null,starterCardId:null})),used:[],history:[],virtualDeck,virtualPos:0,current:null,placementResult:null,pendingSlot:null,error:null};
    if(cfg.playMode==='virtual')ensureVirtualStarters();
    current=null;placementResult=null;pendingSlot=null;
    saveCfg();saveMatch();
    nextRound();
  }

  async function resumeMatch(){
    if(!match?.active){screen='setup';render();return}
    current=match.current||null;placementResult=match.placementResult||null;pendingSlot=Number.isInteger(match.pendingSlot)?match.pendingSlot:null;runtimeError=match.error||null;
    const phase=match.phase||'between';
    if(phase==='error'&&runtimeError){screen='error';render();return}
    if(phase==='gameover'){screen='gameover';render();return}
    if(phase==='reveal'&&current){screen='reveal';render();return}
    if(current&&current.provider!==E.getProvider()){
      const seq=++prepareSeq;
      try{
        screen='loading';render();
        const resolved=await E.resolveSong(current.song,E.getProvider());
        if(seq!==prepareSeq)return;
        current={...current,resolved,provider:E.getProvider()};
        match.current=current;saveMatch();
      }catch(err){if(seq!==prepareSeq)return;showRoundError(err,{cardId:current?.cardId,year:current?.year});return}
    }
    if(phase==='guess'&&current){screen='guess';render();return}

    if(phase==='scanner'&&cfg.playMode==='physical'){screen='scanner';render();return}
    if(['ready','countdown','youtube','playing'].includes(phase)&&current){match.phase='ready';saveMatch();screen='ready';render();return}
    nextRound();
  }

  function newGame(){
    cancelCountdown();cancelYoutubeListening();stopScanner();stopPlayback();E.destroyYouTube();playing=false;playNeedsTap=false;musicModal=false;
    prepareSeq++;match=null;current=null;pendingSlot=null;placementResult=null;runtimeError=null;
    localStorage.removeItem(MATCH_KEY);screen='setup';render();resetScroll();
  }

  function clearRoundState(){
    cancelCountdown();cancelYoutubeListening();prepareSeq++;
    current=null;pendingSlot=null;placementResult=null;runtimeError=null;playing=false;playNeedsTap=false;youtubeDownAt=0;
    E.destroyYouTube();
    if(match){match.current=null;match.placementResult=null;match.pendingSlot=null;match.error=null;match.phase='between'}
  }

  function showRoundError(err,context={}){
    cancelCountdown();cancelYoutubeListening();prepareSeq++;
    stopPlayback();E.destroyYouTube();playing=false;playNeedsTap=false;
    const code=String(err?.code||'PREPARE_FAILED');
    runtimeError={
      code,message:errorText(err),kind:P.preparationErrorKind(code),
      cardId:Number(context.cardId||current?.cardId)||null,
      year:Number(context.year||current?.year)||null
    };
    if(match){match.error=runtimeError;match.current=current;match.phase='error';saveMatch()}
    screen='error';render();resetScroll();
  }

  function retryFailedCard(){
    const cardId=Number(runtimeError?.cardId);
    if(!match||!cardId){nextRound();return}
    clearRoundState();saveMatch();prepareCard(cardId);
  }

  function skipFailedCard(){
    if(!match)return;
    nextRound();
  }

  function nextRound(){
    if(winner()){endGame('target');return}
    clearRoundState();saveMatch();
    if(cfg.playMode==='physical'){match.phase='scanner';saveMatch();screen='scanner';render();resetScroll()}
    else{const id=nextVirtualCard();if(!id){endGame('range-exhausted');return}prepareCard(id)}
  }

  function nextVirtualCard(){const id=takeVirtualCardId();saveMatch();return id}

  function rejectScannedCard(message){
    toast(message);
    if(screen==='scanner')setTimeout(startScanner,400);
  }

  async function prepareCard(cardId){
    if(!match)return;
    const year=E.cardYear(cardId);
    if(!year||!P.yearInRange(year,selectedRange())){rejectScannedCard(`That card is outside the selected range (${selectedRange().minYear}–${selectedRange().maxYear}).`);return}
    if(!(modeReport().years||[]).includes(year)){rejectScannedCard(`${modeInfo().name} has no playable song for ${year}. Scan another card.`);return}
    if(!yearHasAvailableSong(year)){if(!rangeHasAvailableSong()){endGame('range-exhausted');return}rejectScannedCard(`All usable songs for ${year} have already been used in this game. Scan another card.`);return}
    const seq=++prepareSeq;
    runtimeError=null;match.error=null;
    match.phase='loading';saveMatch();screen='loading';render();
    const excluded=[...(match.used||[])];let lastErr=null;
    for(let attempt=0;attempt<5;attempt++){
      let song=null;
      try{
        song=await E.chooseSong(year,modeId(),excluded);
        const resolved=await E.resolveSong(song,E.getProvider());
        if(seq!==prepareSeq)return;
        current={cardId,year,song,resolved,provider:E.getProvider(),mode:modeId()};
        match.current=current;match.placementResult=null;
        match.phase='ready';saveMatch();screen='ready';render();return;
      }catch(err){
        lastErr=err;
        if(song){const k=E.songUseKey?.(song)||E.songKey(song);if(!excluded.includes(k))excluded.push(k)}
        const kind=P.preparationErrorKind(err?.code);
        if(kind==='track')continue;
        break;
      }
    }
    if(seq!==prepareSeq)return;
    showRoundError(lastErr||new E.AppError('PREPARE_FAILED','The song could not be prepared.'),{cardId,year});
  }

  async function loadQr(){if(window.Html5Qrcode)return;await new Promise((res,rej)=>{const s=document.createElement('script');s.src='./vendor/html5-qrcode/html5-qrcode.min.js?v=2.3.8';s.onload=res;s.onerror=rej;document.head.appendChild(s)})}
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
    if(screen==='youtube'&&cfg.playMode==='virtual'){
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

  function beginMusicCountdown(){
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
      if(seq===prepareSeq&&screen==='countdown'){if(current?.provider==='youtube')startYouTubeListening();else startSpotifyListening()}
    },1000);
  }

  async function playCurrent(){
    if(!current||playing)return;
    if(current.provider==='spotify'){await startSpotifyListening();return}
    beginMusicCountdown();
  }

  async function startSpotifyListening(){
    if(!current||current.provider!=='spotify')return;
    const seq=++playbackSeq;
    match.phase='playing';match.current=current;saveMatch();screen='playing';render();resetScroll();
    try{
      await E.playSpotify(current.resolved.uri);
      if(seq!==playbackSeq||screen!=='playing'||!current)return;
      playing=true;playNeedsTap=false;recordSongUsed()
    }catch(err){
      if(seq!==playbackSeq)return;
      playing=false;showRoundError(err,{cardId:current?.cardId,year:current?.year});
    }
  }

  async function startYouTubeListening(){
    if(!current||current.provider!=='youtube')return;
    cancelCountdown();cancelYoutubeListening();
    const seq=++playbackSeq;
    match.phase='youtube';match.current=current;saveMatch();
    screen='youtube';render();resetScroll();
    try{
      if(current.resolved?.matchPolicy!=='title-artist-v1'){
        const resolved=await E.resolveSong(current.song,'youtube');
        if(seq!==playbackSeq||screen!=='youtube'||!current)return;
        current={...current,resolved};match.current=current;saveMatch();
      }
      const r=await E.playYouTube('youtubePlayer',current.resolved);
      // A stale startup must never tear down a newer attempt's global player.
      // The newer attempt owns cleanup once playbackSeq has advanced.
      if(seq!==playbackSeq||screen!=='youtube'||!current)return;
      if(r.videoId&&current.resolved?.videoId!==r.videoId){
        current={...current,resolved:{...current.resolved,videoId:r.videoId,url:`https://www.youtube.com/watch?v=${r.videoId}`}};
        match.current=current;saveMatch();
      }
      playing=!!r.started;playNeedsTap=!!r.needsTap;if(playing)recordSongUsed();
      if(playNeedsTap){
        document.getElementById('ytStartFallback')?.classList.remove('hidden');
        toast('Browser blocked autoplay. Tap Start YouTube, then put the phone face-down.');
        return;
      }
      armYoutubeStopTimer();
    }catch(err){
      if(seq!==playbackSeq)return;
      playing=false;
      if(err?.code==='YOUTUBE_PLAY_FAILED'){toast('That upload would not play. Swapping in another song from the same year.');await replaceCurrentSong();return}
      showRoundError(err,{cardId:current?.cardId,year:current?.year});
    }
  }

  function startYouTubeFromTap(){
    if(!current||current.provider!=='youtube'||screen!=='youtube')return;
    const seq=++playbackSeq;
    if(!E.resumeYouTube()){
      showRoundError(new E.AppError('YOUTUBE_PLAY_BLOCKED','YouTube could not start playback. Try again or change music service.'),{cardId:current.cardId,year:current.year});return;
    }
    playNeedsTap=false;document.getElementById('ytStartFallback')?.classList.add('hidden');
    const deadline=Date.now()+5000;
    const waitForPlaying=()=>{
      if(seq!==playbackSeq||screen!=='youtube'||!current)return;
      const state=E.youtubePlayer()?.getPlayerState?.();
      if(state!==1){
        if(Date.now()<deadline){setTimeout(waitForPlaying,250);return}
        playing=false;showRoundError(new E.AppError('YOUTUBE_PLAY_BLOCKED','The browser still blocked YouTube playback. Try again or change music service.'),{cardId:current.cardId,year:current.year});return;
      }
      playing=true;recordSongUsed();armYoutubeStopTimer();
    };
    setTimeout(waitForPlaying,250);
  }

  function armYoutubeStopTimer(){
    cancelYoutubeListening();
  }

  function guessNow(){
    if(!current)return;
    if(cfg.playMode==='physical'){
      cancelYoutubeListening();
      E.pauseYouTube();E.destroyYouTube();playing=false;playNeedsTap=false;
      revealPhysical();return;
    }
    if(screen==='youtube')finishYouTubeListening();
  }

  function finishYouTubeListening(){
    if(screen!=='youtube'||!current)return;
    cancelYoutubeListening();
    E.pauseYouTube();E.destroyYouTube();playing=false;playNeedsTap=false;
    match.phase='guess';match.current=current;saveMatch();
    screen='guess';render();resetScroll();
    navigator.vibrate?.([35,60,35]);
  }

  async function listenAgain(){
    if(!current)return;
    await stopPlayback();
    if(current.provider==='spotify'){await startSpotifyListening();return}
    beginMusicCountdown();
  }

  async function replaceCurrentSong(){
    if(!current)return;
    const seq=++prepareSeq;
    const {cardId,year}=current,excluded=[...(match.used||[])];
    const failedKey=E.songUseKey?.(current.song)||E.songKey(current.song);if(!excluded.includes(failedKey))excluded.push(failedKey);
    E.destroyYouTube();playing=false;match.phase='loading';saveMatch();screen='loading';render();
    let lastErr=null;
    for(let attempt=0;attempt<4;attempt++){
      let song=null;
      try{
        song=await E.chooseSong(year,modeId(),excluded);
        const resolved=await E.resolveSong(song,E.getProvider());
        if(seq!==prepareSeq)return;
        const candidateKey=E.songUseKey?.(song)||E.songKey(song);
        if(candidateKey===failedKey){lastErr=new E.AppError('YOUTUBE_PLAY_FAILED','The failed upload was selected again.');continue}
        current={cardId,year,song,resolved,provider:E.getProvider(),mode:modeId()};
        match.current=current;match.phase='ready';saveMatch();screen='ready';render();toast('A replacement track is ready.');return;
      }catch(err){lastErr=err;if(song){const k=E.songUseKey?.(song)||E.songKey(song);if(!excluded.includes(k))excluded.push(k)}if(P.preparationErrorKind(err?.code)!=='track')break}
    }
    if(seq!==prepareSeq)return;
    showRoundError(lastErr||new E.AppError('PREPARE_FAILED','No alternative song could be prepared.'),{cardId,year});
  }

  async function togglePlay(){
    if(!current)return;
    const seq=++playbackSeq;
    try{
      if(current.provider==='youtube'){
        const state=E.youtubePlayer()?.getPlayerState?.();
        if(state===1){E.pauseYouTube();playing=false}
        else{playing=E.resumeYouTube();if(!playing)throw new E.AppError('YOUTUBE_PLAY_BLOCKED','YouTube could not resume playback.')}
      }else if(playing){
        await E.pauseSpotify();if(seq!==playbackSeq)return;playing=false
      }else{
        await E.playSpotify(current.resolved.uri);
        if(seq!==playbackSeq)return;
        playing=true
      }
    }catch(err){if(seq!==playbackSeq)return;playing=false;showRoundError(err,{cardId:current?.cardId,year:current?.year})}
  }
  async function replay(){
    if(!current)return;
    const seq=++playbackSeq;
    try{
      if(current.provider==='youtube'&&!E.replayYouTube())throw new E.AppError('YOUTUBE_PLAY_BLOCKED','YouTube could not replay this track.');
      if(current.provider==='spotify'){
        await E.playSpotify(current.resolved.uri);
        if(seq!==playbackSeq)return;
      }
      playing=true;
    }catch(err){if(seq!==playbackSeq)return;playing=false;showRoundError(err,{cardId:current?.cardId,year:current?.year})}
  }
  async function stopPlayback(){
    playbackSeq++;playing=false;
    if(!current)return;
    if(current.provider==='youtube'){E.pauseYouTube();return}
    try{await E.pauseSpotify()}catch{}
  }

  function selectSlot(slot){
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
  function updateCardYearReference(){
    if(cfg.playMode!=='physical'||screen!=='reveal'||!current?.cardId)return;
    const cardId=Number(current.cardId),cardLabel=String(cardId).padStart(5,'0');
    const reference=E.cardYearReference(cardId);
    const raw=prompt(`Enter the correct printed year for card ${cardLabel}. Future scans on this device will use it.`,String(reference.year||''));
    if(raw===null)return;
    try{
      const saved=E.setCardYearReference(cardId,raw),roundYear=Number(current.year);
      render();
      if(saved.year===roundYear)toast(`Card ${cardLabel} now uses ${saved.year} on this device.`);
      else toast(`Saved card ${cardLabel} as ${saved.year}. This round used ${roundYear}; scan it again to use ${saved.year}.`);
    }catch(err){
      toast(errorText(err));
    }
  }
  function lockPlacement(){
    if(pendingSlot===null||!current||cfg.playMode!=='virtual'||!['playing','guess'].includes(screen))return;
    const team=activeTeam(),years=[...(team.timeline||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b),slot=pendingSlot;
    if(!Number.isInteger(slot)||slot<0||slot>years.length){toast('Choose a valid placement first.');pendingSlot=null;match.pendingSlot=null;saveMatch();render();return}
    const left=slot>0?years[slot-1]:null,right=slot<years.length?years[slot]:null;
    const correct=P.placementIsCorrect(years,slot,current.year);
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
  function finishVirtualTurn(){if(screen!=='reveal'||!match)return;advanceTurn()}
  function advanceTurn(){if(!match)return;match.turn=(match.turn+1)%match.teams.length;match.round++;saveMatch();nextRound()}
  function endGame(reason){if(!match)return;cancelCountdown();cancelYoutubeListening();prepareSeq++;stopScanner();stopPlayback();E.destroyYouTube();match.endReason=reason;match.phase='gameover';match.current=current;saveMatch();screen='gameover';render();resetScroll()}
  function openTrack(){const url=current?.resolved?.url;if(url)window.open(url,'_blank','noopener')}

  boot();
})();
