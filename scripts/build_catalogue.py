#!/usr/bin/env python3
import csv, io, json, re, time, unicodedata
from pathlib import Path
from urllib.parse import quote
import requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data'/'catalogue.json'
YEARS=list(range(1950,2023))
BIMMUDA='https://raw.githubusercontent.com/madelinehamilton/BiMMuDa/main/metadata/bimmuda_per_song_metadata.csv'
WIKI='https://en.wikipedia.org/wiki/List_of_top_25_singles_for_{yeary_in_Australia'
MB='https://musicbrainz.org/ws/2/recording/'
UA='Guess-the-Song-Year/1.0 (private game catalogue builder; https://github.com/hwatson14/Guess-the-Song-Year)'
S=requests.Session();S.headers.update({'User-Agent':UA})
_last_mb=0.0
_mb_cache={}

AU_ARTISTS={
1950:['Slim Dusty','Smoky Dawson','Tex Morton','Buddy Williams','Reg Lindsay','Johnny Ashcroft','Lonnie Lee','Johnny O\'Keefe','Col Joye','The Delltones'],
1960:['Johnny O\'Keefe','Col Joye','The Delltones','The Easybeats','The Seekers','Bee Gees','Normie Rowe','Billy Thorpe','The Masters Apprentices','Russell Morris','The Twilights','Johnny Young'],
1970:['AC/DC','Bee Gees','Skyhooks','Sherbet','Little River Band','Cold Chisel','John Paul Young','Olivia Newton-John','Air Supply','Dragon','The Angels','Marcia Hines','Daryl Braithwaite','Richard Clapton'],
1980:['INXS','Men at Work','Midnight Oil','Icehouse','Crowded House','Kylie Minogue','Hoodoo Gurus','Divinyls','Australian Crawl','Mental As Anything','The Church','Nick Cave and the Bad Seeds','Hunters & Collectors','John Farnham','Jimmy Barnes','Pseudo Echo'],
1990:['Silverchair','Savage Garden','Powderfinger','Kylie Minogue','Nick Cave and the Bad Seeds','Tina Arena','The Living End','Regurgitator','Natalie Imbruglia','You Am I','Spiderbait','The Cruel Sea','Crowded House','INXS','Paul Kelly','Frenzal Rhomb'],
2000:['Kylie Minogue','Jet','Wolfmother','The Vines','The Veronicas','Missy Higgins','Hilltop Hoods','Powderfinger','Delta Goodrem','Empire of the Sun','Cut Copy','The Presets','Sia','Silverchair','Eskimo Joe','John Butler Trio','Grinspoon'],
2010:['Sia','Tame Impala','Flume','Vance Joy','5 Seconds of Summer','Tones and I','Gang of Youths','RUFUS DU SOL','Courtney Barnett','Peking Duk','Amy Shark','Dean Lewis','Troye Sivan','The Kid LAROI','Gotye','Matt Corby','Ball Park Music','DMA\'s'],
2020:['The Kid LAROI','Troye Sivan','Kylie Minogue','Tones and I','Spacey Jane','Genesis Owusu','RUFUS DU SOL','Dom Dolla','Royel Otis','Peach PRC','King Gizzard & the Lizard Wizard','Tame Impala','Thelma Plum','Teenage Dads','Budjerah','Confidence Man']}

TIMEWARP=[
('Rumble','Link Wray',1958),('Telstar','The Tornados',1962),('You Really Got Me','The Kinks',1964),('Tomorrow Never Knows','The Beatles',1966),('White Rabbit','Jefferson Airplane',1967),('In-A-Gadda-Da-Vida','Iron Butterfly',1968),('Space Oddity','David Bowie',1969),('Baba O\'Riley','The Who',1971),('Superstition','Stevie Wonder',1972),('Rock On','David Essex',1973),('Autobahn','Kraftwerk',1974),('Bohemian Rhapsody','Queen',1975),('Blitzkrieg Bop','Ramones',1976),('I Feel Love','Donna Summer',1977),('September','Earth, Wind & Fire',1978),('Cars','Gary Numan',1979),('Once in a Lifetime','Talking Heads',1980),('Tainted Love','Soft Cell',1981),('Blue Monday','New Order',1983),('Smalltown Boy','Bronski Beat',1984),('Running Up That Hill','Kate Bush',1985),('Walk Like an Egyptian','The Bangles',1986),('Never Gonna Give You Up','Rick Astley',1987),('Fast Car','Tracy Chapman',1988),('Personal Jesus','Depeche Mode',1989),('Groove Is in the Heart','Deee-Lite',1990),('Unfinished Sympathy','Massive Attack',1991),('Cannonball','The Breeders',1993),('Girls & Boys','Blur',1994),('Common People','Pulp',1995),('Virtual Insanity','Jamiroquai',1996),('Song 2','Blur',1997),('Music Sounds Better with You','Stardust',1998),('Porcelain','Moby',1999),('One More Time','Daft Punk',2000),('Can\'t Get You Out of My Head','Kylie Minogue',2001),('Are You Gonna Be My Girl','Jet',2003),('Somebody Told Me','The Killers',2004),('Feel Good Inc.','Gorillaz',2005),('Crazy','Gnarls Barkley',2006),('Valerie','Mark Ronson feat. Amy Winehouse',2007),('Bulletproof','La Roux',2009),('Tightrope','Janelle Monae',2010),('Midnight City','M83',2011),('Get Lucky','Daft Punk',2013),('Uptown Funk','Mark Ronson feat. Bruno Mars',2014),('Can\'t Feel My Face','The Weeknd',2015),('Redbone','Childish Gambino',2016),('Feel It Still','Portugal. The Man',2017),('Make Me Feel','Janelle Monae',2018),('bad guy','Billie Eilish',2019),('Levitating','Dua Lipa',2020),('good 4 u','Olivia Rodrigo',2021),('About Damn Time','Lizzo',2022)]

def norm(v):
    return re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKD',str(v or '')).encode('ascii','ignore').decode().lower()).strip()
def toks(v): return set(norm(v).split())
def sim(a,b):
    aa,bb=toks(a),toks(b)
    return len(aa&bb)/max(len(aa),len(bb)) if aa and bb else 0
def clean(v): return re.sub(r'\[[^\]]*\]','',str(v or '')).strip().strip('"“”')
def first_title(v): return clean(re.split(r'\s+/\s+',clean(v))[0])
def first_artist(v): return clean(re.split(r';|\s+with\s+|\s+featuring\s+',clean(v),maxsplit=1,flags=re.I)[0])
def key(title,artist): return norm(title)+'|'+norm(artist)
def main_artist(v): return re.split(r'feat\.|ft\.|&|,| and | featuring ',str(v or ''),maxsplit=1,flags=re.I)[0].strip()
def lucene(v): return re.sub(r'[+\-!(){}\[\]^"~*?:\\/]',' ',str(v or '')).strip()

def get(url,**kwargs):
    for i in range(4):
        r=S.get(url,timeout=35,**kwargs)
        if r.status_code in (429,503): time.sleep(2*(i+1));continue
        r.raise_for_status();return r
    raise RuntimeError('GET failed: '+url)

def bimmuda_rows():
    rows=[]
    for r in csv.DictReader(io.StringIO(get(BIMMUDA).text)):
        try:y=int(r.get('Year') or 0);rank=float(r.get('Position') or 99)
        except:continue
        if y not in YEARS:continue
        link=r.get('Link to Audio') or ''
        sp=(re.search(r'open\.spotify\.com/track/([A-Za-z0-9]+)',link) or [None,None])[1]
        yt=(re.search(r'[?&]v=([A-Za-z0-9_-]{11})',link) or [None,None])[1]
        rows.append({'title':clean(r.get('Title')),'artist':clean(r.get('Artist')),'chartYear':y,'rank':rank,'spotifyId':sp or '','youtubeId':yt or ''})
    return rows

def annual_chart(year):
    urls=[WIKI.format(year=year),f'https://en.wikipedia.org/wiki/List_of_top_100_singles_for_{year}_in_Australia']
    html=None
    for url in urls:
        try:html=get(url).text;break
        except:pass
    if not html: raise RuntimeError(f'No Australian annual chart page for {year}')
    soup=BeautifulSoup(html,'html.parser')
    best=[]
    for table in soup.select('table.wikitable'):
        rows=table.find_all('tr')
        if not rows:continue
        heads=[clean(x.get_text(' ',strip=True)).lower() for x in rows[0].find_all(['th','td'])]
        ti=next((i for i,h in enumerate(heads) if 'title' in h or 'single'==h),None)
        ai=next((i for i,h in enumerate(heads) if 'artist' in h),None)
        if ti is None or ai is None:continue
        parsed=[]
        for tr in rows[1:]:
            cells=[clean(x.get_text(' ',strip=True)) for x in tr.find_all(['th','td'])]
            if len(cells)<=max(ti,ai):continue
            rankm=re.match(r'\D*(\d+)',cells[0])
            if not rankm:continue
            rank=int(rankm.group(1));title=first_title(cells[ti]);artist=first_artist(cells[ai])
            if title and artist:parsed.append({'rank':rank,'title':title,'artist':artist})
        if len(parsed)>len(best):best=parsed
    if not best: raise RuntimeError(f'Could not parse Australian annual chart {year}')
    return sorted(best,key=lambda x:x['rank'])

def mb_call(params):
    global _last_mb
    k=json.dumps(params,sort_keys=True)
    if k in _mb_cache:return _mb_cache[k]
    wait=max(0,1.05-(time.time()-_last_mb))
    if wait:time.sleep(wait)
    r=get(MB,params={**params,'fmt':'json'},headers={'Accept':'application/json','User-Agent':UA})
    _last_mb=time.time();data=r.json();_mb_cache[k]=data;return data

def mb_release_year(title,artist):
    q=f'recording:"{lucene(title)}" AND artistname:"{lucene(main_artist(artist))}"'
    d=mb_call({'query':q,'limit':8})
    best=None;bestscore=-1
    for rec in d.get('recordings',[]):
        date=rec.get('first-release-date') or ''
        if not re.match(r'^\d{4}',date):continue
        credit=''.join((x if isinstance(x,str) else x.get('name') or (x.get('artist') or {}).get('name') or '') for x in rec.get('artist-credit',[]))
        score=sim(rec.get('title'),title)*2+sim(credit,artist)+float(rec.get('score') or 0)/200
        if score>bestscore:bestscore=score;best=(int(date[:4]),rec.get('title') or title,credit or artist)
    return best if bestscore>=1.1 else None

def australian_pool(year):
    dec=(year//10)*10;artists=AU_ARTISTS.get(dec,AU_ARTISTS[2020])
    ors=' OR '.join(f'artistname:"{lucene(a)}"' for a in artists[:16])
    q=f'firstreleasedate:[{year}-01-01 TO {year}-12-31] AND ({ors})'
    d=mb_call({'query':q,'limit':60})
    out=[];seen=set()
    for rec in sorted(d.get('recordings',[]),key=lambda r:float(r.get('score') or 0),reverse=True):
        date=rec.get('first-release-date') or ''
        if not date.startswith(str(year)):continue
        title=clean(rec.get('title'))
        if re.search(r'live|remix|demo|karaoke|instrumental',title,re.I):continue
        artist=''.join((x if isinstance(x,str) else x.get('name') or (x.get('artist') or {}).get('name') or '') for x in rec.get('artist-credit',[])).strip()
        if not title or not artist:continue
        k=key(title,artist)
        if k in seen:continue
        seen.add(k);out.append({'title':title,'artist':artist,'year':year,'source':'musicbrainz-au','sourceLabel':'Australian artists · MusicBrainz release year'})
        if len(out)>=5:break
    return out

def attach_ids(song,lookup):
    candidates=lookup.get(key(song['title'],song['artist']),[])
    if not candidates:
        candidates=[r for rows in lookup.values() for r in rows if sim(r['title'],song['title'])>.75 and sim(r['artist'],song['artist'])>.45]
    if candidates:
        r=sorted(candidates,key=lambda x:x['rank'])[0]
        if r.get('spotifyId'):song['spotifyId']=r['spotifyId']
        if r.get('youtubeId'):song['youtubeId']=r['youtubeId']
    return song

def main():
    OUT.parent.mkdir(parents=True,exist_ok=True)
    print('Loading BiMMuDA...');bim=bimmuda_rows();lookup={}
    for r in bim:lookup.setdefault(key(r['title'],r['artist']),[]).append(r)
    annual={}
    for y in YEARS:
        print('Chart',y);annual[y]=annual_chart(y)

    modes={m:{} for m in ['greatest','australian','unexpected','number1_us','number1_au']}

    # Deterministic annual #1 modes.
    for y in YEARS:
        au=annual[y][0]
        modes['number1_au'][str(y)]=[attach_ids({'title':au['title'],'artist':au['artist'],'year':y,'chartYear':y,'source':'australia-eoy-1','sourceLabel':'Australian year-end #1'},lookup)]
        us=sorted([r for r in bim if r['chartYear']==y],key=lambda x:x['rank'])
        if us:
            r=us[0];modes['number1_us'][str(y)]=[{'title':r['title'],'artist':r['artist'],'year':y,'chartYear':y,'source':'billboard-eoy-1','sourceLabel':'Billboard year-end #1','spotifyId':r.get('spotifyId',''),'youtubeId':r.get('youtubeId','')}]

    # Australian artist pool: one network query per year.
    for y in YEARS:
        print('Australian releases',y);pool=australian_pool(y)
        if pool:modes['australian'][str(y)]=[attach_ids(x,lookup) for x in pool]

    # Greatest Hits: take the highest-ranked Australian annual-chart songs that MusicBrainz confirms were first released that year.
    for y in YEARS:
        print('Greatest releases',y);pool=[];seen=set()
        for row in annual[y][:22]:
            info=mb_release_year(row['title'],row['artist'])
            if not info or info[0]!=y:continue
            title,artist=info[1],info[2]
            k=key(title,artist)
            if k in seen:continue
            seen.add(k);pool.append(attach_ids({'title':title,'artist':artist,'year':y,'chartRank':row['rank'],'source':'australia-eoy-release','sourceLabel':'Australian year-end chart · release year verified'},lookup))
            if len(pool)>=5:break
        # Exact-year Australian songs are a safe fallback if the annual chart had too few same-year releases.
        for song in modes['australian'].get(str(y),[]):
            if len(pool)>=4:break
            if key(song['title'],song['artist']) not in seen:seen.add(key(song['title'],song['artist']));pool.append(dict(song))
        if not pool:raise RuntimeError(f'No exact-year Greatest Hits candidate for {y}')
        modes['greatest'][str(y)]=pool

    # Curated time-warp picks. Years without one intentionally fall back to Greatest Hits in the app.
    for title,artist,y in TIMEWARP:
        if y in YEARS:modes['unexpected'].setdefault(str(y),[]).append(attach_ids({'title':title,'artist':artist,'year':y,'source':'curated-timewarp','sourceLabel':'Curated Unexpected Years'},lookup))

    missing={m:[y for y in YEARS if not modes[m].get(str(y))] for m in ['greatest','australian','number1_us','number1_au']}
    print('Missing coverage:',missing)
    data={'version':6,'generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'years':YEARS,'modes':modes,'coverage':{m:len(YEARS)-len(v) for m,v in missing.items()},'sources':{'greatest':'Australian annual charts + MusicBrainz first-release verification','australian':'Curated Australian artist set + MusicBrainz first-release dates','number1_us':'BiMMuDa Billboard year-end position 1','number1_au':'Australian annual end-of-year chart position 1','unexpected':'Curated time-warp list; falls back to Greatest Hits when absent'}}
    OUT.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
    print('Wrote',OUT,'bytes',OUT.stat().st_size)

if __name__=='__main__':main()
