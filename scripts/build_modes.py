#!/usr/bin/env python3
"""Add curated, canonical-release-year themed playlists to the prebuilt catalogue.

The themed lists are deliberately curated by title/artist, not by chart year. Each seed is
assigned to its earliest credible MusicBrainz first-release year. If a canonical Greatest
Hits entry already proves the same title/artist, that evidence is reused. Sparse themed
buckets explicitly fall back to Greatest Hits at runtime so all 308 physical cards remain
playable without falsifying a song year.
"""
import json
import re
import time
import unicodedata
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / 'engine.js'
ENGINE_V7 = ROOT / 'engine-v7.js'
APP = ROOT / 'app.js'
INDEX = ROOT / 'index.html'
README = ROOT / 'README.md'
SCHEMA = ROOT / 'data' / 'catalogue.schema.json'
VALIDATOR = ROOT / 'scripts' / 'validate_catalogue.py'
ENGINE_TEST = ROOT / 'scripts' / 'test_engine_v7.mjs'

MODE_META = {
    'greatest': {'name': 'Greatest Hits', 'short': 'Hits', 'desc': 'Big recognisable songs from the same year.'},
    'sing_along': {'name': 'Sing Along', 'short': 'Sing Along', 'desc': 'Huge choruses, karaoke staples and songs everyone joins in on.'},
    'australian': {'name': 'Australian', 'short': 'Australian', 'desc': 'Australian artists and homegrown favourites.'},
    'unexpected': {'name': 'Unexpected Years', 'short': 'Unexpected', 'desc': 'Songs whose real release year is surprisingly early or late.'},
    'party': {'name': 'Party Anthems', 'short': 'Party', 'desc': 'Dancefloor, wedding and party staples across the decades.'},
    'rock': {'name': 'Rock Classics', 'short': 'Rock', 'desc': 'Big riffs, guitars and rock anthems.'},
}

SEEDS = {
    'sing_along': [
        ('Heartbreak Hotel','Elvis Presley'),('Jailhouse Rock','Elvis Presley'),('Johnny B. Goode','Chuck Berry'),
        ('Shout','The Isley Brothers'),('The Twist','Chubby Checker'),('Stand by Me','Ben E. King'),
        ('Do You Love Me','The Contours'),('I Want to Hold Your Hand','The Beatles'),('You Really Got Me','The Kinks'),
        ("(I Can't Get No) Satisfaction",'The Rolling Stones'),("I'm a Believer",'The Monkees'),('Brown Eyed Girl','Van Morrison'),
        ('Hey Jude','The Beatles'),('Sweet Caroline','Neil Diamond'),('Let It Be','The Beatles'),
        ('Take Me Home, Country Roads','John Denver'),('Crocodile Rock','Elton John'),('Piano Man','Billy Joel'),
        ('Waterloo','ABBA'),('Bohemian Rhapsody','Queen'),('Dancing Queen','ABBA'),('We Will Rock You','Queen'),
        ('Y.M.C.A.','Village People'),('My Sharona','The Knack'),('Another One Bites the Dust','Queen'),
        ("Don't Stop Believin'",'Journey'),('Come On Eileen','Dexys Midnight Runners'),('Total Eclipse of the Heart','Bonnie Tyler'),
        ('Wake Me Up Before You Go-Go','Wham!'),("Summer of '69",'Bryan Adams'),("Livin' on a Prayer",'Bon Jovi'),
        ('I Wanna Dance with Somebody','Whitney Houston'),("I'm Gonna Be (500 Miles)",'The Proclaimers'),('Love Shack',"The B-52's"),
        ('Ice Ice Baby','Vanilla Ice'),('(Everything I Do) I Do It for You','Bryan Adams'),("What's Up?",'4 Non Blondes'),
        ('Mr. Jones','Counting Crows'),('Basket Case','Green Day'),('Wonderwall','Oasis'),('Wannabe','Spice Girls'),
        ('Tubthumping','Chumbawamba'),('Iris','Goo Goo Dolls'),('I Want It That Way','Backstreet Boys'),
        ('Teenage Dirtbag','Wheatus'),("Can't Get You Out of My Head",'Kylie Minogue'),('Complicated','Avril Lavigne'),
        ('Mr. Brightside','The Killers'),('Since U Been Gone','Kelly Clarkson'),("Don't Cha",'The Pussycat Dolls'),
        ('Chasing Cars','Snow Patrol'),('Bleeding Love','Leona Lewis'),('So What','P!nk'),('Party in the U.S.A.','Miley Cyrus'),
        ('Firework','Katy Perry'),('Someone Like You','Adele'),('Some Nights','fun.'),('Wake Me Up','Avicii'),
        ('Shake It Off','Taylor Swift'),('Hello','Adele'),('Cheap Thrills','Sia'),('Shape of You','Ed Sheeran'),
        ('Shallow','Lady Gaga'),('Dance Monkey','Tones and I'),('Levitating','Dua Lipa'),('good 4 u','Olivia Rodrigo'),
        ('As It Was','Harry Styles')
    ],
    'australian': [
        ('A Pub with No Beer','Slim Dusty'),('Wild One','Johnny O’Keefe'),("I'll Never Find Another You",'The Seekers'),
        ('The Carnival Is Over','The Seekers'),('Friday on My Mind','The Easybeats'),('The Real Thing','Russell Morris'),
        ('Eagle Rock','Daddy Cool'),("Most People I Know Think That I'm Crazy",'Billy Thorpe & The Aztecs'),('Horror Movie','Skyhooks'),
        ("It's a Long Way to the Top (If You Wanna Rock 'n' Roll)",'AC/DC'),('Howzat','Sherbet'),('Help Is on Its Way','Little River Band'),
        ('Khe Sanh','Cold Chisel'),('Lonesome Loser','Little River Band'),('Down Under','Men at Work'),('Boys in Town','Divinyls'),
        ('Great Southern Land','Icehouse'),('Reckless','Australian Crawl'),('Heaven (Must Be There)','Eurogliders'),
        ('Working Class Man','Jimmy Barnes'),("You're the Voice",'John Farnham'),('Beds Are Burning','Midnight Oil'),
        ('Under the Milky Way','The Church'),('Bedroom Eyes','Kate Ceberano'),('Better the Devil You Know','Kylie Minogue'),
        ('Treaty','Yothu Yindi'),('The Day You Went Away','Wendy Matthews'),('Holy Grail','Hunters & Collectors'),
        ('Tomorrow','Silverchair'),('Where the Wild Roses Grow','Nick Cave & The Bad Seeds'),('I Want You','Savage Garden'),
        ('Torn','Natalie Imbruglia'),('The Day You Come','Powderfinger'),('Weir','Killing Heidi'),('My Happiness','Powderfinger'),
        ("Can't Get You Out of My Head",'Kylie Minogue'),('Born to Try','Delta Goodrem'),('Are You Gonna Be My Girl','Jet'),
        ('Scar','Missy Higgins'),('Catch My Disease','Ben Lee'),('Black Fingernails, Red Wine','Eskimo Joe'),('Straight Lines','Silverchair'),
        ('Walking on a Dream','Empire of the Sun'),('Big Jet Plane','Angus & Julia Stone'),('Somebody That I Used to Know','Gotye'),
        ('Clair de Lune','Flight Facilities'),('Riptide','Vance Joy'),('Chandelier','Sia'),('Let It Happen','Tame Impala'),
        ('Never Be Like You','Flume'),('Chateau','Angus & Julia Stone'),('Youngblood','5 Seconds of Summer'),
        ('Dance Monkey','Tones and I'),('Lost in Yesterday','Tame Impala'),('Stay','The Kid LAROI'),('Hardlight','Spacey Jane')
    ],
    'unexpected': [
        ('Rumble','Link Wray'),('Telstar','The Tornados'),('You Really Got Me','The Kinks'),('Tomorrow Never Knows','The Beatles'),
        ('White Rabbit','Jefferson Airplane'),('Space Oddity','David Bowie'),("Baba O'Riley",'The Who'),('Superstition','Stevie Wonder'),
        ('Autobahn','Kraftwerk'),('Bohemian Rhapsody','Queen'),('I Feel Love','Donna Summer'),('Cars','Gary Numan'),
        ('Once in a Lifetime','Talking Heads'),('Tainted Love','Soft Cell'),('Blue Monday','New Order'),('Running Up That Hill','Kate Bush'),
        ('Fast Car','Tracy Chapman'),('Personal Jesus','Depeche Mode'),('Groove Is in the Heart','Deee-Lite'),('Unfinished Sympathy','Massive Attack'),
        ('Common People','Pulp'),('Virtual Insanity','Jamiroquai'),('Song 2','Blur'),('Music Sounds Better with You','Stardust'),
        ('Porcelain','Moby'),('One More Time','Daft Punk'),("Can't Get You Out of My Head",'Kylie Minogue'),('Are You Gonna Be My Girl','Jet'),
        ('Feel Good Inc.','Gorillaz'),('Crazy','Gnarls Barkley'),('Bulletproof','La Roux'),('Midnight City','M83'),
        ('Get Lucky','Daft Punk'),('Uptown Funk','Mark Ronson'),('Redbone','Childish Gambino'),('Feel It Still','Portugal. The Man'),
        ('bad guy','Billie Eilish'),('Levitating','Dua Lipa'),('good 4 u','Olivia Rodrigo'),('About Damn Time','Lizzo')
    ],
    'party': [
        ('Tequila','The Champs'),('The Twist','Chubby Checker'),('Dancing in the Street','Martha and the Vandellas'),
        ('Dancing Queen','ABBA'),("Stayin' Alive",'Bee Gees'),('Y.M.C.A.','Village People'),('Celebration','Kool & the Gang'),
        ('Super Freak','Rick James'),('Footloose','Kenny Loggins'),('Wake Me Up Before You Go-Go','Wham!'),
        ('You Spin Me Round (Like a Record)','Dead or Alive'),('Walk Like an Egyptian','The Bangles'),('Faith','George Michael'),
        ('Love Shack',"The B-52's"),('Vogue','Madonna'),('Gonna Make You Sweat (Everybody Dance Now)','C+C Music Factory'),
        ('Rhythm Is a Dancer','Snap!'),('What Is Love','Haddaway'),('Cotton Eye Joe','Rednex'),('Macarena','Los del Río'),
        ('Wannabe','Spice Girls'),('Freed from Desire','Gala'),('Mambo No. 5','Lou Bega'),('Blue (Da Ba Dee)','Eiffel 65'),
        ('Murder on the Dancefloor','Sophie Ellis-Bextor'),('Lady Marmalade','Christina Aguilera'),('Get the Party Started','P!nk'),
        ('Hey Ya!','Outkast'),('Yeah!','Usher'),("Hips Don't Lie",'Shakira'),('Low','Flo Rida'),('I Gotta Feeling','The Black Eyed Peas'),
        ('Dynamite','Taio Cruz'),('Party Rock Anthem','LMFAO'),('Starships','Nicki Minaj'),('Get Lucky','Daft Punk'),
        ('Uptown Funk','Mark Ronson'),('Lean On','Major Lazer'),('This Is What You Came For','Calvin Harris'),('One Kiss','Calvin Harris'),
        ('Old Town Road','Lil Nas X'),('Rain on Me','Lady Gaga'),('Stay','The Kid LAROI'),('About Damn Time','Lizzo')
    ],
    'rock': [
        ('Blue Suede Shoes','Carl Perkins'),('Jailhouse Rock','Elvis Presley'),('Johnny B. Goode','Chuck Berry'),
        ("Walk, Don't Run",'The Ventures'),('Runaround Sue','Dion'),('Green Onions','Booker T. & the M.G.’s'),('Louie Louie','The Kingsmen'),
        ('You Really Got Me','The Kinks'),("(I Can't Get No) Satisfaction",'The Rolling Stones'),('Wild Thing','The Troggs'),
        ('Purple Haze','The Jimi Hendrix Experience'),('All Along the Watchtower','The Jimi Hendrix Experience'),('Whole Lotta Love','Led Zeppelin'),
        ('Paranoid','Black Sabbath'),("Baba O'Riley",'The Who'),('Smoke on the Water','Deep Purple'),('Free Bird','Lynyrd Skynyrd'),
        ("You Ain't Seen Nothing Yet",'Bachman–Turner Overdrive'),('Bohemian Rhapsody','Queen'),('More Than a Feeling','Boston'),
        ('Barracuda','Heart'),('Sultans of Swing','Dire Straits'),('My Sharona','The Knack'),('Back in Black','AC/DC'),
        ('Start Me Up','The Rolling Stones'),('Eye of the Tiger','Survivor'),('Every Breath You Take','The Police'),('The Boys of Summer','Don Henley'),
        ('Money for Nothing','Dire Straits'),("Livin' on a Prayer",'Bon Jovi'),('Beds Are Burning','Midnight Oil'),('Handle with Care','Traveling Wilburys'),
        ("Free Fallin'",'Tom Petty'),('Thunderstruck','AC/DC'),('Smells Like Teen Spirit','Nirvana'),('Under the Bridge','Red Hot Chili Peppers'),
        ('Are You Gonna Go My Way','Lenny Kravitz'),('Basket Case','Green Day'),('Wonderwall','Oasis'),('Pepper','Butthole Surfers'),
        ('Song 2','Blur'),('Celebrity Skin','Hole'),('All the Small Things','Blink-182'),('Teenage Dirtbag','Wheatus'),('Last Nite','The Strokes'),
        ('No One Knows','Queens of the Stone Age'),('Mr. Brightside','The Killers'),('American Idiot','Green Day'),('Best of You','Foo Fighters'),
        ('Welcome to the Black Parade','My Chemical Romance'),('Misery Business','Paramore'),('Sex on Fire','Kings of Leon'),('Uprising','Muse'),
        ('Na Na Na','My Chemical Romance'),('Lonely Boy','The Black Keys'),('Ho Hey','The Lumineers'),('Do I Wanna Know?','Arctic Monkeys'),
        ('Figure It Out','Royal Blood'),('The Less I Know the Better','Tame Impala'),('The Sound','The 1975'),('Feel It Still','Portugal. The Man'),
        ('High Hopes','Panic! at the Disco'),('good 4 u','Olivia Rodrigo'),('The Loneliest','Måneskin')
    ],
}

UA = 'Guess-the-Song-Year/3.0 (private-use curated mode builder; https://github.com/hwatson14/Guess-the-Song-Year)'
MB_RECORDING = 'https://musicbrainz.org/ws/2/recording/'
S = requests.Session(); S.headers.update({'User-Agent': UA})
_last_mb = 0.0


def clean(v): return str(v or '').strip().strip('“”"')
def norm(v): return re.sub(r'[^a-z0-9]+',' ',unicodedata.normalize('NFKD',clean(v)).encode('ascii','ignore').decode().lower()).strip()
def toks(v): return set(norm(v).split())
def sim(a,b):
    aa,bb=toks(a),toks(b)
    return len(aa & bb)/max(len(aa),len(bb)) if aa and bb else 0
def main_artist(v): return re.split(r'feat\.|ft\.|&|,| and | featuring | with ',clean(v),maxsplit=1,flags=re.I)[0].strip()
def lucene(v): return re.sub(r'[+\-!(){}\[\]^"~*?:\\/]',' ',clean(v)).strip()
def song_key(t,a): return f'{norm(t)}|{norm(a)}'


def get(url, **kw):
    for i in range(5):
        try:
            r=S.get(url,timeout=45,**kw)
            if r.ok:return r
            if r.status_code not in (429,500,502,503,504):r.raise_for_status()
        except requests.RequestException:
            pass
        time.sleep(min(12,2*(i+1)))
    raise RuntimeError('GET failed: '+url)


def mb_recordings(title, artist):
    global _last_mb
    wait=max(0,1.1-(time.time()-_last_mb))
    if wait:time.sleep(wait)
    q=f'recording:"{lucene(title)}" AND artistname:"{lucene(main_artist(artist))}"'
    r=get(MB_RECORDING,params={'fmt':'json','limit':50,'query':q},headers={'Accept':'application/json','User-Agent':UA})
    _last_mb=time.time()
    return r.json().get('recordings',[])


def artist_credit(rec):
    return ''.join(x if isinstance(x,str) else x.get('name') or (x.get('artist') or {}).get('name') or '' for x in rec.get('artist-credit',[])).strip()


VARIANT=re.compile(r'\b(karaoke|tribute|demo|live|remix|mix|instrumental|acoustic|backing|sped up|slowed|re-record|radio edit|single edit|extended)\b',re.I)


def greatest_lookup(greatest):
    rows=[]
    for year,pool in greatest.items():
        for song in pool:
            rows.append((int(year),song))
    return rows


def match_greatest(title,artist,rows):
    nt=norm(title); ma=main_artist(artist)
    best=None;score=0
    for year,s in rows:
        if norm(s.get('title'))!=nt:continue
        a=max(sim(s.get('artist'),artist),sim(main_artist(s.get('artist')),ma))
        if a>score:score=a;best=(year,s)
    return best if best and score>=0.45 else None


def verify_seed(title,artist,rows,cache):
    k=song_key(title,artist)
    if k in cache:return cache[k]
    hit=match_greatest(title,artist,rows)
    if hit:
        year,s=hit
        evidence={'year':year,'kind':'canonical-greatest','song':s}
        cache[k]=evidence;return evidence
    valid=[]
    try: recordings=mb_recordings(title,artist)
    except Exception as e:
        print('WARN MusicBrainz failed',title,artist,e,flush=True);cache[k]=None;return None
    for rec in recordings:
        rt=clean(rec.get('title')); ra=artist_credit(rec); date=clean(rec.get('first-release-date'))
        if not re.match(r'^\d{4}',date) or not rt or VARIANT.search(rt):continue
        ts=sim(rt,title); ars=max(sim(ra,artist),sim(main_artist(ra),main_artist(artist)))
        if ts<0.65 or ars<0.42 or ts*2+ars<1.8:continue
        valid.append((int(date[:4]),-(ts*2+ars),-float(rec.get('score') or 0),rec,ts,ars))
    if not valid:
        print('WARN no canonical release match',title,'/',artist,flush=True);cache[k]=None;return None
    valid.sort(key=lambda x:(x[0],x[1],x[2]))
    year,_,__,rec,ts,ars=valid[0]
    if not 1950<=year<=2022:
        print('WARN outside game years',year,title,'/',artist,flush=True);cache[k]=None;return None
    evidence={'year':year,'kind':'musicbrainz-recording','recordingId':clean(rec.get('id')),'matchedTitle':clean(rec.get('title')),
              'matchedArtist':artist_credit(rec),'mbScore':float(rec.get('score') or 0),'titleSimilarity':round(ts,4),'artistSimilarity':round(ars,4)}
    cache[k]=evidence;return evidence


def song_from_seed(mode,title,artist,evidence):
    year=int(evidence['year']); hit=evidence.get('song') or {}
    song={'title':title,'artist':artist,'year':year,
          'source':f'curated-{mode}-canonical-release','sourceLabel':f'{MODE_META[mode]["name"]} · canonical earliest release {year}',
          'yearEvidence':'Canonical Greatest Hits evidence' if evidence['kind']=='canonical-greatest' else 'MusicBrainz recording earliest first-release-date'}
    for key in ('spotifyId','youtubeId','musicbrainzId','musicbrainzMatchedTitle','musicbrainzMatchedArtist','chartYear','chartRank'):
        if hit.get(key) not in (None,''):song[key]=hit[key]
    if evidence['kind']=='musicbrainz-recording':
        song.update({'musicbrainzRecordingId':evidence['recordingId'],'musicbrainzMatchedTitle':evidence['matchedTitle'],
                     'musicbrainzMatchedArtist':evidence['matchedArtist'],'mbScore':evidence['mbScore'],
                     'titleSimilarity':evidence['titleSimilarity'],'artistSimilarity':evidence['artistSimilarity']})
    return song


def build_themed_modes(greatest):
    rows=greatest_lookup(greatest);cache={};out={}
    for mode,seeds in SEEDS.items():
        buckets={};seen=set()
        print('Playlist',MODE_META[mode]['name'],flush=True)
        for title,artist in seeds:
            ev=verify_seed(title,artist,rows,cache)
            if not ev:continue
            song=song_from_seed(mode,title,artist,ev);y=str(song['year']);k=(y,norm(title),norm(artist))
            if k in seen:continue
            seen.add(k);buckets.setdefault(y,[]).append(song)
        out[mode]=buckets
        print(' ',len(buckets),'years',sum(map(len,buckets.values())),'songs',flush=True)
    return out


def write_schema():
    year_pat='^(19[5-9][0-9]|20[0-2][0-9])$'
    schema={
      '$schema':'https://json-schema.org/draft/2020-12/schema',
      '$id':'https://hwatson14.github.io/Guess-the-Song-Year/data/catalogue.schema.json',
      'title':'Guess the Song Year prebuilt catalogue',
      'description':'Static song-year catalogue. Every song year must equal its containing year bucket. Themed modes may be sparse and explicitly fall back to Greatest Hits.',
      'type':'object','required':['version','modes'],
      'properties':{
        'version':{'type':'integer','minimum':1},'generatedAt':{'type':'string'},
        'modes':{'type':'object','required':['greatest'],'additionalProperties':{'$ref':'#/$defs/mode'}},
        'modeFallbacks':{'type':'object','additionalProperties':{'type':'string'}},
        'modeMeta':{'type':'object','additionalProperties':{'type':'object'}},
      },
      '$defs':{
        'mode':{'type':'object','patternProperties':{year_pat:{'type':'array','minItems':1,'items':{'$ref':'#/$defs/song'}}},'additionalProperties':False},
        'song':{'type':'object','required':['title','artist','year'],'properties':{
          'title':{'type':'string','minLength':1},'artist':{'type':'string','minLength':1},
          'year':{'type':'integer','minimum':1950,'maximum':2022,'description':'Canonical earliest game/release year; must match containing year bucket.'},
          'spotifyId':{'type':'string'},'youtubeId':{'type':'string'},'source':{'type':'string'},'sourceLabel':{'type':'string'}},
          'additionalProperties':True}
      }
    }
    SCHEMA.write_text(json.dumps(schema,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


def write_engine_guard():
    metas=json.dumps(MODE_META,ensure_ascii=False,separators=(',',':'))
    js=f"""(() => {{
  'use strict';
  const E=window.GSYEngine;
  if(!E)throw new Error('GSYEngine must load before engine-v7.js');
  E.MODES={metas};
  const variant=/\\b(karaoke|tribute|cover|live|remix|mix|acoustic|a cappella|acapella|backing|instrumental|bootleg|mashup|preview|playback|deluxe|radio edit|single edit|single version|album version|music video|video|take \\d+|third recording|special disco version)\\b/i;
  const malformedArtist=/[a-zà-ÿ][A-Z]/;
  function useKey(song){{return E.songKey(song)}}
  function quality(song){{let n=0;if(song.spotifyId)n+=4;if(song.youtubeId)n+=2;if(!variant.test(String(song.title||'')))n+=3;if(!malformedArtist.test(String(song.artist||'')))n+=2;if(Number(song.mbScore||0)>=70)n+=1;return n}}
  function dedupe(pool){{const ranked=[...pool].sort((a,b)=>quality(b)-quality(a));const out=[],songs=new Set(),spotify=new Set(),youtube=new Set();for(const song of ranked){{if(!song||!song.title||!song.artist)continue;const canonical=useKey(song),sp=String(song.spotifyId||''),yt=String(song.youtubeId||'');if(songs.has(canonical)||(sp&&spotify.has(sp))||(yt&&youtube.has(yt)))continue;songs.add(canonical);if(sp)spotify.add(sp);if(yt)youtube.add(yt);out.push(song)}}return out}}
  function cleanPool(pool,year){{pool=dedupe((pool||[]).filter(song=>Number(song?.year)===Number(year)));const clean=pool.filter(song=>!variant.test(String(song.title||''))&&!malformedArtist.test(String(song.artist||'')));return clean.length?clean:pool}}
  E.songUseKey=useKey;
  E.chooseSong=async function(year,modeId='greatest',usedKeys=[]){{
    const id=E.MODES[modeId]?modeId:'greatest',data=await E.loadCatalogue(),used=new Set(usedKeys||[]);
    const primary=cleanPool(data?.modes?.[id]?.[String(year)]||[],year);
    const fallback=id==='greatest'?[]:cleanPool(data?.modes?.greatest?.[String(year)]||[],year);
    let available=primary.filter(song=>!used.has(useKey(song)));
    if(!available.length)available=fallback.filter(song=>!used.has(useKey(song)));
    if(!available.length)throw new E.AppError(primary.length||fallback.length?'NO_UNUSED_SONG':'NO_SONG',primary.length||fallback.length?`Every ${{year}} song available for this playlist has already been used.`:`No prebuilt song is available for ${{year}}.`);
    return {{...available[Math.floor(Math.random()*available.length)]}};
  }};
}})();
"""
    ENGINE_V7.write_text(js,encoding='utf-8')


def patch_app():
    s=APP.read_text(encoding='utf-8')
    old="  const DEFAULT_CFG={playMode:'physical',teams:2,victory:'10'};\n  const MODE='greatest';"
    if old not in s: raise RuntimeError('app.js mode header changed')
    s=s.replace(old,"  const DEFAULT_CFG={playMode:'physical',teams:2,victory:'10',mode:'greatest'};")
    needle="  function providerReady(){return E.getProvider()==='youtube'||E.isSpotifyConnected()}\n"
    helper="  function providerReady(){return E.getProvider()==='youtube'||E.isSpotifyConnected()}\n  function modeId(){return match?.mode||cfg.mode||'greatest'}\n  function modeInfo(id=modeId()){return E.MODES?.[id]||E.MODES?.greatest||{name:'Greatest Hits',desc:''}}\n"
    if needle not in s: raise RuntimeError('providerReady patch point missing')
    s=s.replace(needle,helper)
    s=s.replace("    if(!['10','unlimited'].includes(cfg.victory))cfg.victory='10';\n    delete cfg.deck;", "    if(!['10','unlimited'].includes(cfg.victory))cfg.victory='10';\n    if(!E.MODES?.[cfg.mode])cfg.mode='greatest';\n    delete cfg.deck;")
    s=s.replace('    match.mode=MODE;','    match.mode=E.MODES?.[match.mode]?match.mode:cfg.mode;')
    s=s.replace('<p class="subtitle">Greatest Hits. Pick how you want to play, then start.</p>','<p class="subtitle">${esc(modeInfo(cfg.mode).name)}. Pick how you want to play, then start.</p>')
    setup='''      <div class="setup-grid">\n        <section class="card option-card">\n          <div class="option-head"><h3>1. Play style</h3>'''
    replacement='''      <div class="setup-grid">\n        <section class="card option-card">\n          <div class="option-head"><h3>1. Playlist</h3><span>${esc(modeInfo(cfg.mode).desc)}</span></div>\n          <div class="deck-options">${Object.entries(E.MODES||{}).map(([id,m])=>`<button class="deck-option ${cfg.mode===id?'on':''}" data-mode="${id}"><b>${esc(m.name)}</b><span>${esc(m.desc)}</span></button>`).join('')}</div>\n        </section>\n        <section class="card option-card">\n          <div class="option-head"><h3>2. Play style</h3>'''
    if setup not in s: raise RuntimeError('setup mode patch point missing')
    s=s.replace(setup,replacement)
    s=s.replace('<h3>2. Teams</h3>','<h3>3. Teams</h3>').replace('<h3>3. Victory target</h3>','<h3>4. Victory target</h3>')
    s=s.replace("    root.querySelectorAll('[data-play]').forEach", "    root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{cfg.mode=b.dataset.mode;saveCfg();render()});\n    root.querySelectorAll('[data-play]').forEach")
    s=s.replace(' · Greatest Hits · ',' · ${esc(modeInfo(match.mode).name)} · ')
    s=s.replace('<p>Greatest Hits · ${providerName()}. The answer stays hidden.</p>','<p>${esc(modeInfo().name)} · ${providerName()}. The answer stays hidden.</p>')
    s=s.replace('mode:MODE','mode:cfg.mode',1)
    s=s.replace('E.chooseSong(year,MODE,excluded)','E.chooseSong(year,modeId(),excluded)')
    s=s.replace('mode:MODE','mode:modeId()')
    if 'MODE' in s: raise RuntimeError('hard-coded MODE token remains in app.js')
    APP.write_text(s,encoding='utf-8')


def write_validator():
    code=r'''#!/usr/bin/env python3
import ast,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CATALOGUE=ROOT/'data'/'catalogue.json';ENGINE=ROOT/'engine.js';APP=ROOT/'app.js'
ACTIVE=('greatest','sing_along','australian','unexpected','party','rock')
def fail(m):raise SystemExit('catalogue validation failed: '+m)
def year_map():
 t=ENGINE.read_text();m=re.search(r'const YEAR_MAP=(\[[^;]+\]);',t)
 if not m:fail('YEAR_MAP missing')
 v=ast.literal_eval(re.sub(r'\bnull\b','None',m.group(1)))
 if len(v)!=309:fail(f'YEAR_MAP length {len(v)}')
 return v
def main():
 d=json.loads(CATALOGUE.read_text());modes=d.get('modes',{})
 if set(modes)!=set(ACTIVE):fail(f'active modes mismatch: {sorted(modes)}')
 req=sorted(set(int(y) for y in year_map()[1:] if y));g=modes['greatest']
 for y in req:
  pool=g.get(str(y))
  if not isinstance(pool,list) or len(pool)<8:fail(f'Greatest Hits {y} needs >=8 songs')
 for mid in ACTIVE:
  for y,pool in modes[mid].items():
   if not re.fullmatch(r'(19[5-9][0-9]|20[0-2][0-9])',str(y)):fail(f'{mid} bad bucket {y}')
   seen=set()
   for i,s in enumerate(pool):
    if not s.get('title') or not s.get('artist'):fail(f'{mid}/{y}/{i} missing title/artist')
    if int(s.get('year') or 0)!=int(y):fail(f'{mid}/{y}/{i} year mismatch')
    k=(s['title'].lower(),s['artist'].lower())
    if k in seen:fail(f'{mid}/{y} duplicate {k}')
    seen.add(k)
 for mid in ACTIVE[1:]:
  if d.get('modeFallbacks',{}).get(mid)!='greatest':fail(f'{mid} fallback must be greatest')
  if len(modes[mid])<15:fail(f'{mid} coverage only {len(modes[mid])} years')
 app=APP.read_text()
 for token in ("data-mode=",'function modeId()',"mode:'greatest'"):
  if token not in app:fail(f'app mode token missing: {token}')
 if "const MODE='greatest'" in app:fail('app still hard-codes Greatest Hits')
 print('Catalogue validated:',{m:len(modes[m]) for m in ACTIVE})
if __name__=='__main__':main()
'''
    VALIDATOR.write_text(code,encoding='utf-8')


def write_engine_test():
    test=r'''import fs from 'node:fs';import assert from 'node:assert/strict';
class AppError extends Error{constructor(code,message){super(message);this.code=code}}
const data={modes:{greatest:{'2000':[{title:'Fallback',artist:'Artist',year:2000}], '2001':[{title:'Fallback 2',artist:'Artist',year:2001}]},sing_along:{'2000':[{title:'Sing',artist:'Artist',year:2000}]}}};
global.window={GSYEngine:{MODES:{greatest:{name:'Greatest Hits'}},AppError,songKey:s=>`${s.title}|${s.artist}`,loadCatalogue:async()=>data}};
eval(fs.readFileSync(new URL('../engine-v7.js',import.meta.url),'utf8'));
const E=window.GSYEngine;assert.equal(Object.keys(E.MODES).length,6);assert.equal((await E.chooseSong(2000,'sing_along',[])).title,'Sing');assert.equal((await E.chooseSong(2001,'sing_along',[])).title,'Fallback 2');
await assert.rejects(()=>E.chooseSong(2000,'sing_along',['Sing|Artist','Fallback|Artist']),e=>e.code==='NO_UNUSED_SONG');
console.log('engine themed-mode tests passed');
'''
    ENGINE_TEST.write_text(test,encoding='utf-8')


def patch_versions_and_readme():
    e=ENGINE.read_text(encoding='utf-8');e=re.sub(r'\./data/catalogue\.json\?v=\d+','./data/catalogue.json?v=10',e);ENGINE.write_text(e,encoding='utf-8')
    h=INDEX.read_text(encoding='utf-8')
    for asset in ('app.css','engine.js','engine-v7.js','app.js'):
        h=re.sub(rf'{re.escape(asset)}\?v=[^"\']+',f'{asset}?v=8.0.0',h)
    INDEX.write_text(h,encoding='utf-8')
    r=README.read_text(encoding='utf-8')
    r=r.replace('- One active music mode: **Greatest Hits**','- Six music playlists: **Greatest Hits, Sing Along, Australian, Unexpected Years, Party Anthems, and Rock Classics**')
    r=r.replace('Additional catalogues and custom playlists are deferred until this core mode is reliable.','Themed playlists use curated canonical-release-year songs and fall back to Greatest Hits only when a card year has no curated song in that theme.')
    r=r.replace('`engine-v7.js` — v7 runtime guard: exposes Greatest Hits only and filters obvious duplicate/variant catalogue records','`engine-v7.js` — runtime mode guard: exposes the six supported playlists, enforces year buckets, fallback and no-repeat behaviour')
    r=r.replace('For every played card, the selected song must come from the prebuilt Greatest Hits bucket for that card year. Runtime mode fallback is not permitted in v7.','For every played card, the selected song year must equal the card year. Themed modes use their curated bucket first and may explicitly fall back to the canonical Greatest Hits bucket for that same year.')
    README.write_text(r,encoding='utf-8')


def augment_catalogue(path):
    path=Path(path);data=json.loads(path.read_text(encoding='utf-8'));greatest=data['modes']['greatest']
    themed=build_themed_modes(greatest)
    data['version']=10
    data['modes']={'greatest':greatest,**themed}
    data['modeMeta']=MODE_META
    data['modeFallbacks']={m:'greatest' for m in themed}
    data['coverage']={m:len(v) for m,v in data['modes'].items()}
    sources=dict(data.get('sources') or {})
    for m in themed:sources[m]='Curated title/artist seeds assigned to canonical earliest release year using canonical Greatest Hits evidence or MusicBrainz recording first-release-date; sparse years fall back to Greatest Hits.'
    data['sources']=sources
    data['playlistStats']={m:{'years':len(v),'songs':sum(len(x) for x in v.values())} for m,v in themed.items()}
    path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    write_schema();write_engine_guard();patch_app();write_validator();write_engine_test();patch_versions_and_readme()
    print('Themed playlist stats',data['playlistStats'],flush=True)


if __name__=='__main__':augment_catalogue(ROOT/'data'/'catalogue.json')
