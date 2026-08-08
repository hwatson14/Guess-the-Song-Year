import {pathToFileURL} from 'node:url';
import path from 'node:path';

class AppError extends Error {
  constructor(code,message){super(message);this.code=code;}
}

const norm=v=>String(v??'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
const songKey=s=>`${norm(s.title)}|${norm(s.artist)}`;

const songs=[
  {title:'Alpha',artist:'Artist A',year:2000,spotifyId:'sp-a'},
  {title:'Alpha',artist:'Artist A',year:2000,spotifyId:'sp-a-remaster'},
  {title:'Beta',artist:'Artist B',year:2000,spotifyId:'sp-b'},
  {title:'Gamma',artist:'Artist C',year:2000,youtubeId:'yt-c'},
];

globalThis.window={GSYEngine:{
  MODES:{greatest:{name:'Greatest Hits'}},
  AppError,
  songKey,
  loadCatalogue:async()=>({modes:{greatest:{'2000':songs}}}),
}};

await import(`${pathToFileURL(path.resolve('engine-v7.js')).href}?test=${Date.now()}`);
const E=globalThis.window.GSYEngine;

if(E.songUseKey(songs[0])!==songKey(songs[0]))throw new Error('songUseKey must use canonical title + artist identity');

for(let i=0;i<40;i++){
  const picked=await E.chooseSong(2000,'greatest',[songKey(songs[0])]);
  if(songKey(picked)===songKey(songs[0]))throw new Error('used canonical song was selected again');
}

const allUsed=[songKey(songs[0]),songKey(songs[2]),songKey(songs[3])];
let exhausted=false;
try{await E.chooseSong(2000,'greatest',allUsed)}catch(err){exhausted=err?.code==='NO_UNUSED_SONG'}
if(!exhausted)throw new Error('depleted year must throw NO_UNUSED_SONG rather than recycle a song');

let disabled=false;
try{await E.chooseSong(2000,'unexpected',[])}catch(err){disabled=err?.code==='MODE_DISABLED'}
if(!disabled)throw new Error('inactive modes must remain disabled');

console.log('engine-v7 no-repeat regression tests passed');
