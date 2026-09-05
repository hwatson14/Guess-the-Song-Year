"""Read public Spotify embed metadata. Never store page/session credentials."""
import json,re,unicodedata,time
from datetime import datetime,timezone
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import requests
from bs4 import BeautifulSoup
ROOT=Path(__file__).resolve().parents[1]
def norm(s):return re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()).strip()
def inspect(item):
    song,asset=item
    result={'songId':song['id'],'provider':'spotify','id':asset['id'],'checkedAt':datetime.now(timezone.utc).isoformat(),'state':'unverified'}
    try:
        time.sleep(.6)
        response=requests.get('https://open.spotify.com/embed/track/'+asset['id'],timeout=15)
        result['httpStatus']=response.status_code
        if response.status_code==404:return {**result,'state':'unavailable'}
        response.raise_for_status()
        script=BeautifulSoup(response.text,'html.parser').find('script',id='__NEXT_DATA__')
        if not script:return result
        # Extract only public track identity. Do not retain other embedded state.
        entity=json.loads(script.get_text())['props']['pageProps']['state']['data']['entity']
        title=entity.get('title') or entity.get('name','');artists=[a['name'] for a in entity.get('artists',[])]
        result.update(title=title,artists=artists,playable=entity.get('isPlayable'),titleMatches=norm(title)==norm(song['title']),artistMatches=any(norm(a).removeprefix('the ')==norm(song['artist']).removeprefix('the ') for a in artists))
        result['state']='metadata_checked'
        # A matching title/artist is not proof of the exact original master.
        return result
    except (requests.RequestException,ValueError,KeyError,TypeError) as error:return {**result,'error':type(error).__name__}
if __name__=='__main__':
    db=json.loads((ROOT/'data/song-database.json').read_text(encoding='utf-8'))
    items=[(song,asset) for song in db['songs'].values() for asset in song['providers']['spotify']['links']]
    output=ROOT/'output/expansion/spotify-link-audit.json'
    results=json.loads(output.read_text(encoding='utf-8')) if output.exists() else []
    done={(r['songId'],r['id']) for r in results if r['state']=='metadata_checked'}
    results=[r for r in results if (r['songId'],r['id']) in done]
    items=[(s,a) for s,a in items if (s['id'],a['id']) not in done]
    with ThreadPoolExecutor(max_workers=2) as pool:
        for result in pool.map(inspect,items):
            results.append(result)
            output.write_text(json.dumps(results,indent=2),encoding='utf-8')
            if len(results)%25==0:print(json.dumps({'checked':len(results),'total':len(items)}),flush=True)
    print(json.dumps({'checked':len(results),'metadataAvailable':sum(r['state']=='metadata_checked' for r in results)}))
