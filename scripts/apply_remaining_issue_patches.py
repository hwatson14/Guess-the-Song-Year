#!/usr/bin/env python3
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def replace_once(path, old, new):
    p=ROOT/path
    text=p.read_text(encoding='utf-8')
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'{path}: expected one replacement target, found {count}: {old[:100]!r}')
    p.write_text(text.replace(old,new,1),encoding='utf-8')

def append_once(path, marker, addition):
    p=ROOT/path
    text=p.read_text(encoding='utf-8')
    if marker in text:
        return
    p.write_text(text.rstrip()+"\n\n"+addition.strip()+"\n",encoding='utf-8')

# Generalise runtime mode support and make screen-work relationships first-class gameplay identities.
replace_once('engine-v7.js',"  const supported=['greatest','australian','unexpected','number1_us','number1_au'];\n  for(const id of Object.keys(E.MODES||{}))if(!supported.includes(id))delete E.MODES[id];\n\n",'')
replace_once('engine-v7.js',"  function underlyingKey(song){\n    if(song?.songId)return String(song.songId);", "  function underlyingKey(song){\n    if(song?.relationshipType==='screen-work-theme'&&song?.relationshipId)return String(song.relationshipId);\n    if(song?.songId)return String(song.songId);")

# Render mode counts/year semantics natively in app.js.
replace_once('app.js',"function modeReport(id=modeId()){return modeReports[id]||{id,status:'preview',statusLabel:'Loading',coverage:0,totalYears:73,coverageLabel:'Checking coverage',years:[],selectable:true,statusNote:'Catalogue status is being checked.'}}", "function modeReport(id=modeId()){return modeReports[id]||{id,status:'preview',statusLabel:'Loading',coverage:0,totalYears:73,coverageLabel:'Checking coverage',years:[],songs:0,selectable:true,statusNote:'Catalogue status is being checked.'}}")
replace_once('app.js',"  function modeStatusClass(id=modeId()){return ['ready','beta','preview'].includes(modeReport(id).status)?modeReport(id).status:'building'}\n", "  function modeStatusClass(id=modeId()){return ['ready','beta','preview'].includes(modeReport(id).status)?modeReport(id).status:'building'}\n  function songCountLabel(value){const n=Math.max(0,Number(value)||0);return `${n.toLocaleString()} ${n===1?'song':'songs'}`}\n  function yearBasisLabel(report=modeReport()){return report.yearBasis==='chart'?'chart year':report.yearBasis==='screen'?'movie/show year':report.yearBasis==='original'?'original song year':'release year'}\n  function placementLabel(years,index){return index===0?`Before ${years[0]??'timeline'}`:index===years.length?`After ${years.at(-1)??'timeline'}`:`Between ${years[index-1]} and ${years[index]}`}\n  function placementLockCopy(){if(pendingSlot===null)return 'Lock Placement';const years=[...(activeTeam().timeline||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b),label=placementLabel(years,pendingSlot);return `Lock ${label.charAt(0).toLowerCase()}${label.slice(1)}`}\n")
replace_once('app.js',"    const modeOptions=Object.entries(E.MODES||{}).map(([id,m])=>{const r=modeReport(id);return `<option value=\"${esc(id)}\" ${cfg.mode===id?'selected':''} ${r.selectable===false?'disabled':''}>${esc(m.name)} — ${esc(r.statusLabel)} · ${esc(r.coverageLabel)}</option>`}).join('');", "    const modeOptions=Object.entries(E.MODES||{}).map(([id,m])=>{const r=modeReport(id);return `<option value=\"${esc(id)}\" ${cfg.mode===id?'selected':''} ${r.selectable===false?'disabled':''}>${esc(m.name)} — ${esc(r.statusLabel)} · ${esc(songCountLabel(r.songs))} · ${esc(r.coverageLabel)}</option>`}).join('');")
replace_once('app.js',"          <div class=\"mode-detail\"><b>${esc(report.coverageLabel)} · ${report.yearBasis==='chart'?'chart year':'release year'}</b><span>${esc(info.desc)} ${esc(report.statusNote)}</span></div>", "          <div class=\"mode-detail\"><b>${esc(songCountLabel(report.songs))} · ${esc(report.coverageLabel)} · ${esc(yearBasisLabel(report))}</b><span>${esc(info.desc)} ${esc(report.statusNote)}</span></div>")

# Restore placement clarity directly in the renderer, not via MutationObserver.
replace_once('app.js',"<p>${virtual?'Choose a + on your timeline.':'Place the physical card on the table, then reveal.'}</p>", "<p>${virtual?'Tap a gap in your timeline. Your mystery song will appear there.':'Place the physical card on the table, then reveal.'}</p>")
replace_once('app.js',"<p>${virtual?'Choose a + on your timeline, then lock your placement.':'Place the physical card on the table, then reveal.'}</p>", "<p>${virtual?'Tap a gap in your timeline. Your mystery song will appear there.':'Place the physical card on the table, then reveal.'}</p>")
replace_once('app.js',"<button class=\"btn primary\" data-action=\"lock-placement\" ${pendingSlot===null||bonusBusy?'disabled':''}>Lock Placement</button>", "<button class=\"btn primary\" data-action=\"lock-placement\" ${pendingSlot===null||bonusBusy?'disabled':''}>${esc(placementLockCopy())}</button>")
old_board="""  function timelineBoard(interactive=false){
    const teams=(match?.teams||[]).map((team,index)=>({team,index}));
    return `<div class="timeline-board" aria-label="Team timelines" data-team-count="${teams.length}">${teams.map(({team,index})=>{
      const active=index===match.turn,years=[...(team.timeline||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
      const slot=i=>{const label=i===0?`Before ${years[0]??'timeline'}`:i===years.length?`After ${years.at(-1)??'timeline'}`:`Between ${years[i-1]} and ${years[i]}`;return `<button class="timeline-slot ${pendingSlot===i?'on':''}" data-slot="${i}" aria-label="${esc(label)}" aria-pressed="${pendingSlot===i}" ${bonusBusy?'disabled':''}>+</button>`};
      const choosing=interactive&&active&&cfg.playMode==='virtual';
      const cards=years.map((year,i)=>`<span class="timeline-step">${choosing?slot(i):''}<span class="timeline-year">${year}</span></span>`).join('')+(choosing?slot(years.length):'');
      return `<section class="team-timeline ${active?'active-team':''}" aria-label="${esc(team.name)} timeline"><div class="team-timeline-header"><h2>${esc(team.name)}${active?' <small>Your turn</small>':''}</h2><div class="team-timeline-totals"><b>${team.score}${cfg.victory==='10'?'/10':''} cards</b><span>${bonusBalance(team)} bonus</span></div></div><div class="timeline-years">${cards||'<span class="timeline-empty">No cards collected yet</span>'}</div></section>`;
    }).join('')}</div>`;
  }
"""
new_board="""  function timelineBoard(interactive=false){
    const teams=(match?.teams||[]).map((team,index)=>({team,index}));
    return `<div class="timeline-board" aria-label="Team timelines" data-team-count="${teams.length}">${teams.map(({team,index})=>{
      const active=index===match.turn,years=[...(team.timeline||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
      const choosing=interactive&&active&&cfg.playMode==='virtual',hasPlacement=choosing&&pendingSlot!==null;
      const slot=i=>{const label=placementLabel(years,i),selected=pendingSlot===i;return `<button class="timeline-slot placement-gap ${selected?'on selected':''}" data-slot="${i}" aria-label="${esc(label)}" aria-pressed="${selected}" ${bonusBusy?'disabled':''}>${selected?'<span class="timeline-mystery"><b>?</b><small>Your song</small></span>':'<span class="timeline-plus">+</span>'}</button>`};
      const cards=years.map((year,i)=>`${choosing?slot(i):''}<span class="timeline-year">${year}</span>`).join('')+(choosing?slot(years.length):'');
      return `<section class="team-timeline ${active?'active-team':''}" aria-label="${esc(team.name)} timeline"><div class="team-timeline-header"><h2>${esc(team.name)}${active?' <small>Your turn</small>':''}</h2><div class="team-timeline-totals"><b>${team.score}${cfg.victory==='10'?'/10':''} cards</b><span>${bonusBalance(team)} bonus</span></div></div><div class="timeline-years ${hasPlacement?'has-placement':''}">${cards||'<span class="timeline-empty">No cards collected yet</span>'}</div></section>`;
    }).join('')}</div>`;
  }
"""
replace_once('app.js',old_board,new_board)

# Make answer semantics explicit for screen-work and remix modes.
old_reveal="""  function revealScreen(){
    const virtual=cfg.playMode==='virtual',marked=!!placementResult;
    const result=marked?(placementResult.correct?'Correct placement':'Wrong position'):'Mark your placement';
    return `${topLine(true,false)}${matchHeader()}<div class="turn-toolbar"><h1>Reveal</h1></div><section class="card answer-card"><div class="answer-top"><div><div class="answer-song">${esc(current?.song?.title||'Unknown')}</div><div class="answer-artist">${esc(current?.song?.artist||'')}</div></div><div class="answer-year">${current?.year||'----'}</div></div><div class="result-badge ${marked?(placementResult.correct?'ok':'bad'):''}">${result}</div></section>${timelineBoard()}${bonusCardNotice()}${marked?`${bonusActions(true)}<div class="board-actionbar"><button class="btn primary" data-action="next-turn" ${bonusBusy?'disabled':''}>${winner()?'See results':'Next Team'}</button></div>`:`<div class="board-actionbar"><button class="btn ghost" data-action="wrong-answer">Wrong placement</button><button class="btn primary" data-action="correct-answer">Correct placement</button></div>`}${!virtual?'<button class="btn text" data-action="update-card-year">Update card year reference</button>':''}`;
  }
"""
new_reveal="""  function revealScreen(){
    const virtual=cfg.playMode==='virtual',marked=!!placementResult,song=current?.song||{};
    const result=marked?(placementResult.correct?'Correct placement':'Wrong position'):'Mark your placement';
    const answerContext=song.screenWorkTitle?`${song.screenWorkType==='movie'?'Movie':'TV show'}: ${song.screenWorkTitle}`:song.playbackVariant==='remix'?`Played: ${song.remixTitle||song.title}${song.remixer?` · ${song.remixer} remix`:''}`:'';
    return `${topLine(true,false)}${matchHeader()}<div class="turn-toolbar"><h1>Reveal</h1></div><section class="card answer-card"><div class="answer-top"><div><div class="answer-song">${esc(song.title||'Unknown')}</div><div class="answer-artist">${esc(song.artist||'')}</div>${answerContext?`<div class="answer-context">${esc(answerContext)}</div>`:''}</div><div class="answer-year">${current?.year||'----'}</div></div><div class="result-badge ${marked?(placementResult.correct?'ok':'bad'):''}">${result}</div></section>${timelineBoard()}${bonusCardNotice()}${marked?`${bonusActions(true)}<div class="board-actionbar"><button class="btn primary" data-action="next-turn" ${bonusBusy?'disabled':''}>${winner()?'See results':'Next Team'}</button></div>`:`<div class="board-actionbar"><button class="btn ghost" data-action="wrong-answer">Wrong placement</button><button class="btn primary" data-action="correct-answer">Correct placement</button></div>`}${!virtual?'<button class="btn text" data-action="update-card-year">Update card year reference</button>':''}`;
  }
"""
replace_once('app.js',old_reveal,new_reveal)

append_once('app.css','/* native virtual placement gaps */',r'''/* native virtual placement gaps */
.timeline-slot.placement-gap{width:100%;height:24px;min-height:24px;flex:none;align-self:stretch;border:0;border-radius:10px;background:transparent;position:relative;display:flex;align-items:center;justify-content:center;padding:0;transition:opacity .14s ease,height .14s ease,background .14s ease,border-color .14s ease}
.timeline-slot.placement-gap:before{content:"";position:absolute;left:10%;right:10%;top:50%;height:1px;background:#55e4c147}
.timeline-plus{position:relative;z-index:1;width:28px;height:22px;border:1px solid #55e4c160;border-radius:9px;background:#0b211e;color:var(--mint);display:grid;place-items:center;font-size:18px;font-weight:850;line-height:1}
.timeline-slot.placement-gap.selected{height:58px;min-height:58px;border:1px solid #8effe0;background:linear-gradient(135deg,#123a31,#0b211e);box-shadow:0 0 18px #4fe7c135}
.timeline-slot.placement-gap.selected:before{display:none}
.timeline-mystery{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;color:var(--text);text-transform:uppercase;letter-spacing:.08em}
.timeline-mystery b{font:600 27px var(--serif);line-height:.9;color:var(--mint)}
.timeline-mystery small{font-size:8px;font-weight:850;color:#c9d8d5}
.timeline-years.has-placement .placement-gap:not(.selected){opacity:.28}
.timeline-years.has-placement .placement-gap:not(.selected):hover,.timeline-years.has-placement .placement-gap:not(.selected):focus-visible{opacity:.8}
.answer-context{margin-top:7px;font-size:12px;line-height:1.35;color:#aebdbc}
@media(min-width:600px){.timeline-slot.placement-gap{height:28px;min-height:28px}.timeline-slot.placement-gap.selected{height:66px;min-height:66px}.timeline-mystery b{font-size:31px}}
''')

# Production loading order and cache busting.
replace_once('index.html','<link rel="stylesheet" href="./app.css?v=7.6.1">','<link rel="stylesheet" href="./app.css?v=7.6.2">')
replace_once('index.html','  <script src="./engine-v7.js?v=7.6.1"></script>\n  <script src="./app.js?v=7.6.1"></script>\n  <script src="./mode-labels.js?v=1.0.0"></script>','  <script src="./engine-v7.js?v=7.6.1"></script>\n  <script src="./mode-expansion.js?v=1.0.0"></script>\n  <script src="./app.js?v=7.6.2"></script>')

# Explicit remix assets bypass generic provider matching; normal songs retain the original resolver.
replace_once('mode-expansion.js','  const baseLoadCatalogue=E.loadCatalogue.bind(E);\n  let overlayPromise=null,expandedPromise=null,diagnostics=null;','  const baseLoadCatalogue=E.loadCatalogue.bind(E);\n  const baseResolveSong=E.resolveSong.bind(E);\n  let overlayPromise=null,expandedPromise=null,diagnostics=null;')
replace_once('mode-expansion.js',"    return window.GSYEngineBaseResolveSong?window.GSYEngineBaseResolveSong(song,kind):Promise.reject(new E.AppError('RESOLVER_UNAVAILABLE','The music resolver is unavailable.'));","    return baseResolveSong(song,kind);")

# Pages artifact must exactly include all locally referenced runtime assets and overlay data.
replace_once('.github/workflows/pages.yml','          cp index.html app.css app.js app-policy.js engine.js engine-v7.js setup-playback.css setup-playback.js robots.txt THIRD_PARTY_NOTICES.md _site/','          cp index.html app.css app.js app-policy.js engine.js engine-v7.js mode-expansion.js setup-playback.css setup-playback.js robots.txt THIRD_PARTY_NOTICES.md _site/')
replace_once('.github/workflows/pages.yml','          cp data/catalogue.json data/modes.json _site/data/','          cp data/catalogue.json data/modes.json data/mode-expansion.json _site/data/')

# Validation suite: remove unsafe enhancer tests, add native/runtime/deployment contracts.
replace_once('scripts/check.mjs',"  ...['engine.js','engine-v7.js','app-policy.js','app.js','mode-labels.js','setup-playback.js'].map(file=>[process.execPath,'--check',file]),","  ...['engine.js','engine-v7.js','mode-expansion.js','app-policy.js','app.js','setup-playback.js'].map(file=>[process.execPath,'--check',file]),")
replace_once('scripts/check.mjs',"    'test_bonus_gameplay','test_physical_ready','test_engine_playback_fixes','test_app_policy','test_card_year_overrides','test_security_contract','test_setup_playback_ui','test_mobile_setup_scroll','test_mode_labels'].map(name=>[process.execPath,`scripts/${name}.mjs`]),","    'test_bonus_gameplay','test_physical_ready','test_engine_playback_fixes','test_app_policy','test_card_year_overrides','test_security_contract','test_setup_playback_ui','test_mobile_setup_scroll','test_mode_expansion','test_native_ui','test_deploy_assets'].map(name=>[process.execPath,`scripts/${name}.mjs`]),")

# Cache versions are intentionally mutable; tests should enforce order, not one exact version string.
replace_once('scripts/test_setup_playback_ui.mjs',"assert.match(index,/app\\.js\\?v=7\\.6\\.1[\\s\\S]*setup-playback\\.js\\?v=7\\.6\\.2/,'setup playback enhancement must load after app.js');","assert.match(index,/app\\.js\\?v=\\d+\\.\\d+\\.\\d+[\\s\\S]*setup-playback\\.js\\?v=\\d+\\.\\d+\\.\\d+/,'setup playback enhancement must load after app.js');")

# Explicit resolver assertions reflect direct provider payloads.
replace_once('scripts/test_mode_expansion.mjs',"assert.equal((await engine.resolveSong(remix,'spotify')).id,remix.spotifyId);\nassert.equal((await engine.resolveSong(remix,'youtube')).id,remix.youtubeId);","assert.equal((await engine.resolveSong(remix,'spotify')).id,remix.spotifyId);\nassert.equal((await engine.resolveSong(remix,'youtube')).videoId,remix.youtubeId);")

for obsolete in ('mode-labels.js','scripts/test_mode_labels.mjs'):
    p=ROOT/obsolete
    if p.exists():p.unlink()

print('Applied remaining issue fixes.')
