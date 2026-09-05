import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
const policy=fs.readFileSync('app-policy.js','utf8'), engine=fs.readFileSync('engine-v7.js','utf8');
const app=fs.readFileSync('app.js','utf8').replace('  boot();','  window.__test={selectProvider,resumeMatch,listenAgain,startYouTubeListening,finishYouTubeListening,startSpotifyListening,togglePlay,replay,getState:()=>({screen,current,playing,match})};');
function make({phase='guess',mode='greatest'}={}){
 const song={title:'Example Song',artist:'Example Artist',year:2000,chartYear:2000,youtubeId:'dead-upload',canonicalKey:'example song|example artist'};
 const current={song,cardId:1,year:2000,provider:'youtube',mode,resolved:{videoId:'dead-upload',candidateIds:['dead-upload']}};
 const saved={active:true,mode,phase,current,round:0,turn:0,teams:[{name:'Team 1',score:0,correct:0,wrong:0,timeline:[1990],starterYear:1990}],used:[],history:[],virtualDeck:[1],virtualPos:0};
 const store=new Map([['gsy.config.v7',JSON.stringify({playMode:'virtual',teams:1,victory:'10',mode})],['gsy.match.v7',JSON.stringify(saved)]]),node={innerHTML:'',textContent:'',classList:{add(){},remove(){}},querySelector(){return null},querySelectorAll(){return[]}},calls={resolve:[],play:[],pause:0,destroy:0,spotifyPauses:0}; let provider='youtube';
 class AppError extends Error{constructor(code,message){super(message);this.code=code}}
 const E={AppError,MODES:{greatest:{name:'Greatest Hits',status:'beta',yearBasis:'release',repeatPolicy:'unique'},number1_us:{name:'#1 US',status:'beta',yearBasis:'chart',repeatPolicy:'fixed'}},getProvider:()=>provider,setProvider:p=>{provider=p},isSpotifyConnected:()=>true,getSpotifyDevice:()=>'',spotifyDevices:async()=>[],loadCatalogue:async()=>({modes:{greatest:{2000:[song]},number1_us:{2000:[song]}}}),baseCardYear:()=>2000,resolveSong:async s=>{calls.resolve.push(s);return{videoId:s.youtubeId,candidateIds:[s.youtubeId],uri:'spotify:example'}},pauseYouTube:()=>calls.pause++,destroyYouTube:()=>calls.destroy++,pauseSpotify:async()=>{calls.spotifyPauses++},playYouTube:async(c,r)=>{calls.play.push(r.videoId);throw new AppError('YOUTUBE_PLAY_FAILED','blocked upload')}};
 const ctx=vm.createContext({window:{GSYEngine:E,addEventListener(){},scrollTo(){}},document:{getElementById:id=>['app','toast'].includes(id)?node:null,activeElement:null,querySelectorAll:()=>[],addEventListener(){}},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},navigator:{},requestAnimationFrame(){},setTimeout(){return 1},setInterval(){return 1},clearTimeout(){},clearInterval(){},URL,console});
 vm.runInContext(policy,ctx);vm.runInContext(engine,ctx);vm.runInContext(app,ctx);return{R:ctx.window.__test,E,calls};
}
{const{R,E,calls}=make();await R.selectProvider('spotify');await R.resumeMatch();await R.listenAgain();assert.equal(E.getProvider(),'spotify');assert.equal(R.getState().current.provider,'spotify');assert.equal(calls.resolve.length,1)}
{const{R,E,calls}=make({phase:'ready'});let finishOld;E.playYouTube=async()=>new Promise(resolve=>{finishOld=resolve});const old=R.startYouTubeListening();R.finishYouTubeListening();await R.listenAgain();E.playYouTube=async()=>({started:true,videoId:'new-working-player'});await R.startYouTubeListening();const before=calls.destroy;finishOld({started:false,needsTap:true});await old;assert.equal(calls.destroy,before);assert.equal(R.getState().playing,true)}
{const{R,calls}=make({phase:'ready',mode:'number1_us'});await R.startYouTubeListening();assert.equal(R.getState().screen,'error');assert.equal(R.getState().match.phase,'error');assert.equal(calls.play.length,1)}
for(const operation of ['startSpotifyListening','togglePlay','replay']){
 const {R,E,calls}=make({phase:'ready'});
 await R.selectProvider('spotify');await R.resumeMatch();
 let finishOld;
 E.playSpotify=()=>new Promise(resolve=>{finishOld=resolve});
 const old=R[operation]();
 E.playSpotify=async()=>{};
 await R.startSpotifyListening();
 const pauses=calls.spotifyPauses;
 finishOld();await old;
 assert.equal(calls.spotifyPauses,pauses,operation+': stale request must not pause newer Spotify playback');
 assert.equal(R.getState().playing,true,operation+': newer playback remains active');
 assert.equal(R.getState().screen,'playing');
}
console.log('runtime recovery VM regressions passed: provider reconciliation, failed fixed upload, stale YouTube startup and all three stale Spotify paths');
