from pathlib import Path

p=Path('scripts/build_catalogue.py')
s=p.read_text()

marker="""def attach(song,rows):
 best=None;score=0
 for r in rows:
  s=sim(song['title'],r['title'])*2+sim(song['artist'],r['artist'])
  if s>score:score=s;best=r
 if best and score>1.8:
  song['spotifyId']=best.get('spotifyId','');song['youtubeId']=best.get('youtubeId','')
 return song

def greatest_pool(year,bim):"""

insert="""def attach(song,rows):
 best=None;score=0
 for r in rows:
  s=sim(song['title'],r['title'])*2+sim(song['artist'],r['artist'])
  if s>score:score=s;best=r
 if best and score>1.8:
  song['spotifyId']=best.get('spotifyId','');song['youtubeId']=best.get('youtubeId','')
 return song

def wikidata_rows(year):
 q=f'''SELECT ?item ?itemLabel ?performerLabel ?sitelinks WHERE {{
   VALUES ?root {{ wd:Q7366 wd:Q134556 }}
   ?item wdt:P31/wdt:P279* ?root ; wdt:P577 ?date ; wdt:P175 ?performer ; wikibase:sitelinks ?sitelinks .
   FILTER(YEAR(?date)={year})
   SERVICE wikibase:label {{ bd:serviceParam wikibase:language \"en\". }}
 }} ORDER BY DESC(?sitelinks) LIMIT 100'''
 try:
  r=get('https://query.wikidata.org/sparql',params={'query':q,'format':'json'},headers={'Accept':'application/sparql-results+json','User-Agent':UA})
  bindings=r.json().get('results',{}).get('bindings',[])
 except Exception as e:
  print('Wikidata failed',year,e);return []
 out=[];seen=set()
 for i,b in enumerate(bindings):
  title=clean((b.get('itemLabel') or {}).get('value'))
  artist=clean((b.get('performerLabel') or {}).get('value'))
  if not title or not artist or title.startswith('Q') or artist.startswith('Q'):continue
  k=key(title,artist)
  if k in seen:continue
  seen.add(k);out.append({'title':title,'artist':artist,'chartYear':year,'rank':500+i,'spotifyId':'','youtubeId':''})
 return out

def verified_from_rows(year,rows,found):
 for start in range(0,len(rows),10):
  chunk=rows[start:start+10]
  clauses=[f'(recording:\"{lucene(r[\"title\"])}\" AND artistname:\"{lucene(main_artist(r[\"artist\"]))}\")' for r in chunk]
  for f in exact_candidates(year,clauses):found.setdefault(key(f['title'],f['artist']),f)
  if len(found)>=TARGET_POOL*2:break

def greatest_pool(year,bim):"""

if marker not in s: raise SystemExit('attach/greatest marker not found')
s=s.replace(marker,insert,1)

old=""" found={}
 for start in range(0,len(rows),10):
  chunk=rows[start:start+10]
  clauses=[f'(recording:\"{lucene(r[\"title\"])}\" AND artistname:\"{lucene(main_artist(r[\"artist\"]))}\")' for r in chunk]
  for f in exact_candidates(year,clauses):found.setdefault(key(f['title'],f['artist']),f)
  if len(found)>=TARGET_POOL*2:break
 ranked=[]"""
new=""" found={}
 verified_from_rows(year,rows,found)
 if len(found)<TARGET_POOL*2:
  extra=wikidata_rows(year)
  verified_from_rows(year,extra,found)
  rows=rows+extra
 ranked=[]"""
if old not in s: raise SystemExit('greatest discovery block not found')
s=s.replace(old,new,1)

p.write_text(s)
