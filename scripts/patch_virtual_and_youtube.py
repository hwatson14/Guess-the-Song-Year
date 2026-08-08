from pathlib import Path
import re

p = Path('app.js')
s = p.read_text()


def rep(old, new, label):
    global s
    if old not in s:
        raise SystemExit(f'missing {label}')
    s = s.replace(old, new, 1)

# Persist a virtual placement choice across render/resume.
rep(
    "let screen=match?.active?(match.phase==='gameover'?'gameover':'resume'):'setup',current=match?.current||null,pendingSlot=null,placementResult=match?.placementResult||null;",
    "let screen=match?.active?(match.phase==='gameover'?'gameover':'resume'):'setup',current=match?.current||null,pendingSlot=Number.isInteger(match?.pendingSlot)?match.pendingSlot:null,placementResult=match?.placementResult||null;",
    'initial pending slot',
)

old_migrate = """  function migrateMatch(){
    if(!match?.active)return;
    match.mode=MODE;
    match.phase=match.phase||'between';
    match.current=match.current||null;
    match.placementResult=match.placementResult||null;
    match.used=Array.isArray(match.used)?match.used:[];
    match.assign=match.assign&&typeof match.assign==='object'?match.assign:{};
    if(cfg.playMode==='virtual'){
      match.virtualDeck=Array.isArray(match.virtualDeck)&&match.virtualDeck.length?match.virtualDeck:shuffle(Array.from({length:308},(_,i)=>i+1));
      match.virtualPos=Math.max(0,Number(match.virtualPos)||0);
    }
    saveMatch();
  }"""
new_migrate = """  function takeVirtualCardId(){
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
  }"""
rep(old_migrate, new_migrate, 'virtual starter helpers')

rep(
    "<button class=\"choice ${cfg.playMode==='virtual'?'on':''}\" data-play=\"virtual\">Virtual<small>App deals the cards</small></button>",
    "<button class=\"choice ${cfg.playMode==='virtual'?'on':''}\" data-play=\"virtual\">Virtual<small>Starter year + app dealt cards</small></button>",
    'virtual setup copy',
)

old_timeline = """  function virtualTimeline(){
    const years=[...(activeTeam().timeline||[])].sort((a,b)=>a-b);let html='';
    for(let i=0;i<=years.length;i++){
      html+=`<button class="slot ${pendingSlot===i?'on':''}" data-slot="${i}" aria-label="Place here"></button>`;
      if(i<years.length)html+=`<div class="year-card">${years[i]}</div>`;
    }
    if(!years.length)html='<button class="slot on" data-slot="0" style="flex-basis:80px"></button>';
    return `<div class="card"><div class="timeline">${html}</div><div class="timeline-note">Before, after, or between your existing cards.</div></div><div class="virtual-actions"><button class="btn primary" data-action="lock-placement" ${pendingSlot===null?'disabled':''}>Lock Placement</button></div>`;
  }"""
new_timeline = """  function virtualTimeline(){
    const team=activeTeam(),years=[...(team.timeline||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b);let html='';
    for(let i=0;i<=years.length;i++){
      const label=i===0?`Before ${years[0]??'timeline'}`:i===years.length?`After ${years[years.length-1]??'timeline'}`:`Between ${years[i-1]} and ${years[i]}`;
      html+=`<button class="slot ${pendingSlot===i?'on':''}" data-slot="${i}" aria-label="${label}" aria-pressed="${pendingSlot===i?'true':'false'}"></button>`;
      if(i<years.length)html+=`<div class="year-card">${years[i]}</div>`;
    }
    const starter=Number(team.starterYear);
    return `<div class="card"><div class="timeline">${html}</div><div class="timeline-note">Starter year: <b>${Number.isFinite(starter)?starter:years[0]}</b> · Tap a + before, between or after the years.</div></div><div class="virtual-actions"><button class="btn ghost" data-action="listen-again">↻ Listen Again</button><button class="btn primary" data-action="lock-placement" ${pendingSlot===null?'disabled':''}>Lock Placement</button></div>`;
  }"""
rep(old_timeline, new_timeline, 'virtual timeline')

rep(
    "match={active:true,id:`g${Date.now()}`,mode:MODE,phase:'between',round:0,turn:0,teams:Array.from({length:cfg.teams},(_,i)=>({name:`Team ${i+1}`,score:0,timeline:[]})),used:[],assign:{},virtualDeck:shuffle(Array.from({length:308},(_,i)=>i+1)),virtualPos:0,current:null,placementResult:null};\n    current=null;placementResult=null;pendingSlot=null;",
    "match={active:true,id:`g${Date.now()}`,mode:MODE,phase:'between',round:0,turn:0,teams:Array.from({length:cfg.teams},(_,i)=>({name:`Team ${i+1}`,score:0,timeline:[],starterYear:null,starterCardId:null})),used:[],assign:{},virtualDeck:shuffle(Array.from({length:308},(_,i)=>i+1)),virtualPos:0,current:null,placementResult:null,pendingSlot:null};\n    if(cfg.playMode==='virtual')ensureVirtualStarters();\n    current=null;placementResult=null;pendingSlot=null;",
    'start match starters',
)

rep(
    "current=match.current||null;placementResult=match.placementResult||null;pendingSlot=null;",
    "current=match.current||null;placementResult=match.placementResult||null;pendingSlot=Number.isInteger(match.pendingSlot)?match.pendingSlot:null;",
    'resume pending slot',
)

rep(
    "if(match){match.current=null;match.placementResult=null;match.phase='between'}",
    "if(match){match.current=null;match.placementResult=null;match.pendingSlot=null;match.phase='between'}",
    'clear pending slot',
)

old_next = """  function nextVirtualCard(){
    if(match.virtualPos>=match.virtualDeck.length){match.virtualDeck=shuffle(Array.from({length:308},(_,i)=>i+1));match.virtualPos=0}
    const id=match.virtualDeck[match.virtualPos++];saveMatch();return id;
  }"""
rep(old_next, "  function nextVirtualCard(){const id=takeVirtualCardId();saveMatch();return id}", 'next virtual card')

old_select = "  function selectSlot(slot){pendingSlot=slot;root.querySelectorAll('[data-slot]').forEach(x=>x.classList.toggle('on',Number(x.dataset.slot)===slot));const lock=root.querySelector('[data-action=\"lock-placement\"]');if(lock)lock.disabled=false}"
new_select = """  function selectSlot(slot){
    if(cfg.playMode!=='virtual'||!current||!['playing','guess'].includes(screen))return;
    const years=[...(activeTeam().timeline||[])];
    if(!Number.isInteger(slot)||slot<0||slot>years.length){toast('That placement is not available.');return}
    pendingSlot=slot;match.pendingSlot=slot;saveMatch();
    root.querySelectorAll('[data-slot]').forEach(x=>{const on=Number(x.dataset.slot)===slot;x.classList.toggle('on',on);x.setAttribute('aria-pressed',on?'true':'false')});
    const lock=root.querySelector('[data-action=\"lock-placement\"]');if(lock)lock.disabled=false;
  }"""
rep(old_select, new_select, 'select slot')

old_lock = "  function lockPlacement(){if(pendingSlot===null||!current)return;const years=[...(activeTeam().timeline||[])].sort((a,b)=>a-b),left=pendingSlot>0?years[pendingSlot-1]:null,right=pendingSlot<years.length?years[pendingSlot]:null;const correct=(left===null||left<=current.year)&&(right===null||current.year<=right);placementResult={correct,left,right,slot:pendingSlot};recordSongUsed();stopPlayback();if(correct){years.splice(pendingSlot,0,current.year);activeTeam().timeline=years;activeTeam().score++}match.placementResult=placementResult;match.phase='reveal';syncCurrent();screen='reveal';render()}"
new_lock = """  function lockPlacement(){
    if(pendingSlot===null||!current||cfg.playMode!=='virtual'||!['playing','guess'].includes(screen))return;
    const team=activeTeam(),years=[...(team.timeline||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b),slot=pendingSlot;
    if(!Number.isInteger(slot)||slot<0||slot>years.length){toast('Choose a valid placement first.');pendingSlot=null;match.pendingSlot=null;saveMatch();render();return}
    const left=slot>0?years[slot-1]:null,right=slot<years.length?years[slot]:null;
    const correct=(left===null||left<=current.year)&&(right===null||current.year<=right);
    placementResult={correct,left,right,slot};recordSongUsed();stopPlayback();
    if(correct){years.splice(slot,0,current.year);team.timeline=years;team.score++}
    pendingSlot=null;match.pendingSlot=null;match.placementResult=placementResult;match.phase='reveal';syncCurrent();screen='reveal';render();resetScroll();
  }"""
rep(old_lock, new_lock, 'lock placement')

# Remove the forced 30 second YouTube cutoff. The player ends only when lifted or naturally ends.
rep(
    "<p>When you lift the phone, playback stops before the guessing screen appears. It also stops automatically after 30 seconds.</p>",
    "<p>Listen for as long as you want. Lift the phone whenever you are ready to guess.</p>",
    'youtube listening copy',
)

rep(
    "  function armYoutubeStopTimer(){\n    cancelYoutubeListening();\n    youtubeListenTimer=setTimeout(()=>finishYouTubeListening(),30000);\n  }",
    "  function armYoutubeStopTimer(){\n    cancelYoutubeListening();\n  }",
    'youtube timer removal',
)

p.write_text(s)

p = Path('app.css')
c = p.read_text()
c += "\n/* v7.2.2 virtual placement */\n.slot{flex-basis:46px;min-width:46px;touch-action:manipulation}.slot:after{font-size:25px;font-weight:800}.slot.on:after{content:'✓';font-size:22px}.timeline-note b{color:var(--mint)}.virtual-actions{display:grid;grid-template-columns:1fr 1.4fr;gap:9px}.virtual-actions .btn{width:100%}@media(max-width:520px){.slot{flex-basis:50px;min-width:50px}.virtual-actions{grid-template-columns:1fr}}\n"
p.write_text(c)

p = Path('index.html')
h = p.read_text()
h = re.sub(r'app\.css\?v=[^\"\']+', 'app.css?v=7.2.2', h)
h = re.sub(r'engine\.js\?v=[^\"\']+', 'engine.js?v=7.2.2', h)
h = re.sub(r'engine-v7\.js\?v=[^\"\']+', 'engine-v7.js?v=7.2.2', h)
h = re.sub(r'app\.js\?v=[^\"\']+', 'app.js?v=7.2.2', h)
p.write_text(h)
