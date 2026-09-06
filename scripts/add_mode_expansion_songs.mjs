import fs from 'node:fs';
import {createHash} from 'node:crypto';

const dbPath='data/song-database.json';
const overlayPath='data/mode-expansion.json';
const db=JSON.parse(fs.readFileSync(dbPath,'utf8'));
const overlay=JSON.parse(fs.readFileSync(overlayPath,'utf8'));

const norm=value=>String(value??'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const canonicalKey=(title,artist)=>`${norm(title)}|${norm(String(artist).split(/feat\.|ft\.|featuring|&|,| and /i)[0]).replace(/^the\s+/,'')}`;
const songId=key=>'song_'+createHash('sha256').update(key).digest('hex').slice(0,20);
const checkedAt='2026-09-06T00:00:00Z';

const specs=[
  ['Mrs. Robinson','Simon & Garfunkel',1968,'unexpected','https://en.wikipedia.org/wiki/Mrs._Robinson','Full single released in 1968; The Graduate premiered in 1967.'],
  ['Ghostbusters','Ray Parker Jr.',1984,'greatest','https://en.wikipedia.org/wiki/Ghostbusters_(song)','Title song released in 1984.'],
  ["Don't You (Forget About Me)",'Simple Minds',1985,'greatest','https://en.wikipedia.org/wiki/Don%27t_You_(Forget_About_Me)','Single released in 1985.'],
  ['Unchained Melody','The Righteous Brothers',1965,'unexpected','https://en.wikipedia.org/wiki/Unchained_Melody','Righteous Brothers recording released in 1965; later featured in Ghost (1990).'],
  ['Misirlou','Dick Dale',1962,'unexpected','https://en.wikipedia.org/wiki/Misirlou','Dick Dale surf-rock recording released in 1962; later featured in Pulp Fiction (1994).'],
  ['All Star','Smash Mouth',1999,'unexpected','https://en.wikipedia.org/wiki/All_Star_(song)','Single released in 1999; later strongly associated with Shrek (2001).'],
  ['Hooked on a Feeling','Blue Swede',1973,'unexpected','https://en.wikipedia.org/wiki/Hooked_on_a_Feeling','Blue Swede recording first released in Sweden in 1973; later featured in Guardians of the Galaxy (2014).'],
  ['No Time to Die','Billie Eilish',2020,'unexpected','https://en.wikipedia.org/wiki/No_Time_to_Die_(song)','Theme song released in 2020 before the film release in 2021.'],
  ['Suicide Is Painless','Johnny Mandel',1970,'unexpected','https://en.wikipedia.org/wiki/Suicide_Is_Painless','M*A*S*H theme composition/recording released with the 1970 film before the TV series premiered in 1972.'],
  ["I'll Be There for You",'The Rembrandts',1995,'unexpected','https://en.wikipedia.org/wiki/I%27ll_Be_There_for_You_(The_Rembrandts_song)','Full single released in 1995 after Friends premiered in 1994.'],
  ["I Don't Want to Wait",'Paula Cole',1997,'unexpected','https://en.wikipedia.org/wiki/I_Don%27t_Want_to_Wait','Single released in 1997 before Dawson\'s Creek premiered in 1998.'],
  ['California','Phantom Planet',2002,'unexpected','https://en.wikipedia.org/wiki/California_(Phantom_Planet_song)','Single released in 2002 before The O.C. premiered in 2003.'],
  ['Cold Little Heart','Michael Kiwanuka',2016,'unexpected','https://en.wikipedia.org/wiki/Love_%26_Hate_(Michael_Kiwanuka_album)','Recording first released on Love & Hate in 2016 before Big Little Lies premiered in 2017.'],
  ['Enemy','Imagine Dragons & JID',2021,'greatest','https://en.wikipedia.org/wiki/Enemy_(Imagine_Dragons_and_JID_song)','Single released in 2021 as the Arcane theme.'],
  ['Missing','Everything But The Girl',1994,'unexpected','https://en.wikipedia.org/wiki/Missing_(Everything_but_the_Girl_song)','Original single released in 1994 before the Todd Terry remix became the hit version.'],
  ['Heads Will Roll','Yeah Yeah Yeahs',2009,'unexpected','https://en.wikipedia.org/wiki/Heads_Will_Roll_(song)','Original single released in 2009 before the A-Trak remix became a long-lived club version.'],
  ['Prayer in C','Lilly Wood and The Prick',2010,'unexpected','https://en.wikipedia.org/wiki/Prayer_in_C','Original recording released in 2010 before the Robin Schulz remix.'],
  ['Summertime Sadness','Lana Del Rey',2012,'unexpected','https://en.wikipedia.org/wiki/Summertime_Sadness','Original recording released in 2012 before the Cedric Gervais remix.'],
  ['I Took a Pill in Ibiza','Mike Posner',2015,'unexpected','https://en.wikipedia.org/wiki/I_Took_a_Pill_in_Ibiza','Original version released in 2015 before the Seeb remix.'],
];

for(const [title,artist,year,mode,sourceUrl,evidence] of specs){
  const key=canonicalKey(title,artist),id=songId(key);
  const existing=Object.values(db.songs).find(song=>song.canonicalKey===key||song.id===id);
  const useId=existing?.id||id;
  if(!existing){
    db.songs[useId]={
      id:useId,canonicalKey:key,title,artist,
      release:{answerYear:year,year,state:'externally_observed',claims:[{year,state:'externally_observed',sourceUrl,evidence,checkedAt}]},
      providers:{spotify:{preferredId:null,links:[]},youtube:{preferredId:null,links:[]}}
    };
  }else{
    if(Number(existing.release?.answerYear)!==year)throw new Error(`Existing release year conflict for ${title}`);
  }
  if(!db.memberships.some(m=>m.songId===useId&&m.mode===mode&&Number(m.year)===year)){
    db.memberships.push({
      songId:useId,mode,year,
      metadata:{source:'mode-expansion-canonical-addition',sourceLabel:evidence,sourceUrl,releaseYearEvidence:evidence,evidenceState:'externally_observed'},
      fieldOrder:['title','artist','year','songId','canonicalKey','source','sourceLabel','sourceUrl','releaseYearEvidence','evidenceState']
    });
  }
}

const keepMovies=new Set([
  'movie:the-graduate:1967:mrs-robinson','movie:saturday-night-fever:1977:stayin-alive','movie:rocky-iii:1982:eye-of-the-tiger',
  'movie:ghostbusters:1984:ghostbusters','movie:the-breakfast-club:1985:dont-you-forget-about-me','movie:ghost:1990:unchained-melody',
  'movie:the-bodyguard:1992:i-will-always-love-you','movie:pulp-fiction:1994:misirlou','movie:titanic:1997:my-heart-will-go-on',
  'movie:shrek:2001:all-star','movie:8-mile:2002:lose-yourself','movie:skyfall:2012:skyfall',
  'movie:guardians-of-the-galaxy:2014:hooked-on-a-feeling','movie:no-time-to-die:2021:no-time-to-die'
]);
const keepTv=new Set([
  'tv:mash:1972:suicide-is-painless','tv:friends:1994:ill-be-there-for-you','tv:dawsons-creek:1998:i-dont-want-to-wait',
  'tv:the-oc:2003:california','tv:house:2004:teardrop','tv:big-little-lies:2017:cold-little-heart','tv:arcane:2021:enemy'
]);
overlay.screenRelationships.movie_themes=(overlay.screenRelationships.movie_themes||[]).filter(row=>keepMovies.has(row.relationshipId));
overlay.screenRelationships.tv_themes=(overlay.screenRelationships.tv_themes||[]).filter(row=>keepTv.has(row.relationshipId));

fs.writeFileSync(dbPath,JSON.stringify(db,null,2)+'\n');
fs.writeFileSync(overlayPath,JSON.stringify(overlay,null,2)+'\n');
console.log(JSON.stringify({addedOrTagged:specs.length,movies:overlay.screenRelationships.movie_themes.length,tv:overlay.screenRelationships.tv_themes.length,remixes:overlay.remixRelationships.length}));
