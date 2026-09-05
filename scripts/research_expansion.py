"""Cache public MusicBrainz evidence; never write the production catalogue.

Exact normalized title and lead-credit matches only. Search caps at the candidate
year to avoid later reissues; ambiguous/truncated results remain review candidates.
"""
import json, re, time, unicodedata, hashlib, sys
from pathlib import Path
import requests

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/expansion'
def norm(v):
    return re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKD',str(v)).encode('ascii','ignore').decode().lower()).strip()
def lead(v):
    return re.sub(r'^the ','',norm(re.split(r'\s+(?:feat\.?|ft\.?|featuring|with|and|&)\s+',str(v),flags=re.I)[0]))
def key(r): return norm(r['title'])+'|'+lead(r['artist'])
def credit(r): return ''.join(x if isinstance(x,str) else x.get('name','')+x.get('joinphrase','') for x in r.get('artist-credit',[]))
def quoted(v): return re.sub(r'[+\-!(){}\[\]^"~*?:\\/]',' ',v).strip()
BAD=re.compile(r'\b(live|remix|remaster|demo|karaoke|tribute|cover|acoustic|instrumental|re-record|rerecord|edit|mix)\b',re.I)
def get_with_retry(session,url,**kwargs):
    for attempt in range(4):
        response=session.get(url,**kwargs)
        if response.status_code not in (429,500,502,503,504):return response
        time.sleep(min(30,max(2**(attempt+1),int(response.headers.get('Retry-After','0')) if response.headers.get('Retry-After','0').isdigit() else 0)))
    return response

def research():
    OUT.mkdir(parents=True,exist_ok=True)
    catalogue=json.loads((ROOT/'data/catalogue.json').read_text(encoding='utf-8'))
    existing={key(r) for rows in catalogue['modes']['greatest'].values() for r in rows}
    wave2='--wave2' in sys.argv
    gaps='--gaps' in sys.argv
    final='--final' in sys.argv
    last='--last' in sys.argv
    repair2001='--repair2001' in sys.argv
    candidates={}
    for name in (['replacement-2001-candidates'] if repair2001 else ['last-candidates'] if last else ['final-early','final-recent'] if final else ['gap-early','gap-middle','gap-recent'] if gaps else ['wave2-candidates'] if wave2 else ['early-candidates','middle-candidates','recent-candidates']):
        for r in json.loads((OUT/(name+'.json')).read_text(encoding='utf-8')):
            if 1950<=r.get('releaseYear',0)<=2022 and key(r) not in existing:candidates.setdefault(key(r),r)
    # Original singles recognized by the Recording Academy are popularity candidates,
    # not automatically proof of earliest worldwide release (e.g. later US singles).
    for row in ([] if wave2 or gaps or final or last or repair2001 else json.loads((OUT/'grammy-source-rows.json').read_text(encoding='utf-8'))):
        if len(row)!=5 or 'Single' not in row[3]:continue
        m=re.search(r'\((\d{4})\)',row[2])
        if not m or not 1950<=int(m[1])<=2022:continue
        r={'title':row[0].title(),'artist':row[1],'releaseYear':int(m[1]),'popularitySourceUrl':'https://www.grammy.com/awards/hall-of-fame-award/'}
        if key(r) not in existing:candidates.setdefault(key(r),r)
    pool=sorted(candidates.values(),key=lambda r:(r.get('priority',len(catalogue['modes']['greatest'].get(str(r['releaseYear']),[]))),r['releaseYear'],r['title']))
    session=requests.Session();session.headers['User-Agent']='Guess-the-Song-Year/1.0 (private catalogue research; https://github.com/hwatson14/Guess-the-Song-Year)'
    accepted=[];unresolved=[];cache=OUT/'musicbrainz-cache';cache.mkdir(exist_ok=True)
    for start in range(0,len(pool),8):
        batch=pool[start:start+8]
        query=' OR '.join(f'(recording:"{quoted(r["title"])}" AND artistname:"{quoted(r["artist"])}" AND firstreleasedate:[* TO {r["releaseYear"]}])' for r in batch)
        cachefile=cache/(hashlib.sha256(query.encode()).hexdigest()+'.json')
        try:
            if cachefile.exists():payload=json.loads(cachefile.read_text(encoding='utf-8'))
            else:
                time.sleep(1.1)
                response=get_with_retry(session,'https://musicbrainz.org/ws/2/recording/',params={'query':query,'fmt':'json','limit':100},timeout=25)
                response.raise_for_status();payload=response.json();cachefile.write_text(json.dumps(payload),encoding='utf-8')
            # Fully page each bounded query before selecting its earliest recording.
            while len(payload.get('recordings',[]))<min(payload.get('count',0),1000):
                time.sleep(1.1)
                response=get_with_retry(session,'https://musicbrainz.org/ws/2/recording/',params={'query':query,'fmt':'json','limit':100,'offset':len(payload['recordings'])},timeout=25)
                response.raise_for_status()
                more=response.json().get('recordings',[])
                if not more:break
                payload['recordings'].extend(more)
                cachefile.write_text(json.dumps(payload),encoding='utf-8')
            for r in batch:
                matches=[]
                for entity in payload.get('recordings',[]):
                    date=entity.get('first-release-date','')
                    if not re.match(r'^\d{4}',date) or entity.get('video') or BAD.search(entity.get('disambiguation','')):continue
                    if norm(entity.get('title',''))!=norm(r['title']) or lead(credit(entity))!=lead(r['artist']):continue
                    year=int(date[:4])
                    if year>r['releaseYear']:continue
                    if not any(x.get('status')=='Official' for x in entity.get('releases',[])):continue
                    matches.append(entity)
                if payload.get('count',0)>len(payload.get('recordings',[])) or not matches:
                    unresolved.append({**r,'reason':'truncated search or no exact original-recording match'});continue
                e=min(matches,key=lambda x:x['first-release-date']);date=e['first-release-date']
                if int(date[:4])<1950 or (not r.get('unknownReleaseYear') and int(date[:4])<r['releaseYear']-2):
                    unresolved.append({**r,'reason':'earliest exact recording differs by more than two years; manual review required'});continue
                accepted.append({**r,'releaseYear':int(date[:4]),'musicbrainzId':e['id'],'sourceUrl':'https://musicbrainz.org/recording/'+e['id'],'sourceProvider':'MusicBrainz recording database','sourceRetrievalDate':'2026-09-05','releaseYearEvidence':'Earliest first-release-date among exact title and lead-credit matches in the cached MusicBrainz search; alternate annotations excluded.','releaseDateEvidence':date,'evidenceState':'externally_observed','matchedTitle':e['title'],'matchedArtist':credit(e),'searchCache':cachefile.relative_to(ROOT).as_posix(),'spotifyId':'','youtubeId':''})
        except (requests.RequestException,ValueError) as error:
            unresolved.extend({**r,'reason':type(error).__name__} for r in batch)
        (OUT/('musicbrainz-reviewed-repair2001.json' if repair2001 else 'musicbrainz-reviewed-last.json' if last else 'musicbrainz-reviewed-final.json' if final else 'musicbrainz-reviewed-gaps.json' if gaps else 'musicbrainz-reviewed-wave2.json' if wave2 else 'musicbrainz-reviewed.json')).write_text(json.dumps({'accepted':accepted,'unresolved':unresolved,'processed':min(start+8,len(pool)),'total':len(pool)},indent=2),encoding='utf-8')
        print(json.dumps({'processed':min(start+8,len(pool)),'total':len(pool),'accepted':len(accepted),'unresolved':len(unresolved)}),flush=True)
    return accepted
if __name__=='__main__':research()
