from pathlib import Path
import re

p = Path('index.html')
s = p.read_text()
key = 'AIzaSyDJvhC5aEQES30hAcwNhc3-eeAR_WWE0K8'

if "const BUILTIN_YT_KEY=" not in s:
    anchor = "const BILLBOARD_URL='https://raw.githubusercontent.com/madelinehamilton/BiMMuDa/main/metadata/bimmuda_per_song_metadata.csv';"
    assert anchor in s
    s = s.replace(anchor, anchor + "\nconst BUILTIN_YT_KEY='" + key + "';", 1)

s = s.replace("let ytKey=localStorage.getItem(K.yt)||'', client=", "let ytKey=localStorage.getItem(K.yt)||BUILTIN_YT_KEY, client=", 1)
s = s.replace("E.ytKey.value=ytKey;", "E.ytKey.value=localStorage.getItem(K.yt)||'';", 1)
s = s.replace('placeholder="Paste API key"', 'placeholder="Optional override; shared key already installed"', 1)
s = s.replace(
    'For a zero-setup guest experience, use one website-restricted API key for this app. Once you give me that key, it can be baked into the deployment so guests do not enter it themselves.',
    'A shared browser-restricted YouTube key is installed. This field is only for a temporary per-device override.',
    1,
)

old = "function saveYtKey(){ytKey=E.ytKey.value.trim();if(ytKey)localStorage.setItem(K.yt,ytKey);else localStorage.removeItem(K.yt);render();msg(ytKey?'YouTube key saved on this device.':'YouTube key removed.',true)}"
new = "function saveYtKey(){let v=E.ytKey.value.trim();if(v){localStorage.setItem(K.yt,v);ytKey=v;msg('YouTube override key saved on this device.',true)}else{localStorage.removeItem(K.yt);ytKey=BUILTIN_YT_KEY;msg('Using the shared YouTube key.',true)}render()}"
assert old in s
s = s.replace(old, new, 1)

m = re.search(r"async function diagnostics\(\)\{.*?\}\n(?=function msg)", s, re.S)
assert m
new_diag = """async function diagnostics(){let out=[];out.push((window.isSecureContext?'✓':'✗')+' HTTPS / secure context');out.push((YEARS.length===309&&YEARS[67]===1998?'✓':'✗')+' 308-card map; 00067 → 1998');try{let c=await ensureCatalog();out.push((c.length>300?'✓':'✗')+' Greatest Hits catalogue: '+c.length+' rows')}catch(e){out.push('✗ catalogue: '+e.message)}if(ytKey){try{let r=await fetch('https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&key='+encodeURIComponent(ytKey));let d=await r.json().catch(()=>({}));if(r.ok&&(d.items||[]).length)out.push('✓ YouTube API key works from this website');else out.push('✗ YouTube API key: '+(d.error?.message||('HTTP '+r.status)))}catch(e){out.push('✗ YouTube API key: '+e.message)}}else out.push('✗ YouTube API key missing');out.push((auth()?'✓':'○')+' Spotify '+(auth()?'connected':'not connected'));if(auth()){try{let d=await api('/me/player/devices');out.push(((d.devices||[]).length?'✓':'○')+' '+(d.devices||[]).length+' Spotify device(s)')}catch(e){out.push('✗ '+e.message)}}E.diagOut.innerHTML=out.map(x=>'<div>'+esc(x)+'</div>').join('');E.diagOut.classList.remove('hidden');E.diagOut.classList.toggle('ok',!out.some(x=>x.startsWith('✗')))}
"""
s = s[:m.start()] + new_diag + s[m.end():]

p.write_text(s)
