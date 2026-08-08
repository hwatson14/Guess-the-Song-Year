import {pathToFileURL} from 'node:url';
import path from 'node:path';

class AppError extends Error {
  constructor(code,message){super(message);this.code=code;}
}

const norm=v=>String(v??'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
const songKey=s=>`${norm(s.title)}|${norm(s.artist)}`;

const songs=[
  {title:'Alpha',artist:'Artist A',year:2000,spotifyId:'sp-a',canonicalKey:'alpha|artist a'},
  {title:'Alpha - 2011 Remaster',artist:'Artist A',year:2000,spotifyId:'sp-a-remaster'},
  {title:'Alpha (Radio Edit)',artist:'Artist A featuring Guest',year:2000,spotifyId:'sp-a-radio'},
  {title:'Beta',artist:'Artist B',year:2000,spotifyId:'sp-b',canonicalKey:'beta|artist b'},
  {title:'Gamma',artist:'Artist C',year:2000,youtubeId:'yt-c',canonicalKey:'gamma|artist c'},
  {title:'Delta (feat. Guest)',artist:'Artist D',year:2000,canonicalKey:'delta|artist d'},
  {title:'Delta',artist:'Artist D and Guest',year:2000},
  {title:'Live and Let Die',artist:'Artist E',year:2000,canonicalKey:'live and let die|artist e'},
];

globalThis.window={GSYEngine:{
  MODES:{greatest:{name:'Greatest Hits'}},
  AppError,
  songKey,
  loadCatalogue:async()=>({modes:{greatest:{'2000':songs}}}),
}};

await import(`${pathToFileURL(path.resolve('engine-v7.js')).href}?test=${Date.now()}`);
const E=globalThis.window.GSYEngine;

const alphaKey=E.songUseKey(songs[0]);
if(alphaKey!=='alpha|artist a')throw new Error(`unexpected Alpha underlying key: ${alphaKey}`);
if(E.songUseKey(songs[1])!==alphaKey)throw new Error('remaster must collapse to original song identity');
if(E.songUseKey(songs[2])!==alphaKey)throw new Error('radio edit / featured version must collapse to original song identity');
if(E.songUseKey(songs[5])!==E.songUseKey(songs[6]))throw new Error('featured-artist title/credit variants must collapse');

for(const title of [
  'Alpha (Live)','Alpha - Radio Edit','Alpha (Pop edit)','Alpha (LP version)',
  'Alpha (Third Recording)','Alpha (master)','Alpha (radio)','Alpha (solo vocal)',
  'Alpha (strumentale)','Alpha (base musicale)','Alpha (rework)','Alpha (ReFix)',
  'Alpha (voice note)','Alpha (alternative version)','Alpha (full version)'
]){
  if(!E.isAlternateSongTitle(title))throw new Error(`alternate-version label not recognised: ${title}`);
}
for(const title of [
  'Live and Let Die','I Want to Live','Radio Ga Ga','Another Brick in the Wall (Part II)',
  'Alone Again (Naturally)','Dancing with a Stranger',"Break Up with Your Girlfriend, I'm Bored",'With or Without You'
]){
  if(E.isAlternateSongTitle(title))throw new Error(`genuine title incorrectly treated as alternate: ${title}`);
}
if(E.songUseKey({title:'Dancing with a Stranger',artist:'Sam Smith'})!=='dancing with a stranger|sam smith'){
  throw new Error('bare "with" inside a genuine title must be preserved in underlying identity');
}
if(E.songUseKey({title:"Break Up with Your Girlfriend, I'm Bored",artist:'Ariana Grande'})!=="break up with your girlfriend i m bored|ariana grande"){
  throw new Error('genuine title text after "with" must not be truncated');
}

for(let i=0;i<40;i++){
  const picked=await E.chooseSong(2000,'greatest',[alphaKey]);
  if(E.songUseKey(picked)===alphaKey)throw new Error('used underlying song was selected again through an alternate version');
}

const allUsed=[alphaKey,E.songUseKey(songs[3]),E.songUseKey(songs[4]),E.songUseKey(songs[5]),E.songUseKey(songs[7])];
let exhausted=false;
try{await E.chooseSong(2000,'greatest',allUsed)}catch(err){exhausted=err?.code==='NO_UNUSED_SONG'}
if(!exhausted)throw new Error('depleted year must throw NO_UNUSED_SONG rather than recycle an alternate version');

let disabled=false;
try{await E.chooseSong(2000,'unexpected',[])}catch(err){disabled=err?.code==='MODE_DISABLED'}
if(!disabled)throw new Error('inactive modes must remain disabled');

console.log('engine-v7 underlying-song / alternate-version regression tests passed');