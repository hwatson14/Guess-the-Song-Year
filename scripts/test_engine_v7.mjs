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

const unexpectedSong={title:'Preview Song',artist:'Preview Artist',year:2000,canonicalKey:'preview song|preview artist'};
const chartSong={title:'Chart Remix',artist:'Chart Artist',year:2000,chartYear:2000,canonicalKey:'chart remix|chart artist'};
const australianSong={songId:'song_australian_2000',title:'Australian Song',artist:'Australian Artist',year:2000,canonicalKey:'australian song|australian artist'};
const usChartSong={title:'US Chart Song',artist:'US Chart Artist',year:2000,chartYear:2000,canonicalKey:'us chart song|us chart artist'};
globalThis.window={GSYEngine:{
  MODES:{greatest:{name:'Greatest Hits',status:'beta',yearBasis:'release',repeatPolicy:'unique'},australian:{name:'Australian',status:'beta',yearBasis:'release',repeatPolicy:'unique'},unexpected:{name:'Unexpected Years',status:'preview',yearBasis:'release',repeatPolicy:'unique'},number1_us:{name:'#1 US',status:'beta',yearBasis:'chart',repeatPolicy:'fixed'},number1_au:{name:'#1 Australia',status:'beta',yearBasis:'chart',repeatPolicy:'fixed'}},
  AppError,
  songKey,
  baseCardYear:()=>2000,
  loadCatalogue:async()=>({version:6,modes:{greatest:{'2000':songs},australian:{'2000':[australianSong]},unexpected:{'2000':[unexpectedSong]},number1_us:{'2000':[usChartSong]},number1_au:{'2000':[chartSong]}}}),
}};

await import(`${pathToFileURL(path.resolve('engine-v7.js')).href}?test=${Date.now()}`);
const E=globalThis.window.GSYEngine;

const stableIdentity={songId:'song_stable_identity',title:'Stable',artist:'Artist',canonicalKey:'stable before|artist'};
if(E.songUseKey(stableIdentity)!=='song_stable_identity')throw new Error('master songId must be primary runtime identity');
stableIdentity.canonicalKey='stable after|artist';
if(E.songUseKey(stableIdentity)!=='song_stable_identity')throw new Error('editing canonicalKey must not change primary runtime identity');

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

let legacyIdentityBlocked=false;
try{await E.chooseSong(2000,'australian',[australianSong.canonicalKey])}catch(err){legacyIdentityBlocked=err?.code==='NO_UNUSED_SONG'}
if(!legacyIdentityBlocked)throw new Error('pre-migration saved canonicalKey must still block the stable songId song');

const preview=await E.chooseSong(2000,'unexpected',[]);
if(preview.title!==unexpectedSong.title)throw new Error('preview mode must use its direct pool');
let unsupported=false;
try{await E.chooseSong(2001,'unexpected',[])}catch(err){unsupported=err?.code==='MODE_YEAR_UNAVAILABLE'}
if(!unsupported)throw new Error('sparse modes must report unsupported years without silent fallback');
const fixed=await E.chooseSong(2000,'number1_au',[E.songUseKey(chartSong)]);
if(fixed.title!==chartSong.title)throw new Error('fixed chart modes may repeat their one leader for a repeated card year');
const reports=await E.modeReports();
if(new Set(Object.keys(reports)).size!==5||!['greatest','australian','unexpected','number1_us','number1_au'].every(id=>reports[id])){
  throw new Error('all five declared modes must have readiness reports');
}
if(reports.greatest.coverage!==1||reports.unexpected.status!=='preview'||reports.number1_au.yearBasis!=='chart'){
  throw new Error('mode readiness report does not reflect coverage and status');
}
E.MODES.greatest.status='ready';
const downgraded=(await E.modeReports()).greatest;
if(downgraded.status!=='beta'||downgraded.statusLabel!=='Beta'||downgraded.readyEligible!==false){
  throw new Error('failed Ready gates must produce a visible Beta downgrade');
}
E.MODES.greatest.status='beta';
E.MODES.australian.status='building';
if((await E.modeReports()).australian.selectable!==false)throw new Error('Building modes must not be selectable');
let buildingDisabled=false;
try{await E.chooseSong(2000,'australian',[])}catch(err){buildingDisabled=err?.code==='MODE_DISABLED'}
if(!buildingDisabled)throw new Error('Building modes must remain disabled at the engine boundary');
E.MODES.australian.status='beta';
let disabled=false;
try{await E.chooseSong(2000,'not_a_mode',[])}catch(err){disabled=err?.code==='MODE_DISABLED'}
if(!disabled)throw new Error('unknown modes must remain disabled');

console.log('engine-v7 multi-mode status and underlying-song regression tests passed');