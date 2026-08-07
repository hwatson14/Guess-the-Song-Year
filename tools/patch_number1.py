from pathlib import Path
import re

p = Path('index.html')
s = p.read_text()

if "number1:{name:'#1 of the Year'" not in s:
    anchor = " greatest:{name:'Greatest Hits',icon:'★',desc:'Big, recognisable songs from the exact year.'},"
    assert anchor in s, 'mode anchor missing'
    s = s.replace(anchor, anchor + "\n number1:{name:'#1 of the Year',icon:'1',desc:'Billboard year-end #1 for the card year. Same year intentionally repeats.'},", 1)

choose = """async function chooseAndResolve(year,modeId,prov){let used=new Set(game.used||[]),candidates=[];if(modeId==='number1'){let c=await numberOneCandidate(year);if(c)candidates=[c]}else if(modeId==='australian'){let c=await australianCandidate(year,used);if(c)candidates=[c]}else if(modeId==='unexpected'){candidates=shuffle(TIMEWARP.filter(x=>x.year===year&&!used.has(songKey(x))));candidates.push(...await catalogCandidates(year,'unexpected',used))}else candidates=await catalogCandidates(year,modeId,used);if(!candidates.length&&modeId!=='greatest'&&modeId!=='number1')candidates=await catalogCandidates(year,'greatest',used);let errors=[];for(const c of candidates.slice(0,18)){try{let ok=modeId==='number1'||prov==='spotify'?true:await validateReleaseYear(c,year);if(!ok)continue;let resolved=await resolveProvider(c,year,prov);return {candidate:{...c,year},resolved}}catch(e){errors.push(e.message)}}throw new Error('Could not find a playable '+year+' song for '+MODES[modeId].name+'. '+(errors.at(-1)||'Try another mode.'))}
"""
s, n = re.subn(r"async function chooseAndResolve\(year,modeId,prov\)\{.*?\}\n(?=async function catalogCandidates)", choose, s, count=1, flags=re.S)
assert n == 1, 'chooseAndResolve patch failed'

if 'async function numberOneCandidate(year)' not in s:
    anchor = 'async function catalogCandidates(year,modeId,used){'
    assert anchor in s, 'catalog anchor missing'
    fn = "async function numberOneCandidate(year){let rows=await ensureCatalog();let r=rows.find(x=>x.chartYear===year&&x.rank===1);if(!r)return null;return {title:r.title,artist:r.artist,year,source:'billboard-number1',chartYear:r.chartYear,rank:1,genres:r.genres,spotifyId:r.spotifyId,youtubeId:r.youtubeId,allowChartYear:true}}\n"
    s = s.replace(anchor, fn + anchor, 1)

s, n = re.subn(
    r"async function resolveProvider\(c,year\)\{.*?\}\n(?=async function spotifyResolve)",
    "async function resolveProvider(c,year,prov=provider){return prov==='youtube'?youtubeResolve(c,year):spotifyResolve(c,year,!!c.allowChartYear)}\n",
    s, count=1, flags=re.S)
assert n == 1, 'resolveProvider patch failed'

spotify = """async function spotifyResolve(c,year,allowChartYear=false){if(!auth())throw new Error('Connect a Spotify Premium account in Settings, or switch to YouTube.');if(c.spotifyId){try{let t=await api('/tracks/'+encodeURIComponent(c.spotifyId));if(allowChartYear||trackYear(t)===year)return spotifyTrack(t)}catch{}}let q=encodeURIComponent(c.title+' '+mainArtist(c.artist));let d=await api('/search?q='+q+'&type=track&limit=10');let pool=(d.tracks?.items||[]).filter(t=>allowChartYear||trackYear(t)===year);if(!pool.length)throw new Error(allowChartYear?'Spotify could not find '+c.title+'.':'Spotify could not find an exact-year version of '+c.title+'.');pool.sort((a,b)=>trackScore(b,c)-trackScore(a,c));return spotifyTrack(pool[0])}
"""
s, n = re.subn(r"async function spotifyResolve\(c,year\)\{.*?\}\n(?=function spotifyTrack)", spotify, s, count=1, flags=re.S)
assert n == 1, 'spotifyResolve patch failed'

old = "The card-year profile is the assumed 308-card map. Greatest Hits uses a public Billboard year-end research catalogue and verifies the actual first release year before playback where possible."
if old in s:
    new = old + " #1 of the Year uses Billboard year-end chart position 1 for the card year; this is the chart year and can differ from the track's first-release year."
    s = s.replace(old, new, 1)

p.write_text(s)
