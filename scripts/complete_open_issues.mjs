import fs from 'node:fs';
import {createHash} from 'node:crypto';

const dbPath='data/song-database.json';
const modesPath='data/modes.json';
const db=JSON.parse(fs.readFileSync(dbPath,'utf8'));
const modes=JSON.parse(fs.readFileSync(modesPath,'utf8'));
const reviewedAt='2026-09-06T00:00:00Z';

const norm=value=>String(value??'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const primaryArtist=value=>norm(String(value??'').split(/\s+(?:feat\.?|ft\.?|featuring|with|and|&)\s+/i)[0]).replace(/^the\s+/,'');
const keyFor=(title,artist)=>`${norm(title)}|${primaryArtist(artist)}`;
const idFor=key=>'song_'+createHash('sha256').update(key).digest('hex').slice(0,20);
const providerUrl=(provider,id)=>provider==='spotify'?`https://open.spotify.com/track/${id}`:`https://www.youtube.com/watch?v=${id}`;

function findSong(title,artist,aliases=[]){
  const titles=new Set([title,...aliases].map(norm)),a=primaryArtist(artist);
  const matches=Object.values(db.songs).filter(song=>titles.has(norm(song.title))&&primaryArtist(song.artist)===a);
  if(matches.length>1)throw new Error(`Ambiguous canonical song: ${title} / ${artist}`);
  return matches[0]||null;
}

function ensureSong({title,artist,year,sourceUrl,evidence,titleAliases=[]}){
  let song=findSong(title,artist,titleAliases);
  if(song){
    if(Number(song.release?.answerYear)!==Number(year))throw new Error(`Canonical year conflict for ${title}: ${song.release?.answerYear} vs ${year}`);
    return song;
  }
  const key=keyFor(title,artist),id=idFor(key);
  song={
    id,canonicalKey:key,title,artist,
    release:{answerYear:Number(year),year:Number(year),state:'externally_observed',claims:[{year:Number(year),state:'externally_observed',sourceUrl,evidence,checkedAt:reviewedAt}]},
    providers:{spotify:{preferredId:null,links:[]},youtube:{preferredId:null,links:[]}}
  };
  db.songs[id]=song;
  return song;
}

function ensureMembership(membership){
  const exists=db.memberships.some(m=>m.songId===membership.songId&&m.mode===membership.mode&&
    (membership.metadata?.screenWorkId?m.metadata?.screenWorkId===membership.metadata.screenWorkId:true));
  if(!exists)db.memberships.push(membership);
}

function ensureProviderAsset(song,provider,id,title,artist,sourceUrl){
  const bucket=song.providers[provider]??={preferredId:null,links:[]};
  let asset=bucket.links.find(link=>link.id===id);
  if(!asset){
    asset={id,url:providerUrl(provider,id),state:'verified',origin:'mode-expansion-reviewed',evidence:{recordingMatch:true,checkedAt:reviewedAt,sourceUrl,sourceTitle:title,sourceArtist:artist,reviewScope:'membership-explicit-remix'}};
    bucket.links.push(asset);
  }else{
    asset.state='verified';
    asset.evidence={...(asset.evidence||{}),recordingMatch:true,checkedAt:reviewedAt,sourceUrl,sourceTitle:title,sourceArtist:artist,reviewScope:'membership-explicit-remix'};
  }
}

const additions=[
  {title:'Mrs. Robinson',artist:'Simon & Garfunkel',year:1968,sourceUrl:'https://en.wikipedia.org/wiki/Mrs._Robinson',evidence:'The full Simon & Garfunkel single was released in 1968; The Graduate premiered in 1967.'},
  {title:'Ghostbusters',artist:'Ray Parker Jr.',year:1984,sourceUrl:'https://en.wikipedia.org/wiki/Ghostbusters_(song)',evidence:'Ray Parker Jr. title single released in 1984.'},
  {title:"Don't You (Forget About Me)",artist:'Simple Minds',year:1985,sourceUrl:'https://en.wikipedia.org/wiki/Don%27t_You_(Forget_About_Me)',evidence:'Simple Minds single released in 1985.'},
  {title:'Unchained Melody',artist:'The Righteous Brothers',year:1965,sourceUrl:'https://en.wikipedia.org/wiki/Unchained_Melody',evidence:'The Righteous Brothers recording was released in 1965; it was later featured in Ghost.'},
  {title:'Misirlou',artist:'Dick Dale',year:1962,sourceUrl:'https://en.wikipedia.org/wiki/Misirlou',evidence:'Dick Dale surf-rock recording released in 1962; later featured in Pulp Fiction.',titleAliases:['Miserlou']},
  {title:'All Star',artist:'Smash Mouth',year:1999,sourceUrl:'https://en.wikipedia.org/wiki/All_Star_(song)',evidence:'Smash Mouth single released in 1999; later strongly associated with Shrek.'},
  {title:'Hooked on a Feeling',artist:'Blue Swede',year:1973,sourceUrl:'https://en.wikipedia.org/wiki/Hooked_on_a_Feeling',evidence:'Blue Swede recording first released in Sweden in 1973; later featured in Guardians of the Galaxy.'},
  {title:'No Time to Die',artist:'Billie Eilish',year:2020,sourceUrl:'https://en.wikipedia.org/wiki/No_Time_to_Die_(song)',evidence:'Billie Eilish theme song released in 2020 before the film release in 2021.'},
  {title:'Suicide Is Painless',artist:'Johnny Mandel',year:1970,sourceUrl:'https://en.wikipedia.org/wiki/Suicide_Is_Painless',evidence:'M*A*S*H theme composition/recording released with the 1970 film before the TV series premiered in 1972.'},
  {title:"I'll Be There for You",artist:'The Rembrandts',year:1995,sourceUrl:'https://en.wikipedia.org/wiki/I%27ll_Be_There_for_You_(The_Rembrandts_song)',evidence:'Full Rembrandts single released in 1995 after Friends premiered in 1994.'},
  {title:"I Don't Want to Wait",artist:'Paula Cole',year:1997,sourceUrl:'https://en.wikipedia.org/wiki/I_Don%27t_Want_to_Wait',evidence:"Paula Cole single released in 1997 before Dawson's Creek premiered in 1998."},
  {title:'California',artist:'Phantom Planet',year:2002,sourceUrl:'https://en.wikipedia.org/wiki/California_(Phantom_Planet_song)',evidence:'Phantom Planet single released in 2002 before The O.C. premiered in 2003.'},
  {title:'Cold Little Heart',artist:'Michael Kiwanuka',year:2016,sourceUrl:'https://en.wikipedia.org/wiki/Love_%26_Hate_(Michael_Kiwanuka_album)',evidence:'Recording first released on Love & Hate in 2016 before Big Little Lies premiered in 2017.'},
  {title:'Enemy',artist:'Imagine Dragons & JID',year:2021,sourceUrl:'https://en.wikipedia.org/wiki/Enemy_(Imagine_Dragons_and_JID_song)',evidence:'Imagine Dragons and JID single released in 2021 as the Arcane theme.',artistAliases:['Imagine Dragons']},
  {title:'Missing',artist:'Everything But The Girl',year:1994,sourceUrl:'https://en.wikipedia.org/wiki/Missing_(Everything_but_the_Girl_song)',evidence:'Original Everything But The Girl single released in 1994 before the Todd Terry remix became the hit version.'},
  {title:'Prayer in C',artist:'Lilly Wood and The Prick',year:2010,sourceUrl:'https://en.wikipedia.org/wiki/Prayer_in_C',evidence:'Original recording released in 2010 before the Robin Schulz remix.'},
  {title:'Summertime Sadness',artist:'Lana Del Rey',year:2012,sourceUrl:'https://en.wikipedia.org/wiki/Summertime_Sadness',evidence:'Original recording released in 2012 before the Cedric Gervais remix.'},
  {title:'I Took a Pill in Ibiza',artist:'Mike Posner',year:2015,sourceUrl:'https://en.wikipedia.org/wiki/I_Took_a_Pill_in_Ibiza',evidence:'Original version released in 2015 before the Seeb remix.',titleAliases:['I Took A Pill In Ibiza']},
];
for(const spec of additions)ensureSong(spec);

const movie=[
  ['The Graduate',1967,'Mrs. Robinson','Simon & Garfunkel','signature-song','https://en.wikipedia.org/wiki/The_Graduate'],
  ['Saturday Night Fever',1977,"Stayin' Alive",'Bee Gees','signature-song','https://en.wikipedia.org/wiki/Saturday_Night_Fever'],
  ['Rocky III',1982,'Eye of the Tiger','Survivor','signature-song','https://en.wikipedia.org/wiki/Rocky_III'],
  ['Ghostbusters',1984,'Ghostbusters','Ray Parker Jr.','title-song','https://en.wikipedia.org/wiki/Ghostbusters'],
  ['The Breakfast Club',1985,"Don't You (Forget About Me)",'Simple Minds','signature-song','https://en.wikipedia.org/wiki/The_Breakfast_Club'],
  ['Ghost',1990,'Unchained Melody','The Righteous Brothers','signature-song','https://en.wikipedia.org/wiki/Ghost_(1990_film)'],
  ['The Bodyguard',1992,'I Will Always Love You','Whitney Houston','signature-song','https://en.wikipedia.org/wiki/The_Bodyguard_(1992_film)'],
  ['Pulp Fiction',1994,'Misirlou','Dick Dale','signature-song','https://en.wikipedia.org/wiki/Pulp_Fiction'],
  ['Titanic',1997,'My Heart Will Go On','Celine Dion','signature-song','https://en.wikipedia.org/wiki/Titanic_(1997_film)'],
  ['Shrek',2001,'All Star','Smash Mouth','signature-song','https://en.wikipedia.org/wiki/Shrek'],
  ['8 Mile',2002,'Lose Yourself','Eminem','signature-song','https://en.wikipedia.org/wiki/8_Mile_(film)'],
  ['Skyfall',2012,'Skyfall','Adele','title-song','https://en.wikipedia.org/wiki/Skyfall'],
  ['Guardians of the Galaxy',2014,'Hooked on a Feeling','Blue Swede','signature-song','https://en.wikipedia.org/wiki/Guardians_of_the_Galaxy_(film)'],
  ['No Time to Die',2021,'No Time to Die','Billie Eilish','title-song','https://en.wikipedia.org/wiki/No_Time_to_Die'],
];
const tv=[
  ['M*A*S*H',1972,'Suicide Is Painless','Johnny Mandel','main-theme','https://en.wikipedia.org/wiki/M*A*S*H_(TV_series)'],
  ['Friends',1994,"I'll Be There for You",'The Rembrandts','main-theme','https://en.wikipedia.org/wiki/Friends'],
  ["Dawson's Creek",1998,"I Don't Want to Wait",'Paula Cole','main-theme','https://en.wikipedia.org/wiki/Dawson%27s_Creek'],
  ['The O.C.',2003,'California','Phantom Planet','main-theme','https://en.wikipedia.org/wiki/The_O.C.'],
  ['House',2004,'Teardrop','Massive Attack','main-theme','https://en.wikipedia.org/wiki/House_(TV_series)'],
  ['Big Little Lies',2017,'Cold Little Heart','Michael Kiwanuka','main-theme','https://en.wikipedia.org/wiki/Big_Little_Lies_(TV_series)'],
  ['Arcane',2021,'Enemy','Imagine Dragons & JID','main-theme','https://en.wikipedia.org/wiki/Arcane_(TV_series)'],
];
const slug=s=>norm(s).replace(/\s+/g,'-');
for(const [workTitle,workYear,title,artist,themeRole,workEvidenceUrl] of movie){
  const song=findSong(title,artist,title==='Misirlou'?['Miserlou']:[]);if(!song)throw new Error(`Missing movie canonical song ${title}`);
  ensureMembership({songId:song.id,mode:'movie_themes',year:workYear,metadata:{screenWorkId:`movie/${slug(workTitle)}/${workYear}`,workType:'movie',workTitle,workAnswerYear:workYear,themeRole,relationshipState:'reviewed',workEvidenceUrl,workEvidence:`${workTitle} release year reviewed as ${workYear}.`,reviewedAt},fieldOrder:['title','artist','year','songId','canonicalKey','screenWorkId','workType','workTitle','workAnswerYear','themeRole','relationshipState','workEvidenceUrl','workEvidence','reviewedAt']});
}
for(const [workTitle,workYear,title,artist,themeRole,workEvidenceUrl] of tv){
  const song=findSong(title,artist,title==='Enemy'?[]:[]);if(!song)throw new Error(`Missing TV canonical song ${title}`);
  ensureMembership({songId:song.id,mode:'tv_themes',year:workYear,metadata:{screenWorkId:`tv/${slug(workTitle)}/${workYear}`,workType:'tv',workTitle,workAnswerYear:workYear,themeRole,relationshipState:'reviewed',workEvidenceUrl,workEvidence:`${workTitle} Season 1 / series premiere year reviewed as ${workYear}.`,reviewedAt},fieldOrder:['title','artist','year','songId','canonicalKey','screenWorkId','workType','workTitle','workAnswerYear','themeRole','relationshipState','workEvidenceUrl','workEvidence','reviewedAt']});
}

const remix=[
  {title:'Missing',artist:'Everything But The Girl',playedVersion:'Missing - Todd Terry Remix',remixer:'Todd Terry',spotify:'2p9fnViY10hbqxdKbZZvdq',youtube:'IAkY5m00rpY',spotifySource:'https://open.spotify.com/track/2p9fnViY10hbqxdKbZZvdq',youtubeSource:'https://www.youtube.com/watch?v=IAkY5m00rpY'},
  {title:'Prayer in C',artist:'Lilly Wood and The Prick',playedVersion:'Prayer in C - Robin Schulz Remix',remixer:'Robin Schulz',spotify:'3k9FFXVPn3ua8dlpkxlCvZ',youtube:'fiore9Z5iUg',spotifySource:'https://open.spotify.com/track/3k9FFXVPn3ua8dlpkxlCvZ',youtubeSource:'https://www.youtube.com/watch?v=fiore9Z5iUg'},
  {title:'Summertime Sadness',artist:'Lana Del Rey',playedVersion:'Summertime Sadness - Cedric Gervais Remix',remixer:'Cedric Gervais',spotify:'6D5pfooPP6hi99RaXjkDsP',youtube:'akhmS1D2Ce4',spotifySource:'https://open.spotify.com/track/6D5pfooPP6hi99RaXjkDsP',youtubeSource:'https://www.youtube.com/watch?v=akhmS1D2Ce4'},
  {title:'I Took a Pill in Ibiza',artist:'Mike Posner',playedVersion:'I Took A Pill In Ibiza - Seeb Remix',remixer:'Seeb',spotify:'62UAFVREdTssSevwa5jqhF',youtube:'foE1mO2yM04',spotifySource:'https://open.spotify.com/track/62UAFVREdTssSevwa5jqhF',youtubeSource:'https://www.youtube.com/watch?v=foE1mO2yM04'},
];
for(const row of remix){
  const song=findSong(row.title,row.artist,row.title==='I Took a Pill in Ibiza'?['I Took A Pill In Ibiza']:[]);if(!song)throw new Error(`Missing remix canonical song ${row.title}`);
  ensureProviderAsset(song,'spotify',row.spotify,row.playedVersion,row.artist,row.spotifySource);
  ensureProviderAsset(song,'youtube',row.youtube,row.playedVersion,row.artist,row.youtubeSource);
  ensureMembership({songId:song.id,mode:'remix_original_year',year:Number(song.release.answerYear),metadata:{playedVersion:row.playedVersion,remixer:row.remixer,remixReviewState:'reviewed',originalAnswerYear:Number(song.release.answerYear),originalYearEvidenceUrl:song.release.claims?.[0]?.sourceUrl||null,spotifyEvidenceUrl:row.spotifySource,youtubeEvidenceUrl:row.youtubeSource,reviewedAt},providerRefs:{spotify:row.spotify,youtube:row.youtube},fieldOrder:['title','artist','year','songId','canonicalKey','playedVersion','remixer','remixReviewState','originalAnswerYear','originalYearEvidenceUrl','spotifyEvidenceUrl','youtubeEvidenceUrl','reviewedAt','spotifyId','youtubeId']});
}

const oneHits=[
  ['song_0cb5f327cae9eea18bc3','Earth Angel','only top-40 hit for The Penguins; culturally dominant signature song','https://www.midside.com/publications/declercq_2013_one-hit_wonders.pdf'],
  ['song_4783d49ebe9ce32740ce','Sea of Love','Phil Phillips recording is tagged/reviewed as a one-hit wonder performance','https://secondhandsongs.com/performance/4612/all'],
  ['song_c487037af5e8f8f06405','Kung Fu Fighting','Carl Douglas remains broadly identified as a one-hit wonder','https://wnyc.org/story/was-hit-kung-fu-fighting/'],
  ['song_b0e69780e6e9f45aff64','Play That Funky Music','Wild Cherry is broadly remembered as a one-hit wonder around this signature hit','https://www.allmusic.com/album/wild-cherry-mw0000654821'],
  ['song_66d46918f675a9bf6c8a','Whoomp! (There It Is)','Tag Team is explicitly described as a one-hit wonder after follow-ups failed to match the hit','https://en.wikipedia.org/wiki/Whoomp%21_%28There_It_Is%29'],
  ['song_aaefc66af032a876c18b','Who Let the Dogs Out','Baha Men version was a global phenomenon and #1 in Australia; source discusses its one-hit-wonder status','https://www.colorado.edu/asmagazine/2025/08/07/one-hit-wondering-who-let-dogs-out'],
  ['song_e1353bed6ebd2484d3b2','Rude','Billboard Canada explicitly discusses MAGIC! as a one-hit-wonder case; later Hot 100 songs did not approach Rude','https://ca.billboard.com/music/chart-beat/rude-magic'],
];
for(const [songId,title,basis,url] of oneHits){
  const song=db.songs[songId];if(!song)throw new Error(`Missing one-hit master ${songId}`);
  if(song.title!==title)throw new Error(`One-hit identity mismatch ${songId}: ${song.title}`);
  ensureMembership({songId,mode:'one_hit_wonders',year:Number(song.release.answerYear),metadata:{qualificationState:'core',qualificationDisposition:'approved',qualificationBasis:basis,qualificationEvidenceUrl:url,qualificationMarketContext:'broad Australian/international player recognition; disputed and recent seed rows remain quarantined',qualificationReviewedAt:reviewedAt},fieldOrder:['title','artist','year','songId','canonicalKey','qualificationState','qualificationDisposition','qualificationBasis','qualificationEvidenceUrl','qualificationMarketContext','qualificationReviewedAt']});
}

for(const id of ['movie_themes','tv_themes','screen_themes','remix_original_year','one_hit_wonders']){
  Object.assign(modes.modes[id],{status:'preview',statusLabel:'Preview'});
}
modes.modes.movie_themes.statusNote='14 reviewed movie relationships are playable; remaining seed candidates stay in review.';
modes.modes.tv_themes.statusNote='7 reviewed TV relationships are playable; remaining seed candidates stay in review.';
modes.modes.screen_themes.statusNote='Derived automatically from the reviewed Movie Themes and TV Themes relationships.';
modes.modes.remix_original_year.statusNote='4 original songs have explicit reviewed Spotify and YouTube remix recordings; the answer remains the original release year.';
modes.modes.one_hit_wonders.statusNote='7 conservative evidence-backed memberships are playable; disputed, unmatched and recent seed rows remain quarantined.';

fs.writeFileSync(dbPath,JSON.stringify(db,null,2)+'\n');
fs.writeFileSync(modesPath,JSON.stringify(modes,null,2)+'\n');
console.log(JSON.stringify({songs:Object.keys(db.songs).length,memberships:db.memberships.length,movie:movie.length,tv:tv.length,remix:remix.length,oneHits:oneHits.length}));
