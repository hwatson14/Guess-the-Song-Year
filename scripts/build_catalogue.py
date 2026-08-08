#!/usr/bin/env python3
import csv, io, json, re, time, unicodedata
from pathlib import Path
import requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data'/'catalogue.json'
YEARS=list(range(1950,2023))
BIMMUDA='https://raw.githubusercontent.com/madelinehamilton/BiMMuDa/main/metadata/bimmuda_per_song_metadata.csv'
MB='https://musicbrainz.org/ws/2/recording/'
UA='Guess-the-Song-Year/1.0 (private-use catalogue builder; https://github.com/hwatson14/Guess-the-Song-Year)'
S=requests.Session();S.headers.update({'User-Agent':UA})
_last_mb=0.0

AU_ARTISTS={
1950:['Slim Dusty','Buddy Williams','Tex Morton','Smoky Dawson','Reg Lindsay','Johnny Ashcroft','Johnny O’Keefe','Col Joye'],
1960:['The Easybeats','The Seekers','Bee Gees','Normie Rowe','Billy Thorpe','The Masters Apprentices','Russell Morris','Johnny O’Keefe'],
1970:['AC/DC','Bee Gees','Skyhooks','Sherbet','Little River Band','Cold Chisel','John Paul Young','Olivia Newton-John','Air Supply','Dragon','The Angels'],
1980:['INXS','Men at Work','Midnight Oil','Icehouse','Crowded House','Kylie Minogue','Hoodoo Gurus','Divinyls','Australian Crawl','Mental As Anything','The Church','Hunters & Collectors','John Farnham','Jimmy Barnes'],
1990:['Silverchair','Savage Garden','Powderfinger','Kylie Minogue','Tina Arena','The Living End','Regurgitator','Natalie Imbruglia','You Am I','Spiderbait','The Cruel Sea','Crowded House','INXS','Paul Kelly','Frenzal Rhomb'],
2000:['Kylie Minogue','Jet','Wolfmother','The Vines','The Veronicas','Missy Higgins','Hilltop Hoods','Powderfinger','Delta Goodrem','Empire of the Sun','Cut Copy','The Presets','Sia','Silverchair','Eskimo Joe','John Butler Trio'],
2010:['Sia','Tame Impala','Flume','Vance Joy','5 Seconds of Summer','Tones and I','Gang of Youths','RÜFÜS DU SOL','Courtney Barnett','Peking Duk','Amy Shark','Dean Lewis','Troye Sivan','The Kid LAROI','Gotye','Matt Corby','Ball Park Music'],
2020:['The Kid LAROI','Troye Sivan','Kylie Minogue','Tones and I','Spacey Jane','Genesis Owusu','RÜFÜS DU SOL','Dom Dolla','Royel Otis','Peach PRC','King Gizzard & the Lizard Wizard','Tame Impala','Thelma Plum','Teenage Dads','Budjerah','Confidence Man']}

TIMEWARP=[
('Rumble','Link Wray',1958),('Telstar','The Tornados',1962),('You Really Got Me','The Kinks',1964),('Tomorrow Never Knows','The Beatles',1966),('White Rabbit','Jefferson Airplane',1967),('Space Oddity','David Bowie',1969),('Baba O’Riley','The Who',1971),('Superstition','Stevie Wonder',1972),('Autobahn','Kraftwerk',1974),('Bohemian Rhapsody','Queen',1975),('I Feel Love','Donna Summer',1977),('Cars','Gary Numan',1979),('Once in a Lifetime','Talking Heads',1980),('Tainted Love','Soft Cell',1981),('Blue Monday','New Order',1983),('Running Up That Hill','Kate Bush',1985),('Fast Car','Tracy Chapman',1988),('Personal Jesus','Depeche Mode',1989),('Groove Is in the Heart','Deee-Lite',1990),('Unfinished Sympathy','Massive Attack',1991),('Common People','Pulp',1995),('Virtual Insanity','Jamiroquai',1996),('Song 2','Blur',1997),('Music Sounds Better with You','Stardust',1998),('Porcelain','Moby',1999),('One More Time','Daft Punk',2000),('Can’t Get You Out of My Head','Kylie Minogue',2001),('Are You Gonna Be My Girl','Jet',2003),('Feel Good Inc.','Gorillaz',2005),('Crazy','Gnarls Barkley',2006),('Bulletproof','La Roux',2009),('Midnight City','M83',2011),('Get Lucky','Daft Punk',2013),('Uptown Funk','Mark Ronson feat. Bruno Mars',2014),('Redbone','Childish Gambino',2016),('Feel It Still','Portugal. The Man',2017),('bad guy','Billie Eilish',2019),('Levitating','Dua Lipa',2020),('good 4 u','Olivia Rodrigo',2021),('About Damn Time','Lizzo',2022)]

EARLY_AU={
1950:('Quicksilver','Bing Crosby & The Andrews Sisters'),
1951:('Too Young','Nat King Cole'),
1952:("Auf Wiederseh'n Sweetheart",'Vera Lynn'),
1953:('Pretend','Nat King Cole'),
1954:('The Happy Wanderer','Frank Weir')}

def norm(v):return re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKD',str(v or '')).encode('ascii','ignore').decode().lower()).strip()
def toks(v):return set(norm(v).split())
def sim(a,b):
 a,b=toks(a),toks(b);return len(a&b)/max(len(a),len(b)) if a and b else 0
def clean(v):return str(v or '').strip().strip('“”"')
def main_artist(v):return re.split(r'feat\.|ft\.|&|,| and | featuring ',str(v or ''),maxsplit=1,flags=re.I)[0].strip()
def lucene(v):return re.sub(r'[+\-!(){}\[\]^"~*?:\\/]',' ',str(v or '')).strip()
def key(t,a):return norm(t)+'|'+norm(a)

def get(url,**kw):
 for i in range(6):
  try:
   r=S.get(url,timeout=40,**kw)
   if r.ok:return r
   if r.status_code not in (429,500,502,503,504):r.raise_for_status()
  except requests.RequestException:
   pass
  time.sleep(min(20,3*(i+1)))
 raise RuntimeError('GET failed: '+url)

def mb(query,limit=60):
 global _last_mb
 wait=max(0,1.15-(time.time()-_last_mb))
 if wait:time.sleep(wait)
 r=get(MB,params={'fmt':'json','limit':limit,'query':query},headers={'Accept':'application/json','User-Agent':UA})
 _last_mb=time.time();return r.json()

def bimmuda_rows():
 out=[]
 for r in csv.DictReader(io.StringIO(get(BIMMUDA).text)):
  try:y=int(r.get('Year') or 0);rank=float(re.match(r'\d+(?:\.\d+)?',str(r.get('Position') or '99')).group())
  except:continue
  if y not in YEARS:continue
  link=r.get('Link to Audio') or ''
  sp=(re.search(r'open\.spotify\.com/track/([A-Za-z0-9]+)',link) or [None,None])[1]
  yt=(re.search(r'[?&]v=([A-Za-z0-9_-]{11})',link) or [None,None])[1]
  out.append({'title':clean(r.get('Title')),'artist':clean(r.get('Artist')),'chartYear':y,'rank':rank,'spotifyId':sp or '','youtubeId':yt or ''})
 return out

def annual_chart(year):
 if year in EARLY_AU:
  t,a=EARLY_AU[year];return [{'rank':1,'title':t,'artist':a}]
 urls=[f'https://en.wikipedia.org/wiki/List_of_top_25_singles_for_{year}_in_Australia',f'https://en.wikipedia.org/wiki/List_of_Top_25_singles_for_{year}_in_Australia',f'https://en.wikipedia.org/wiki/List_of_top_100_singles_for_{year}_in_Australia',f'https://en.wikipedia.org/wiki/List_of_Top_100_singles_for_{year}_in_Australia']
 html=None
 for u in urls:
  try:html=get(u).text;break
  except:pass
 if not html:raise RuntimeError(f'No Australian annual chart for {year}')
 soup=BeautifulSoup(html,'html.parser');best=[]
 for table in soup.select('table.wikitable'):
  trs=table.find_all('tr')
  if not trs:continue
  heads=[clean(x.get_text(' ',strip=True)).lower() for x in trs[0].find_all(['th','td'])]
  ti=next((i for i,h in enumerate(heads) if 'title' in h or h=='single'),None);ai=next((i for i,h in enumerate(heads) if 'artist' in h),None)
  if ti is None or ai is None:continue
  rows=[]
  for tr in trs[1:]:
   cells=[clean(x.get_text(' ',strip=True)) for x in tr.find_all(['th','td'])]
   if len(cells)<=max(ti,ai):continue
   m=re.match(r'\D*(\d+)',cells[0])
   if not m:continue
   title=re.split(r'\s+/\s+',cells[ti])[0].strip('“”"');artist=re.split(r';|\s+with\s+|\s+featuring\s+',cells[ai],maxsplit=1,flags=re.I)[0].strip()
   if title and artist:rows.append({'rank':int(m.group(1)),'title':title,'artist':artist})
  if len(rows)>len(best):best=rows
 if not best:raise RuntimeError(f'Could not parse Australian annual chart {year}')
 return sorted(best,key=lambda x:x['rank'])

def credit(rec):return ''.join(x if isinstance(x,str) else x.get('name') or (x.get('artist') or {}).get('name') or '' for x in rec.get('artist-credit',[])).strip()

def exact_candidates(year,clauses,limit=80):
 if not clauses:return []
 q=f'firstreleasedate:[{year}-01-01 TO {year}-12-31] AND ('+' OR '.join(clauses)+')'
 try:d=mb(q,limit)
 except Exception as e:
  print('MB batch failed',year,e);return []
 out=[];seen=set()
 for rec in d.get('recordings',[]):
  date=rec.get('first-release-date') or ''
  if not date.startswith(str(year)):continue
  title=clean(rec.get('title'));artist=credit(rec)
  if not title or not artist or re.search(r'karaoke|tribute|demo|live|remix|instrumental',title,re.I):continue
  k=key(title,artist)
  if k in seen:continue
  seen.add(k);out.append({'title':title,'artist':artist,'year':year,'mbScore':float(rec.get('score') or 0)})
 return out

def attach(song,lookup):
 best=None;score=0
 for rows in lookup.values():
  for r in rows:
   s=sim(song['title'],r['title'])*2+sim(song['artist'],r['artist'])
   if s>score:score=s;best=r
 if best and score>1.8:
  song['spotifyId']=best.get('spotifyId','');song['youtubeId']=best.get('youtubeId','')
 return song

def greatest_pool(year,bim,lookup):
 rows=sorted([r for r in bim if r['chartYear']==year],key=lambda r:r['rank'])[:7]
 clauses=[f'(recording:"{lucene(r["title"])}" AND artistname:"{lucene(main_artist(r["artist"]))}")' for r in rows]
 found=exact_candidates(year,clauses)
 ranked=[]
 for f in found:
  best=min(rows,key=lambda r:-(sim(f['title'],r['title'])*2+sim(f['artist'],r['artist']))) if rows else None
  score=max((sim(f['title'],r['title'])*2+sim(f['artist'],r['artist']) for r in rows),default=0)
  if score>=1.45:ranked.append((best['rank'] if best else 99,-f['mbScore'],f))
 ranked.sort(key=lambda x:(x[0],x[1]));pool=[];seen=set()
 for _,__,f in ranked:
  k=key(f['title'],f['artist'])
  if k in seen:continue
  seen.add(k);f.update({'source':'release-year-verified','sourceLabel':'Billboard hit · release year verified'});pool.append(attach(f,lookup))
  if len(pool)>=4:break
 if not pool and rows:
  r=rows[0];pool=[{'title':r['title'],'artist':r['artist'],'year':year,'chartYear':year,'source':'chart-year-fallback','sourceLabel':'Billboard year-end chart year fallback','spotifyId':r.get('spotifyId',''),'youtubeId':r.get('youtubeId','')}]
 return pool

def australian_pool(year,lookup):
 artists=AU_ARTISTS.get((year//10)*10,AU_ARTISTS[2020]);out=[]
 for chunk in (artists[:8],artists[8:16]):
  clauses=[f'artistname:"{lucene(a)}"' for a in chunk]
  found=exact_candidates(year,clauses,100)
  for f in sorted(found,key=lambda x:-x['mbScore']):
   if any(sim(f['artist'],a)>.55 for a in artists):
    f.update({'source':'australian-release','sourceLabel':'Australian artist · release year verified'});out.append(attach(f,lookup))
    if len(out)>=4:return out
  if out:return out
 return out

def main():
 OUT.parent.mkdir(parents=True,exist_ok=True);print('BiMMuDa');bim=bimmuda_rows();lookup={}
 for r in bim:lookup.setdefault(key(r['title'],r['artist']),[]).append(r)
 annual={}
 for y in YEARS:print('AU chart',y);annual[y]=annual_chart(y)
 modes={m:{} for m in ['greatest','australian','unexpected','number1_us','number1_au']}
 for y in YEARS:
  us=sorted([r for r in bim if r['chartYear']==y],key=lambda r:r['rank']);
  if us:
   r=us[0];modes['number1_us'][str(y)]=[{'title':r['title'],'artist':r['artist'],'year':y,'chartYear':y,'source':'billboard-eoy-1','sourceLabel':'Billboard year-end #1','spotifyId':r.get('spotifyId',''),'youtubeId':r.get('youtubeId','')}]
  au=annual[y][0];modes['number1_au'][str(y)]=[attach({'title':au['title'],'artist':au['artist'],'year':y,'chartYear':y,'source':'australia-eoy-1','sourceLabel':'Australian year-end #1'},lookup)]
  print('Greatest',y);g=greatest_pool(y,bim,lookup)
  if not g:raise RuntimeError(f'No Greatest Hits candidate for {y}')
  modes['greatest'][str(y)]=g
  print('Australian',y);a=australian_pool(y,lookup)
  if a:modes['australian'][str(y)]=a
 for t,a,y in TIMEWARP:
  modes['unexpected'].setdefault(str(y),[]).append(attach({'title':t,'artist':a,'year':y,'source':'curated-timewarp','sourceLabel':'Curated Unexpected Years'},lookup))
 missing={m:[y for y in YEARS if not modes[m].get(str(y))] for m in modes}
 data={'version':6,'generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'years':YEARS,'modes':modes,'coverage':{m:len(YEARS)-len(v) for m,v in missing.items()},'missing':missing,'sources':{'greatest':'Billboard year-end candidates with MusicBrainz exact first-release verification; explicit chart-year fallback when verification is unavailable','australian':'Curated Australian artists with MusicBrainz exact first-release year','number1_us':'BiMMuDa Billboard year-end position 1','number1_au':'Australian annual chart position 1','unexpected':'Curated time-warp list; app falls back to Greatest Hits for uncovered years'}}
 OUT.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')));print('coverage',data['coverage'],'bytes',OUT.stat().st_size)

if __name__=='__main__':main()
