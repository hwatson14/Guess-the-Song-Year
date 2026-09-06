from pathlib import Path
import re

root=Path(__file__).resolve().parents[1]
app_path=root/'app.js'
css_path=root/'app.css'
index_path=root/'index.html'
check_path=root/'scripts'/'check.mjs'
test_path=root/'scripts'/'test_duplicate_year_timeline.mjs'

app=app_path.read_text()
old_helpers="""  function placementLabel(years,index){return index===0?`Before ${years[0]??'timeline'}`:index===years.length?`After ${years.at(-1)??'timeline'}`:`Between ${years[index-1]} and ${years[index]}`}\n  function placementLockCopy(){if(pendingSlot===null)return 'Lock Placement';const years=[...(activeTeam().timeline||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b),label=placementLabel(years,pendingSlot);return `Lock ${label.charAt(0).toLowerCase()}${label.slice(1)}`}\n"""
new_helpers="""  function placementLabel(years,index){return index===0?`Before ${years[0]??'timeline'}`:index===years.length?`After ${years.at(-1)??'timeline'}`:`Between ${years[index-1]} and ${years[index]}`}\n  function timelineYearGroups(years){\n    const groups=[];\n    for(let i=0;i<years.length;i++){\n      const year=years[i],last=groups.at(-1);\n      if(last?.year===year)last.count++;\n      else groups.push({year,count:1,start:i});\n    }\n    return {groups,maxCount:Math.max(1,...groups.map(group=>group.count))};\n  }\n  function placementBoundarySlot(years,index){\n    let slot=Math.max(0,Math.min(years.length,Number(index)||0));\n    while(slot>0&&slot<years.length&&years[slot-1]===years[slot])slot++;\n    return slot;\n  }\n  function placementLockCopy(){if(pendingSlot===null)return 'Lock Placement';const years=[...(activeTeam().timeline||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b),slot=placementBoundarySlot(years,pendingSlot),label=placementLabel(years,slot);return `Lock ${label.charAt(0).toLowerCase()}${label.slice(1)}`}\n"""
if old_helpers not in app: raise SystemExit('placement helper anchor not found')
app=app.replace(old_helpers,new_helpers,1)

pattern=r"  function timelineBoard\(interactive=false\)\{.*?\n  \}\n  function bonusActions\(award=false\)\{"
replacement="""  function timelineBoard(interactive=false){\n    const teams=(match?.teams||[]).map((team,index)=>({team,index}));\n    return `<div class=\"timeline-board\" aria-label=\"Team timelines\" data-team-count=\"${teams.length}\">${teams.map(({team,index})=>{\n      const active=index===match.turn,years=[...(team.timeline||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b);\n      const choosing=interactive&&active&&cfg.playMode==='virtual',displaySlot=choosing&&pendingSlot!==null?placementBoundarySlot(years,pendingSlot):null,hasPlacement=displaySlot!==null;\n      const {groups,maxCount}=timelineYearGroups(years);\n      const slot=i=>{const boundary=placementBoundarySlot(years,i),label=placementLabel(years,boundary),selected=displaySlot===boundary;return `<button class=\"timeline-slot placement-gap ${selected?'on selected':''}\" data-slot=\"${boundary}\" aria-label=\"${esc(label)}\" aria-pressed=\"${selected}\" ${bonusBusy?'disabled':''}>${selected?'<span class=\"timeline-mystery\"><b>?</b><small>Your song</small></span>':'<span class=\"timeline-plus\">+</span>'}</button>`};\n      const rows=groups.map(group=>{\n        const cards=Array.from({length:group.count},(_,cardIndex)=>`<span class=\"timeline-card\" aria-hidden=\"true\" data-card-index=\"${cardIndex+1}\"></span>`).join('');\n        return `${choosing?slot(group.start):''}<div class=\"timeline-year-row\" data-year=\"${group.year}\"><span class=\"timeline-year-label\">${group.year}</span><span class=\"timeline-card-stack\" style=\"--timeline-cols:${maxCount}\">${cards}</span></div>`;\n      }).join('')+(choosing?slot(years.length):'');\n      return `<section class=\"team-timeline ${active?'active-team':''}\" aria-label=\"${esc(team.name)} timeline\"><div class=\"team-timeline-header\"><h2>${esc(team.name)}${active?' <small>Your turn</small>':''}</h2><div class=\"team-timeline-totals\"><b>${team.score}${cfg.victory==='10'?'/10':''} cards</b><span>${bonusBalance(team)} bonus</span></div></div><div class=\"timeline-years ${hasPlacement?'has-placement':''}\">${rows||'<span class=\"timeline-empty\">No cards collected yet</span>'}</div></section>`;\n    }).join('')}</div>`;\n  }\n  function bonusActions(award=false){"""
app2,n=re.subn(pattern,replacement,app,count=1,flags=re.S)
if n!=1: raise SystemExit(f'timelineBoard replacement count {n}')
app=app2
old_lock="const team=activeTeam(),years=[...(team.timeline||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b),slot=pendingSlot;"
new_lock="const team=activeTeam(),years=[...(team.timeline||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b),slot=placementBoundarySlot(years,pendingSlot);"
if old_lock not in app: raise SystemExit('lockPlacement anchor not found')
app=app.replace(old_lock,new_lock,1)
app_path.write_text(app)

css=css_path.read_text()
marker='/* duplicate-year stacked timeline rows */'
if marker not in css:
    css += """\n\n/* duplicate-year stacked timeline rows */\n.timeline-year-row{display:grid;grid-template-columns:48px minmax(0,1fr);align-items:center;gap:6px;width:100%;min-width:0}\n.timeline-year-label{display:flex;align-items:center;justify-content:flex-end;height:30px;padding-right:2px;color:var(--mint);font:750 14px var(--sans);font-variant-numeric:tabular-nums;letter-spacing:-.02em}\n.timeline-card-stack{display:grid;grid-template-columns:repeat(var(--timeline-cols,1),minmax(0,1fr));gap:4px;width:100%;min-width:0}\n.timeline-card{display:block;height:30px;min-width:0;border:1px solid #ffffff24;border-radius:7px;background:linear-gradient(145deg,#183138,#102429);box-shadow:inset 0 1px #ffffff0b}\n.timeline-card:after{content:\"\";display:block;width:22%;min-width:8px;max-width:18px;height:2px;margin:13px auto 0;border-radius:99px;background:#55e4c173}\nmain.app.screen-youtube .timeline-year-row{grid-template-columns:42px minmax(0,1fr);gap:4px}\nmain.app.screen-youtube .timeline-year-label,main.app.screen-youtube .timeline-card{height:18px}\nmain.app.screen-youtube .timeline-year-label{font-size:11px}\nmain.app.screen-youtube .timeline-card:after{height:1px;margin-top:8px}\nmain.app.screen-reveal .timeline-year-label,main.app.screen-reveal .timeline-card{height:22px}\nmain.app.screen-reveal .timeline-year-label{font-size:12px}\nmain.app.screen-reveal .timeline-card:after{height:1px;margin-top:10px}\n@media(min-width:600px){\n  .timeline-year-row{grid-template-columns:58px minmax(0,1fr);gap:8px}\n  .timeline-year-label,.timeline-card{height:38px}\n  .timeline-year-label{font-size:16px}\n  .timeline-card:after{margin-top:17px}\n}\n"""
css_path.write_text(css)

index=index_path.read_text()
index=re.sub(r'app\.css\?v=7\.6\.\d+', 'app.css?v=7.6.5', index)
index=re.sub(r'app\.js\?v=7\.6\.\d+', 'app.js?v=7.6.6', index)
index_path.write_text(index)

test_path.write_text("""import assert from 'node:assert/strict';\nimport fs from 'node:fs';\nimport vm from 'node:vm';\n\nconst app=fs.readFileSync('app.js','utf8');\nconst css=fs.readFileSync('app.css','utf8');\nconst policy=fs.readFileSync('app-policy.js','utf8');\n\nassert.match(app,/function timelineYearGroups\(years\)/);\nassert.match(app,/timeline-year-row/);\nassert.match(app,/timeline-year-label/);\nassert.match(app,/timeline-card-stack/);\nassert.match(app,/--timeline-cols:\$\{maxCount\}/);\nassert.match(app,/slot\(group\.start\)/);\nassert.doesNotMatch(app,/years\.map\(\(year,i\)=>`\$\{choosing\?slot\(i\):''\}<span class=\\\"timeline-year\\\">/);\nassert.match(css,/grid-template-columns:48px minmax\(0,1fr\)/);\nassert.match(css,/grid-template-columns:repeat\(var\(--timeline-cols,1\),minmax\(0,1fr\)\)/);\n\nconst sandbox={window:{},URL};\nvm.createContext(sandbox);\nvm.runInContext(policy,sandbox);\nconst {placementIsCorrect}=sandbox.window.GSYAppPolicy;\nassert.equal(placementIsCorrect([1998,1998,2001],0,1998),true);\nassert.equal(placementIsCorrect([1998,1998,2001],2,1998),true);\nassert.equal(placementIsCorrect([1998,1998,2001],2,1999),true);\nassert.equal(placementIsCorrect([1998,1998,2001],3,1999),false);\n\nconsole.log('Duplicate-year timeline grouping and equal-year placement contract passed.');\n""")

check=check_path.read_text()
needle="'test_mobile_setup_scroll','test_native_placement_ui','test_release_integrity'"
replacement="'test_mobile_setup_scroll','test_native_placement_ui','test_duplicate_year_timeline','test_release_integrity'"
if needle not in check: raise SystemExit('check.mjs anchor not found')
check=check.replace(needle,replacement,1)
check_path.write_text(check)

print('Applied duplicate-year timeline grouping patch.')
