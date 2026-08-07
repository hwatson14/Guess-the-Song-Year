(() => {
  'use strict';

  const d = document;
  const $ = id => d.getElementById(id);
  const originalProcess = typeof processCard === 'function' ? processCard : null;
  const originalShow = typeof showAnswer === 'function' ? showAnswer : null;
  const originalReset = typeof resetRound === 'function' ? resetRound : null;
  const originalResolve = typeof resolveProvider === 'function' ? resolveProvider : null;

  const SESSION_KEY = 'gsy.session.v4';
  const CACHE_KEY = 'gsy.resolve.cache.v1';
  const START_KEY = 'gsy.startMode';
  const CLIP_KEY = 'gsy.clipLength';
  const MAX_CACHE = 350;

  let scanner = null;
  let scanning = false;
  let phase = 'uxHome';
  let motionBound = false;
  let faceDown = false;
  let countdownTimer = null;
  let clipTimer = null;
  let progressTimer = null;
  let playbackStartedAt = 0;
  let selectedSlot = null;
  let roundOutcome = null;
  let virtualPrefetch = null;
  let musicReturn = 'uxSetup';

  let session = loadSession();
  let resolveCache = loadJson(CACHE_KEY, {});

  // Make the existing US annual #1 mode explicit in the UI.
  try { if (MODES?.number1) MODES.number1.name = '#1 US'; } catch {}

  // Cache provider resolution across game sessions. This makes repeated known
  // songs instant while keeping the existing selection engine authoritative.
  if (originalResolve) {
    try {
      resolveProvider = async function cachedResolve(candidate, year, prov = provider) {
        const key = [prov, year, norm(candidate?.title), norm(candidate?.artist)].join('|');
        const cached = resolveCache[key];
        if (cached?.provider === prov) return cached;
        const result = await originalResolve(candidate, year, prov);
        resolveCache[key] = result;
        const keys = Object.keys(resolveCache);
        if (keys.length > MAX_CACHE) keys.slice(0, keys.length - MAX_CACHE).forEach(k => delete resolveCache[k]);
        localStorage.setItem(CACHE_KEY, JSON.stringify(resolveCache));
        return result;
      };
    } catch {}
  }

  function loadJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function saveSession() { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
  function loadSession() {
    const s = loadJson(SESSION_KEY, null);
    if (s?.version === 4) return s;
    return freshSession();
  }
  function freshSession() {
    return {
      version: 4,
      active: false,
      playStyle: 'physical',
      deckStrategy: 'fixed',
      fixedMode: 'greatest',
      teams: 2,
      victory: '10',
      scores: [0, 0],
      timelines: [[], []],
      currentTeam: 0,
      turn: 0,
      virtualOrder: [],
      virtualCursor: 0,
      startedAt: 0
    };
  }
  function norm(s) { return String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function esc(s) { return String(s ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c])); }
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function validModes() {
    try { return Object.entries(MODES || {}).filter(([id]) => id !== 'number1au'); } catch { return []; }
  }
  function modeName(id = mode) { try { return MODES?.[id]?.name || 'Greatest Hits'; } catch { return 'Greatest Hits'; } }
  function providerName() { try { return provider === 'spotify' ? 'Spotify' : 'YouTube'; } catch { return 'YouTube'; } }
  function teamName(i = session.currentTeam) { return session.teams === 1 ? 'Your turn' : `Team ${i + 1}`; }
  function targetText() { return session.victory === 'unlimited' ? 'Unlimited' : 'First to 10'; }
  function gameCount() { try { return Number(game?.history?.length || 0); } catch { return 0; } }
  function currentCardNumber() { return gameCount() + 1; }

  function resetCoreGame() {
    try {
      game = { history: [], used: [], assign: {} };
      if (typeof saveGame === 'function') saveGame();
      if (originalReset) originalReset();
    } catch {}
  }

  function build() {
    d.body.classList.add('ux-flow');
    const shell = d.createElement('div');
    shell.id = 'uxShell';
    shell.innerHTML = `
      <section class="ux-screen on" id="uxHome">
        <div class="ux-record-corner"></div>
        <div class="ux-home-brand"><span class="ux-spark">✦</span><h1>Guess the<span>Song Year</span></h1><p>Scan. Listen. Place. Reveal.</p></div>
        <div class="ux-card ux-hero-card">
          <div class="ux-hero-art"><div class="ux-scan-glyph">⌗</div></div>
          <div class="ux-hero-copy"><div class="ux-kicker">READY WHEN YOU ARE</div><h2 id="uxHomeHeroTitle">Start a game</h2><p id="uxHomeHeroSub">Set up the game once, then keep the phone out of the way.</p><button class="ux-btn primary" id="uxHomePrimary">Set up game</button></div>
        </div>
        <div class="ux-section-label">Current setup</div>
        <button class="ux-card ux-current-setup" id="uxHomeSetup">
          <span><small>Play</small><strong id="uxHomePlay">Real cards</strong></span>
          <span><small>Deck</small><strong id="uxHomeDeck">Greatest Hits</strong></span>
          <span><small>Teams</small><strong id="uxHomeTeams">2</strong></span>
          <span><small>Target</small><strong id="uxHomeVictory">10</strong></span>
          <b>›</b>
        </button>
        <div class="ux-returning-help" id="uxFirstHelp"><div class="ux-section-label">How it works</div><div class="ux-steps"><div><b>1</b><span>Hear</span></div><div><b>2</b><span>Place</span></div><div><b>3</b><span>Reveal</span></div><div><b>4</b><span>Score</span></div></div></div>
        <button class="ux-link-btn" id="uxMusicShortcut">♫ &nbsp; Music: <span id="uxHomeMusic">YouTube</span></button>
      </section>

      <section class="ux-screen" id="uxSetup">
        <button class="ux-back" data-back="home">‹</button><div class="ux-record-corner"></div>
        <h1 class="ux-page-title">Game Setup</h1><p class="ux-page-sub">Choose how this game will run.</p>

        <div class="ux-section-label">Cards</div>
        <div class="ux-card ux-choice-pair" id="uxPlayStyle">
          <button data-style="physical"><b>▣</b><strong>Real cards</strong><span>Scan the QR code and use the physical timeline.</span></button>
          <button data-style="virtual"><b>◇</b><strong>Virtual</strong><span>No cards needed. Place songs on an in-app timeline.</span></button>
        </div>

        <div class="ux-section-label">Deck</div>
        <div class="ux-segment" id="uxDeckStrategy"><button data-strategy="fixed">One deck</button><button data-strategy="perRound">Choose every song</button></div>
        <div id="uxFixedDeckWrap"><div class="ux-deck-list" id="uxSetupDecks"></div></div>

        <div class="ux-section-label">Teams</div>
        <div class="ux-team-grid" id="uxTeamCount"></div>
        <p class="ux-hint">Turns rotate automatically. Scores are tracked as correct cards.</p>

        <div class="ux-section-label">Victory target</div>
        <div class="ux-choice-pair compact" id="uxVictory">
          <button data-victory="10"><strong>10 cards</strong><span>First team to 10 correct cards wins.</span></button>
          <button data-victory="unlimited"><strong>Unlimited</strong><span>Keep playing until you decide to stop.</span></button>
        </div>

        <div class="ux-section-label">Music</div>
        <button class="ux-card ux-music-row" id="uxSetupMusic"><span class="ux-music-orb">♪</span><span><strong id="uxSetupMusicName">YouTube</strong><small id="uxSetupMusicState">Ready</small></span><b>Change ›</b></button>

        <button class="ux-btn primary ux-bottom-cta" id="uxStartGame">Start Game</button>
      </section>

      <section class="ux-screen" id="uxRoundDeck">
        <button class="ux-back" data-back="home">‹</button><div class="ux-record-corner"></div>
        <div class="ux-kicker" id="uxRoundDeckTeam">TEAM 1</div><h1 class="ux-page-title">Choose a Deck</h1><p class="ux-page-sub">Pick the vibe for this song.</p>
        <div class="ux-deck-list large" id="uxRoundDecks"></div>
      </section>

      <section class="ux-screen ux-full" id="uxScanner">
        <div class="ux-camera"><div id="uxReader"></div><div class="ux-camera-shade"></div></div>
        <div class="ux-camera-head"><div><div class="ux-camera-brand">Guess the Song Year</div><div class="ux-camera-team" id="uxScannerTeam">Team 1</div></div><button class="ux-camera-setting" id="uxScannerSettings">⚙</button></div>
        <div class="ux-camera-copy">Scan the QR code on the back of a card</div>
        <div class="ux-scan-frame"><i class="ux-corner tl"></i><i class="ux-corner tr"></i><i class="ux-corner bl"></i><i class="ux-corner br"></i><i class="ux-laser"></i></div>
        <div class="ux-camera-chip" id="uxScannerChip">Greatest Hits • Team 1</div>
        <div class="ux-camera-actions"><div class="ux-round-action"><button id="uxScannerBack">‹</button><span>Back</span></div><div class="ux-round-action"><button id="uxManual">#</button><span>Enter code</span></div></div>
      </section>

      <section class="ux-screen" id="uxFinding">
        <div class="ux-kicker">✦ &nbsp; SONG SELECTED</div><h1 class="ux-ready-title">Getting it ready</h1>
        <div class="ux-loader-orb"><i></i><i></i><i></i></div><p class="ux-page-sub" id="uxFindingText">Checking the catalogue.</p>
      </section>

      <section class="ux-screen" id="uxReady">
        <div class="ux-kicker">✦ &nbsp; READY TO PLAY</div><h1 class="ux-ready-title" id="uxReadyTeam">Team 1</h1>
        <div class="ux-phone-photo" aria-hidden="true"></div>
        <div class="ux-ready-copy"><h2>Flip your phone</h2><p>Music starts when the screen is face-down.</p></div>
        <div class="ux-lock-chip">▣ &nbsp; Song locked • answer hidden</div>
        <button class="ux-countdown-link" id="uxUseCountdown">Use 3 second countdown instead</button>
        <div class="ux-progress-caption" id="uxProgressCaption"></div><div class="ux-score-row" id="uxReadyScores"></div>
      </section>

      <section class="ux-screen ux-countdown-screen" id="uxCountdown"><div class="ux-kicker">GET READY</div><div class="ux-count-number" id="uxCountNumber">3</div><p class="ux-page-sub">Put the phone face-down before the music starts.</p></section>

      <section class="ux-screen" id="uxPlaying">
        <div class="ux-playing-head"><div><div class="ux-kicker" id="uxPlayingTeam">TEAM 1</div><h1 class="ux-playing-title">Now Playing</h1></div><button class="ux-round-settings" id="uxPlayingSettings">⚙</button></div>
        <div class="ux-device-line" id="uxPlayingDevice">Music device • metadata hidden</div>
        <div class="ux-wave-card"><div class="ux-wave-lines"></div><button class="ux-pause" id="uxPause">Ⅱ</button><div class="ux-progressbar"><span id="uxPlayProgress"></span></div><div class="ux-progress-time" id="uxElapsed">0:00</div></div>
        <div id="uxYoutubeHost" class="ux-youtube-host"></div>

        <div id="uxPhysicalPlace" class="ux-place-panel">
          <h2>Place the card on your timeline</h2><p>Before, after, or between the cards already on the table.</p>
          <div class="ux-abstract-table"><i></i><i></i><b></b><i></i><i></i></div>
          <button class="ux-replay" id="uxReplayPhysical">↻ &nbsp; Replay</button>
          <button class="ux-btn primary" id="uxRevealPhysical">Reveal Answer</button>
          <div class="ux-reveal-note">Reveal only after the card has been placed.</div>
        </div>

        <div id="uxVirtualPlace" class="ux-place-panel hidden">
          <h2>Place the song on your timeline</h2><p>Tap the gap where you think this song belongs.</p>
          <div class="ux-virtual-timeline" id="uxTimeline"></div>
          <button class="ux-replay" id="uxReplayVirtual">↻ &nbsp; Replay</button>
          <button class="ux-btn primary" id="uxLockPlacement" disabled>Lock In Placement</button>
        </div>
      </section>

      <section class="ux-screen" id="uxReveal">
        <div class="ux-record-corner"></div><div class="ux-kicker" id="uxRevealTeam">TEAM 1</div><h1 class="ux-reveal-heading" id="uxRevealHeading">Reveal</h1><div class="ux-reveal-sub" id="uxRevealSub"></div>
        <div class="ux-card glow ux-answer-card"><div class="ux-answer-top"><div class="ux-cover-photo"></div><div><div class="ux-answer-song" id="uxAnswerSong">Song</div><div class="ux-answer-artist" id="uxAnswerArtist">Artist</div></div></div><div class="ux-answer-year" id="uxAnswerYear">1996</div><div class="ux-answer-verdict" id="uxVerdict"></div></div>
        <div id="uxPhysicalJudge">
          <div class="ux-section-label">Did it fit?</div><p class="ux-judge-copy">If the year fits where you placed the physical card, keep it. Otherwise discard it.</p>
          <div class="ux-two-actions"><button class="ux-btn secondary" id="uxDiscard">Discard</button><button class="ux-btn primary" id="uxKeep">Keep card ✓</button></div>
        </div>
        <div id="uxVirtualJudge" class="hidden"><button class="ux-btn primary" id="uxVirtualNext">Next Turn</button></div>
        <button class="ux-open-music" id="uxOpenTrack">♫ &nbsp; Show song in music app</button>
      </section>

      <section class="ux-screen" id="uxGameOver">
        <div class="ux-record-corner"></div><div class="ux-kicker">✦ &nbsp; GAME COMPLETE</div><h1 class="ux-winner" id="uxWinner">Team 1 wins</h1><p class="ux-page-sub">First to 10 correct cards.</p>
        <div class="ux-card ux-final-scores" id="uxFinalScores"></div>
        <button class="ux-btn primary" id="uxPlayAgain">Play Again</button><button class="ux-btn secondary" id="uxKeepPlaying">Keep Playing</button><button class="ux-link-btn" id="uxGameOverHome">Home</button>
      </section>

      <section class="ux-screen" id="uxMusic">
        <button class="ux-back" data-back="setup">‹</button><div class="ux-record-corner"></div><h1 class="ux-page-title">Music</h1><p class="ux-page-sub">Choose how songs play.</p>
        <div class="ux-section-label">Service</div>
        <button class="ux-card ux-service" id="uxSpotifyService"><span class="ux-service-icon spotify">♪</span><span><h3>Spotify</h3><p id="uxSpotifyState">Not connected</p></span><b id="uxSpotifyCheck"></b></button>
        <button class="ux-card ux-service" id="uxYoutubeService"><span class="ux-service-icon youtube">▶</span><span><h3>YouTube</h3><p id="uxYoutubeState">Ready</p></span><b id="uxYoutubeCheck"></b></button>
        <div class="ux-section-label">Playback</div><div class="ux-segment" id="uxClipLength"><button data-clip="full">Full track</button><button data-clip="30">30 sec</button></div>
        <div class="ux-section-label">Spotify device</div><div class="ux-card ux-device-card"><span class="ux-speaker-icon">▥</span><span><strong id="uxDeviceName">Active Spotify device</strong><small id="uxDeviceSub">Open Spotify and play/pause once if no device appears.</small></span><button id="uxChangeDevice">Refresh</button></div>
        <div class="ux-section-label">Hide track info</div><div class="ux-card ux-hide-card"><div><strong>Flip phone to start</strong><small>Best with Spotify. Keeps this screen free of title and artist.</small></div><div class="ux-segment" id="uxStartMethod"><button data-start="flip">Gyroscope</button><button data-start="countdown">3 sec</button></div></div>
        <button class="ux-link-btn danger" id="uxDisconnect">Disconnect Spotify</button><button class="ux-btn primary ux-bottom-cta" id="uxMusicDone">Done</button>
      </section>

      <div class="ux-sheet" id="uxSheet"><div class="ux-sheet-card"><div class="ux-sheet-head"><div><div class="ux-kicker">GAME SETTINGS</div><h2>Quick changes</h2></div><button id="uxSheetClose">×</button></div><button class="ux-card ux-sheet-row" id="uxSheetSetup">Game setup <b>›</b></button><button class="ux-card ux-sheet-row" id="uxSheetMusic">Music <b>›</b></button><button class="ux-link-btn" id="uxAdvanced">Advanced diagnostics</button></div></div>
    `;
    d.body.appendChild(shell);
    buildModeLists();
    bind();
    try { if (E?.ytWrap) $('uxYoutubeHost').appendChild(E.ytWrap); } catch {}
    try { ensureCatalog?.().catch(() => {}); } catch {}
    renderAll();
  }

  function buildModeLists() {
    const setup = $('uxSetupDecks');
    const round = $('uxRoundDecks');
    setup.innerHTML = '';
    round.innerHTML = '';
    validModes().forEach(([id, m], idx) => {
      const label = id === 'number1' ? '#1 US' : m.name;
      const desc = id === 'number1' ? 'Billboard year-end chart topper for that year.' : (m.desc || '');
      const artClass = ['vinyl','australia','hourglass','city','bolt','dance','wild'][idx % 7];
      const make = (target, large = false) => {
        const b = d.createElement('button');
        b.className = `ux-card ux-deck ${large ? 'round' : ''}`;
        b.dataset.mode = id;
        b.innerHTML = `<span class="ux-deck-art ${artClass}"></span><span class="ux-deck-copy"><strong>${esc(label)}</strong><small>${esc(desc)}</small></span><b class="ux-deck-check">›</b>`;
        target.appendChild(b);
      };
      make(setup, false);
      make(round, true);
    });
  }

  function buildTeamButtons() {
    const box = $('uxTeamCount');
    box.innerHTML = '';
    for (let n = 1; n <= 6; n++) {
      const b = d.createElement('button');
      b.dataset.teams = String(n);
      b.textContent = String(n);
      box.appendChild(b);
    }
  }

  function bind() {
    buildTeamButtons();
    $('uxHomePrimary').onclick = () => session.active ? resumeGame() : setScreen('uxSetup');
    $('uxHomeSetup').onclick = () => setScreen('uxSetup');
    $('uxMusicShortcut').onclick = () => { musicReturn = session.active ? phase : 'uxHome'; setScreen('uxMusic'); };
    d.querySelectorAll('[data-back]').forEach(b => b.onclick = () => setScreen(b.dataset.back === 'setup' ? 'uxSetup' : 'uxHome'));

    d.querySelectorAll('#uxPlayStyle [data-style]').forEach(b => b.onclick = () => { session.playStyle = b.dataset.style; saveSession(); renderAll(); });
    d.querySelectorAll('#uxDeckStrategy [data-strategy]').forEach(b => b.onclick = () => { session.deckStrategy = b.dataset.strategy; saveSession(); renderAll(); });
    d.querySelectorAll('#uxVictory [data-victory]').forEach(b => b.onclick = () => { session.victory = b.dataset.victory; saveSession(); renderAll(); });
    d.querySelectorAll('#uxSetupDecks [data-mode]').forEach(b => b.onclick = () => { session.fixedMode = b.dataset.mode; saveSession(); renderAll(); });
    d.querySelectorAll('#uxTeamCount [data-teams]').forEach(b => b.onclick = () => { session.teams = Number(b.dataset.teams); normalizeTeamState(); saveSession(); renderAll(); });
    $('uxSetupMusic').onclick = () => { musicReturn = 'uxSetup'; setScreen('uxMusic'); };
    $('uxStartGame').onclick = startGame;

    d.querySelectorAll('#uxRoundDecks [data-mode]').forEach(b => b.onclick = () => beginTurnWithMode(b.dataset.mode));

    $('uxScannerBack').onclick = () => { stopScanner(); setScreen('uxHome'); };
    $('uxScannerSettings').onclick = openSheet;
    $('uxPlayingSettings').onclick = openSheet;
    $('uxManual').onclick = () => manualCode();

    $('uxUseCountdown').onclick = startCountdown;
    $('uxPause').onclick = pausePlayback;
    $('uxReplayPhysical').onclick = replayCurrent;
    $('uxReplayVirtual').onclick = replayCurrent;
    $('uxRevealPhysical').onclick = revealPhysical;
    $('uxLockPlacement').onclick = lockVirtualPlacement;
    $('uxKeep').onclick = () => finalizePhysical(true);
    $('uxDiscard').onclick = () => finalizePhysical(false);
    $('uxVirtualNext').onclick = nextTurn;
    $('uxOpenTrack').onclick = openCurrentTrack;

    $('uxSpotifyService').onclick = chooseSpotify;
    $('uxYoutubeService').onclick = () => { try { selectProvider('youtube'); } catch {} renderAll(); };
    d.querySelectorAll('#uxClipLength [data-clip]').forEach(b => b.onclick = () => { localStorage.setItem(CLIP_KEY, b.dataset.clip); renderAll(); });
    d.querySelectorAll('#uxStartMethod [data-start]').forEach(b => b.onclick = () => { localStorage.setItem(START_KEY, b.dataset.start); renderAll(); });
    $('uxChangeDevice').onclick = refreshSpotifyDevices;
    $('uxDisconnect').onclick = () => { try { logout(); } catch {} renderAll(); };
    $('uxMusicDone').onclick = () => setScreen(musicReturn || (session.active ? 'uxHome' : 'uxSetup'));

    $('uxSheetClose').onclick = closeSheet;
    $('uxSheet').onclick = e => { if (e.target.id === 'uxSheet') closeSheet(); };
    $('uxSheetSetup').onclick = () => { closeSheet(); setScreen('uxSetup'); };
    $('uxSheetMusic').onclick = () => { musicReturn = phase; closeSheet(); setScreen('uxMusic'); };
    $('uxAdvanced').onclick = () => { closeSheet(); showLegacySettings(); };

    $('uxPlayAgain').onclick = () => { const prev = {...session}; session = freshSession(); Object.assign(session, {playStyle:prev.playStyle, deckStrategy:prev.deckStrategy, fixedMode:prev.fixedMode, teams:prev.teams, victory:prev.victory}); saveSession(); setScreen('uxSetup'); };
    $('uxKeepPlaying').onclick = () => { session.victory = 'unlimited'; saveSession(); nextTurn(); };
    $('uxGameOverHome').onclick = () => { session.active = false; saveSession(); setScreen('uxHome'); };

    d.addEventListener('visibilitychange', () => { if (d.hidden && scanning) stopScanner(); });
  }

  function normalizeTeamState() {
    session.scores = Array.from({length: session.teams}, (_, i) => Number(session.scores?.[i] || 0));
    session.timelines = Array.from({length: session.teams}, (_, i) => Array.isArray(session.timelines?.[i]) ? session.timelines[i] : []);
    if (session.currentTeam >= session.teams) session.currentTeam = 0;
  }

  function startGame() {
    localStorage.setItem('gsy.played.once','1');
    normalizeTeamState();
    resetCoreGame();
    session.active = true;
    session.scores = Array(session.teams).fill(0);
    session.timelines = Array.from({length: session.teams}, () => []);
    session.currentTeam = 0;
    session.turn = 0;
    session.startedAt = Date.now();
    session.virtualOrder = shuffle(Array.from({length: 308}, (_, i) => i + 1));
    session.virtualCursor = 0;

    if (session.playStyle === 'virtual') {
      // Give each team a neutral starter year from the same deck distribution.
      for (let i = 0; i < session.teams; i++) {
        const id = nextVirtualId();
        const y = Number(YEARS?.[id] || 0);
        if (y) session.timelines[i] = [y];
      }
    }
    saveSession();
    virtualPrefetch = null;
    startTurn();
  }

  function resumeGame() {
    normalizeTeamState();
    if (!session.active) return setScreen('uxSetup');
    startTurn();
  }

  function startTurn() {
    roundOutcome = null;
    selectedSlot = null;
    stopPlaybackTimers();
    if (session.deckStrategy === 'perRound') {
      $('uxRoundDeckTeam').textContent = teamName().toUpperCase();
      setScreen('uxRoundDeck');
    } else {
      beginTurnWithMode(session.fixedMode);
    }
  }

  function beginTurnWithMode(modeId) {
    try { selectMode(modeId); } catch { try { mode = modeId; } catch {} }
    if (session.playStyle === 'physical') startScanner();
    else startVirtualRound(modeId);
  }

  function nextVirtualId() {
    if (!session.virtualOrder?.length || session.virtualCursor >= session.virtualOrder.length) {
      session.virtualOrder = shuffle(Array.from({length: 308}, (_, i) => i + 1));
      session.virtualCursor = 0;
    }
    return session.virtualOrder[session.virtualCursor++];
  }

  async function startVirtualRound(modeId) {
    setScreen('uxFinding');
    $('uxFindingText').textContent = `${modeName(modeId)} · ${providerName()}`;
    try {
      const id = nextVirtualId();
      const year = Number(YEARS?.[id] || 0);
      if (!year) throw new Error('Could not generate a valid virtual card.');
      let result = null;
      if (virtualPrefetch && virtualPrefetch.id === id && virtualPrefetch.mode === modeId && virtualPrefetch.provider === provider) {
        result = virtualPrefetch.result;
        virtualPrefetch = null;
      } else {
        result = await chooseAndResolve(year, modeId, provider);
      }
      current = { id, year, candidate: result.candidate, resolved: result.resolved, mode: modeId, provider };
      saveSession();
      afterSongReady();
    } catch (e) {
      toast(e?.message || String(e));
      setTimeout(() => startTurn(), 1200);
    }
  }

  async function startScanner() {
    stopPlaybackTimers();
    setScreen('uxScanner');
    $('uxScannerTeam').textContent = teamName();
    $('uxScannerChip').textContent = `${modeName()} • ${teamName()}`;
    try {
      await loadQrLibrary();
      if (scanner) { try { await scanner.clear(); } catch {} }
      scanner = new Html5Qrcode('uxReader');
      await scanner.start({facingMode:'environment'}, {fps:12, qrbox:{width:260,height:260}, aspectRatio:1}, async text => {
        if (!scanning) return;
        scanning = false;
        navigator.vibrate?.(40);
        await stopScanner();
        await processPhysicalScan(text);
      }, () => {});
      scanning = true;
    } catch (e) {
      toast('Camera could not start. Allow camera access or enter the card code.');
    }
  }

  async function loadQrLibrary() {
    if (window.Html5Qrcode) return;
    if (typeof loadQr === 'function') return loadQr();
    await new Promise((resolve, reject) => {
      const s = d.createElement('script');
      s.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
      s.onload = resolve; s.onerror = reject; d.head.appendChild(s);
    });
  }

  async function stopScanner() {
    if (!scanner) return;
    try { if (scanning) await scanner.stop(); } catch {}
    try { await scanner.clear(); } catch {}
    scanning = false;
  }

  function manualCode() {
    const raw = prompt('Enter the 5-digit card ID or QR URL:');
    if (raw) processPhysicalScan(raw);
  }

  async function processPhysicalScan(raw) {
    await stopScanner();
    setScreen('uxFinding');
    $('uxFindingText').textContent = `${modeName()} · ${providerName()}`;
    try {
      let savedSpotify = null;
      try {
        // The legacy physical path auto-starts Spotify. Suppress that so the
        // new flip/countdown interaction remains authoritative.
        if (provider === 'spotify' && typeof spotifyPlay === 'function') {
          savedSpotify = spotifyPlay;
          spotifyPlay = async () => null;
        }
        await originalProcess(raw);
      } finally {
        if (savedSpotify) spotifyPlay = savedSpotify;
      }
      if (!current) throw new Error('No song was selected.');
      afterSongReady();
    } catch (e) {
      toast(e?.message || String(e));
      setTimeout(startScanner, 1200);
    }
  }

  function afterSongReady() {
    $('uxReadyTeam').textContent = teamName();
    $('uxProgressCaption').textContent = scoreCaption();
    renderScoreRow('uxReadyScores');
    setScreen('uxReady');
    const startMode = localStorage.getItem(START_KEY) || 'flip';
    if (startMode === 'countdown') return startCountdown();
    requestMotion().then(ok => { if (!ok) $('uxUseCountdown').classList.add('attention'); });
  }

  async function requestMotion() {
    if (motionBound) return true;
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        if (await DeviceMotionEvent.requestPermission() !== 'granted') return false;
      }
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        if (await DeviceOrientationEvent.requestPermission() !== 'granted') return false;
      }
      if (typeof DeviceOrientationEvent !== 'undefined') window.addEventListener('deviceorientation', onOrientation, {passive:true});
      motionBound = true;
      return true;
    } catch { return false; }
  }

  function onOrientation(e) {
    const beta = Number(e.beta), gamma = Number(e.gamma);
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return;
    const down = Math.abs(beta) > 135 && Math.abs(gamma) < 70;
    const changed = down !== faceDown;
    faceDown = down;
    if (phase === 'uxReady' && changed && down && (localStorage.getItem(START_KEY) || 'flip') === 'flip') beginPlayback();
  }

  function startCountdown() {
    clearInterval(countdownTimer);
    setScreen('uxCountdown');
    let n = 3;
    $('uxCountNumber').textContent = n;
    countdownTimer = setInterval(() => {
      n -= 1;
      if (n <= 0) { clearInterval(countdownTimer); countdownTimer = null; beginPlayback(); }
      else $('uxCountNumber').textContent = n;
    }, 850);
  }

  async function beginPlayback() {
    if (!current) return;
    try {
      if (provider === 'youtube') {
        try { E?.ytWrap?.classList.remove('hidden'); } catch {}
        await startYoutubePlayback();
      } else {
        await spotifyPlay(current.resolved.uri);
      }
      playbackStartedAt = Date.now();
      setScreen('uxPlaying');
      $('uxPlayingTeam').textContent = teamName().toUpperCase();
      $('uxPlayingDevice').textContent = `${providerName()} • metadata hidden here`;
      $('uxPhysicalPlace').classList.toggle('hidden', session.playStyle !== 'physical');
      $('uxVirtualPlace').classList.toggle('hidden', session.playStyle !== 'virtual');
      if (session.playStyle === 'virtual') renderVirtualTimeline();
      startPlaybackTimers();
    } catch (e) {
      toast(e?.message || String(e));
    }
  }

  function startPlaybackTimers() {
    stopPlaybackTimers();
    playbackStartedAt = Date.now();
    const clip = localStorage.getItem(CLIP_KEY) || 'full';
    progressTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - playbackStartedAt) / 1000);
      $('uxElapsed').textContent = clip === '30' ? `${fmt(elapsed)} / 0:30` : fmt(elapsed);
      $('uxPlayProgress').style.width = clip === '30' ? `${Math.min(100, elapsed / 30 * 100)}%` : `${Math.min(95, elapsed / 180 * 100)}%`;
    }, 500);
    if (clip === '30') clipTimer = setTimeout(pausePlayback, 30000);
  }

  function stopPlaybackTimers() {
    if (clipTimer) clearTimeout(clipTimer);
    if (progressTimer) clearInterval(progressTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    clipTimer = progressTimer = countdownTimer = null;
  }

  function fmt(sec) { const m = Math.floor(sec/60), s = String(sec%60).padStart(2,'0'); return `${m}:${s}`; }

  async function pausePlayback() {
    stopPlaybackTimers();
    try {
      if (provider === 'youtube') ytPlayer?.pauseVideo?.();
      else if (typeof api === 'function') await api('/me/player/pause', {method:'PUT'}, true);
    } catch {}
  }

  async function replayCurrent() {
    if (!current) return;
    try {
      if (provider === 'youtube') {
        if (ytPlayer?.seekTo) { ytPlayer.seekTo(0, true); ytPlayer.playVideo?.(); }
        else await startYoutubePlayback();
      } else await spotifyPlay(current.resolved.uri);
      startPlaybackTimers();
    } catch (e) { toast(e?.message || String(e)); }
  }

  function renderVirtualTimeline() {
    const timeline = [...(session.timelines[session.currentTeam] || [])].sort((a,b)=>a-b);
    const box = $('uxTimeline');
    box.innerHTML = '';
    selectedSlot = null;
    $('uxLockPlacement').disabled = true;
    for (let i = 0; i <= timeline.length; i++) {
      const slot = d.createElement('button');
      slot.className = 'ux-slot-button';
      slot.dataset.slot = String(i);
      slot.innerHTML = '<span>＋</span><small>place here</small>';
      slot.onclick = () => selectVirtualSlot(i);
      box.appendChild(slot);
      if (i < timeline.length) {
        const card = d.createElement('div');
        card.className = 'ux-timeline-card';
        card.innerHTML = `<b>${timeline[i]}</b><small>${ordinal(i+1)} card</small>`;
        box.appendChild(card);
      }
    }
    setTimeout(() => box.querySelector('.ux-slot-button')?.scrollIntoView({inline:'center',block:'nearest'}), 50);
  }

  function selectVirtualSlot(i) {
    selectedSlot = i;
    d.querySelectorAll('.ux-slot-button').forEach(x => x.classList.toggle('on', Number(x.dataset.slot) === i));
    $('uxLockPlacement').disabled = false;
  }

  function ordinal(n) { const s=['th','st','nd','rd'],v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); }

  function lockVirtualPlacement() {
    if (selectedSlot == null || !current) return;
    pausePlayback();
    const timeline = [...(session.timelines[session.currentTeam] || [])].sort((a,b)=>a-b);
    const prev = selectedSlot > 0 ? timeline[selectedSlot - 1] : null;
    const next = selectedSlot < timeline.length ? timeline[selectedSlot] : null;
    const y = current.year;
    const correct = (prev == null || prev <= y) && (next == null || y <= next);
    roundOutcome = { correct, selectedSlot, previous: prev, next };
    if (correct) {
      timeline.splice(selectedSlot, 0, y);
      session.timelines[session.currentTeam] = timeline;
    }
    revealCommon(correct);
  }

  function revealPhysical() {
    pausePlayback();
    roundOutcome = null;
    revealCommon(null);
  }

  function revealCommon(correct) {
    if (!current) return;
    try { originalShow?.(); } catch {}
    $('uxRevealTeam').textContent = teamName().toUpperCase();
    $('uxRevealHeading').textContent = correct === true ? 'Correct!' : correct === false ? 'Not quite' : 'Reveal';
    $('uxRevealSub').textContent = `${modeName(current.mode)} • ${providerName()}`;
    $('uxAnswerSong').textContent = current.candidate?.title || 'Unknown song';
    $('uxAnswerArtist').textContent = current.candidate?.artist || '';
    $('uxAnswerYear').textContent = current.year || '----';
    $('uxVerdict').textContent = correct === true ? 'Perfect placement ✓' : correct === false ? 'That placement breaks the timeline.' : 'Check the physical timeline.';
    $('uxPhysicalJudge').classList.toggle('hidden', session.playStyle !== 'physical');
    $('uxVirtualJudge').classList.toggle('hidden', session.playStyle !== 'virtual');
    setScreen('uxReveal');
    if (session.playStyle === 'virtual') finalizeVirtual(correct);
  }

  function finalizeVirtual(correct) {
    if (correct) session.scores[session.currentTeam] += 1;
    session.turn += 1;
    saveSession();
    renderAll();
  }

  function finalizePhysical(correct) {
    if (correct) session.scores[session.currentTeam] += 1;
    session.turn += 1;
    saveSession();
    if (checkWinner()) return;
    nextTurn();
  }

  function nextTurn() {
    if (session.playStyle === 'virtual' && checkWinner()) return;
    try { originalReset?.(); } catch {}
    current = null;
    roundOutcome = null;
    session.currentTeam = (session.currentTeam + 1) % session.teams;
    saveSession();
    setScreen('uxHome');
    prefetchNextVirtual();
    setTimeout(startTurn, 120);
  }

  function checkWinner() {
    if (session.victory !== '10') return false;
    const winner = session.scores.findIndex(x => x >= 10);
    if (winner < 0) return false;
    session.active = false;
    saveSession();
    $('uxWinner').textContent = session.teams === 1 ? '10 cards collected!' : `Team ${winner + 1} wins`;
    $('uxFinalScores').innerHTML = session.scores.map((s,i)=>`<div><span>Team ${i+1}</span><b>${s}</b></div>`).join('');
    setScreen('uxGameOver');
    return true;
  }

  async function prefetchNextVirtual() {
    if (session.playStyle !== 'virtual' || session.deckStrategy !== 'fixed' || !session.active) return;
    try {
      const cursor = session.virtualCursor;
      if (!session.virtualOrder?.length || cursor >= session.virtualOrder.length) return;
      const id = session.virtualOrder[cursor];
      const year = Number(YEARS?.[id] || 0);
      if (!year) return;
      const modeId = session.fixedMode;
      const result = await chooseAndResolve(year, modeId, provider);
      virtualPrefetch = {id, mode:modeId, provider, result};
    } catch { virtualPrefetch = null; }
  }

  function openCurrentTrack() {
    const url = current?.resolved?.url;
    if (url) window.open(url, '_blank', 'noopener');
  }

  function scoreCaption() {
    if (session.teams === 1) return `${session.scores[0]} correct • ${targetText()}`;
    return `${teamName()} • ${session.scores[session.currentTeam]} correct`;
  }

  function renderScoreRow(id) {
    const box = $(id);
    if (!box) return;
    box.innerHTML = session.scores.map((s,i)=>`<span class="${i===session.currentTeam?'on':''}"><small>Team ${i+1}</small><b>${s}</b></span>`).join('');
  }

  function renderAll() {
    normalizeTeamState();
    $('uxHomePlay').textContent = session.playStyle === 'physical' ? 'Real cards' : 'Virtual';
    $('uxHomeDeck').textContent = session.deckStrategy === 'perRound' ? 'Choose each song' : modeName(session.fixedMode);
    $('uxHomeTeams').textContent = String(session.teams);
    $('uxHomeVictory').textContent = session.victory === 'unlimited' ? '∞' : '10';
    $('uxHomeMusic').textContent = providerName();
    $('uxHomeHeroTitle').textContent = session.active ? 'Continue game' : 'Start a game';
    $('uxHomeHeroSub').textContent = session.active ? `${teamName()} • ${scoreCaption()}` : 'Choose cards, deck, teams and victory target.';
    $('uxHomePrimary').textContent = session.active ? 'Continue' : 'Set up game';
    $('uxFirstHelp').classList.toggle('hidden', !!localStorage.getItem('gsy.played.once'));

    d.querySelectorAll('#uxPlayStyle [data-style]').forEach(b=>b.classList.toggle('on',b.dataset.style===session.playStyle));
    d.querySelectorAll('#uxDeckStrategy [data-strategy]').forEach(b=>b.classList.toggle('on',b.dataset.strategy===session.deckStrategy));
    $('uxFixedDeckWrap').classList.toggle('hidden', session.deckStrategy !== 'fixed');
    d.querySelectorAll('#uxSetupDecks [data-mode]').forEach(b=>{const on=b.dataset.mode===session.fixedMode;b.classList.toggle('on',on);const c=b.querySelector('.ux-deck-check');if(c)c.textContent=on?'✓':'›';});
    d.querySelectorAll('#uxTeamCount [data-teams]').forEach(b=>b.classList.toggle('on',Number(b.dataset.teams)===session.teams));
    d.querySelectorAll('#uxVictory [data-victory]').forEach(b=>b.classList.toggle('on',b.dataset.victory===session.victory));

    $('uxSetupMusicName').textContent = providerName();
    $('uxSetupMusicState').textContent = provider === 'spotify' ? (safeAuth() ? 'Connected' : 'Tap to connect') : 'Ready • ads may appear';
    $('uxSpotifyState').textContent = safeAuth() ? 'Connected' : 'Tap to connect';
    $('uxYoutubeState').textContent = 'Ready • no login';
    $('uxSpotifyCheck').textContent = provider === 'spotify' ? '✓' : '›';
    $('uxYoutubeCheck').textContent = provider === 'youtube' ? '✓' : '›';
    $('uxSpotifyService').classList.toggle('on', provider === 'spotify');
    $('uxYoutubeService').classList.toggle('on', provider === 'youtube');
    const clip = localStorage.getItem(CLIP_KEY) || 'full';
    d.querySelectorAll('#uxClipLength [data-clip]').forEach(b=>b.classList.toggle('on',b.dataset.clip===clip));
    const sm = localStorage.getItem(START_KEY) || 'flip';
    d.querySelectorAll('#uxStartMethod [data-start]').forEach(b=>b.classList.toggle('on',b.dataset.start===sm));
    renderScoreRow('uxReadyScores');
  }

  function safeAuth() { try { return !!auth(); } catch { return false; } }

  async function chooseSpotify() {
    try { selectProvider('spotify'); } catch {}
    renderAll();
    if (!safeAuth()) {
      try { await login(); } catch (e) { toast(e?.message || String(e)); }
    } else refreshSpotifyDevices();
  }

  async function refreshSpotifyDevices() {
    if (!safeAuth()) return toast('Connect Spotify first.');
    try {
      await devices();
      const select = E?.device;
      let label = 'Active Spotify device';
      if (select?.selectedOptions?.[0]?.textContent) label = select.selectedOptions[0].textContent.replace(/ · active/g,'');
      $('uxDeviceName').textContent = label;
      $('uxDeviceSub').textContent = 'Spotify Connect';
    } catch (e) { toast(e?.message || String(e)); }
  }

  function openSheet() { $('uxSheet').classList.add('on'); }
  function closeSheet() { $('uxSheet').classList.remove('on'); }

  function showLegacySettings() {
    d.body.classList.remove('ux-flow');
    $('uxShell').style.display = 'none';
    try { view('settings'); } catch {}
    const returnBtn = d.createElement('button');
    returnBtn.className = 'ux-floating-return';
    returnBtn.textContent = '← Return to game';
    returnBtn.onclick = () => { returnBtn.remove(); d.body.classList.add('ux-flow'); $('uxShell').style.display=''; try{view('play')}catch{}; setScreen('uxHome'); };
    d.body.appendChild(returnBtn);
  }

  function setScreen(id) {
    d.querySelectorAll('.ux-screen').forEach(x=>x.classList.toggle('on',x.id===id));
    phase = id;
    window.scrollTo({top:0,behavior:'instant'});
    renderAll();
  }

  function toast(text) {
    $('uxToast')?.remove();
    const x = d.createElement('div');
    x.id = 'uxToast'; x.className = 'ux-toast'; x.textContent = text;
    d.body.appendChild(x); setTimeout(()=>x.remove(),4200);
  }

  build();
})();
