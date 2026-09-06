import fs from 'node:fs';
import {songId} from '../song_database.mjs';

const WRITE=process.argv.includes('--write');
const DB_PATH='data/song-database.json';
const ARCHIVE_PATH='verification/song-identity-merge-2026-09-06.json';
const RELEASE_MODES=new Set(['greatest','australian','unexpected']);
const PROVIDERS=['spotify','youtube'];
const TODAY='2026-09-06';

const MERGES=[
  {keep:'song_3e577c1f92cf18db181e',remove:['song_96d7887a27dd86497ac3'],title:'Blue Tango',artist:'Leroy Anderson',canonicalKey:'blue tango|leroy anderson'},
  {keep:'song_0d7a6fa38e57bc3fe13e',remove:['song_bf27dbfb2d5582bc5391'],title:'The Song from Moulin Rouge (Where Is Your Heart)',artist:'Percy Faith and His Orchestra with Felicia Sanders',canonicalKey:'the song from moulin rouge where is your heart|percy faith'},
  {keep:'song_a030dc6616018ab0788f',remove:['song_861cb60c1c56ae2a71b6','song_8c0121f9d8521b0f1cdb'],title:'Cherry Pink and Apple Blossom White',artist:'Pérez Prado',canonicalKey:'cherry pink and apple blossom white|perez prado'},
  {keep:'song_11381b6461d062c383c3',remove:['song_c223ab5e9e385520ad45'],title:"Tossin' and Turnin'",artist:'Bobby Lewis',canonicalKey:'tossin and turnin|bobby lewis'},
  {keep:'song_2e6112af037b8c8c4d94',remove:['song_275b119114c4ec21bdd7'],title:"Surfin' U.S.A.",artist:'The Beach Boys',canonicalKey:'surfin usa|beach boys'},
  {keep:'song_bbc2e0b65be8cb1fcfb3',remove:['song_09f06b915733c92fbb09'],title:'The Battle of the Blue and the Grey',artist:'Bee Gees',canonicalKey:'the battle of the blue and the grey|bee gees',releaseYear:1963,releaseEvidence:{sourceUrl:'https://www.robingibb.com/recordings/the-battle-of-the-blue-and-the-grey',evidence:'Robin Gibb discography: released March 1963.'}},
  {keep:'song_8511fc340a058cf745b9',remove:['song_7825677a785672c119cd'],title:'Tie a Yellow Ribbon Round the Ole Oak Tree',artist:'Tony Orlando & Dawn',canonicalKey:'tie a yellow ribbon round the ole oak tree|tony orlando and dawn'},
  {keep:'song_5d780ddd60d443c3c9be',remove:['song_16b8b3360e376a3392c7'],title:'The Way We Were',artist:'Barbra Streisand',canonicalKey:'the way we were|barbra streisand'},
  {keep:'song_02ef333b4fd2a224b8eb',remove:['song_e460fb216655c321089b'],title:"That's What Friends Are For",artist:'Dionne Warwick with Elton John, Gladys Knight & Stevie Wonder',canonicalKey:'that s what friends are for|dionne warwick'},
  {keep:'song_14036dfe4fe0015c1a60',remove:['song_798f6ce537f0d5ef063a'],title:'I Wanna Sex You Up',artist:'Color Me Badd',canonicalKey:'i wanna sex you up|color me badd'},
  {keep:'song_116456e15d49e88cb6fa',remove:['song_b770e2066084fdc0295a','song_ca8fed89b1a2d1a65793'],title:'Candle in the Wind 1997',artist:'Elton John',canonicalKey:'candle in the wind 1997|elton john',releaseYear:1997,releaseEvidence:{sourceUrl:'https://www.officialcharts.com/songs/elton-john-something-about-the-way-you-lookcandle/',evidence:'Official Charts: the re-written and re-recorded Candle in the Wind 97 was released 13 September 1997.'}},
  {keep:'song_f81b29b0b12df071eccf',remove:['song_e8e62b733b5faf52e71a'],title:'Tik Tok',artist:'Kesha',canonicalKey:'tik tok|kesha',releaseYear:2009},
  {keep:'song_2d856da0aee5c1c8cc40',remove:['song_09c24c50eddd79da4285'],title:'Smooth',artist:'Santana feat. Rob Thomas',canonicalKey:'smooth|santana'},
  {keep:'song_a99e74e4debf210d1a8c',remove:['song_2c4717878b5bd5401715'],title:'Macarena',artist:'Los del Río',canonicalKey:'macarena|los del rio',chartVariant:{mode:'number1_us',year:1996,title:'Macarena (Bayside Boys Remix)',artist:'Los del Rio',label:'Bayside Boys Remix'}},
];

const BAD_PROVIDER_LINKS=[
  {songId:'song_e89a9ff7ef98eb287ff2',provider:'spotify',id:'1ZPlNanZsJSPK5h9YZZFbZ',reason:'This Spotify track is Like a Virgin, not Like a Prayer.'},
  {songId:'song_dd9e904be04f78be21e4',provider:'spotify',id:'6FZDfxM3a3UCqtzo5pxSLZ',reason:'This Spotify track is Halsey – Without Me, not Eminem – Without Me.'},
];

const REPLACEMENTS=[
  {kind:'new',year:1955,title:'Tutti Frutti',artist:'Little Richard',canonicalKey:'tutti frutti|little richard',sourceProvider:'Wikipedia',sourceUrl:'https://en.wikipedia.org/wiki/Tutti_Frutti_(song)',evidence:'Little Richard single released October 1955.'},
  {kind:'existing',songId:'song_4132400b7edfa87362b8',year:1961,sourceProvider:'Wikipedia',sourceUrl:'https://en.wikipedia.org/wiki/I%27m_Gonna_Knock_on_Your_Door',evidence:'Eddie Hodges single released June 1961.'},
  {kind:'new',year:1973,title:"Let's Get It On",artist:'Marvin Gaye',canonicalKey:'let s get it on|marvin gaye',sourceProvider:'Wikipedia',sourceUrl:'https://en.wikipedia.org/wiki/Let%27s_Get_It_On_(song)',evidence:'Marvin Gaye single released June 15, 1973.'},
  {kind:'new',year:1991,title:'Enter Sandman',artist:'Metallica',canonicalKey:'enter sandman|metallica',sourceProvider:'Wikipedia',sourceUrl:'https://en.wikipedia.org/wiki/Enter_Sandman',evidence:'Metallica single released July 29, 1991.'},
  {kind:'new',year:1997,title:'Bitter Sweet Symphony',artist:'The Verve',canonicalKey:'bitter sweet symphony|verve',sourceProvider:'MusicBrainz',sourceUrl:'https://musicbrainz.org/release-group/8912c382-99cd-3175-a259-2382d7b9e261',evidence:'MusicBrainz official release group lists UK releases in June 1997.'},
  {kind:'existing',songId:'song_da856af84fad3929ebee',year:2000,sourceProvider:'Rhino',sourceUrl:'https://www.rhino.com/article/november-2000-daft-punk-release-one-more-time',evidence:'Rhino: Daft Punk released One More Time on November 13, 2000.'},
  {kind:'existing',songId:'song_caf19c65d5dfd12902ed',year:2010,sourceProvider:'Apple Music / Aftermath Records',sourceUrl:'https://music.apple.com/us/song/1440782199',evidence:'Apple Music lists Love the Way You Lie on Recovery on June 21, 2010.'},
];

const clone=value=>value==null?value:structuredClone(value);
const validYear=value=>Number.isInteger(Number(value))&&Number(value)>=1950&&Number(value)<=2022;
const uniqueJson=items=>[...new Map(items.filter(Boolean).map(item=>[JSON.stringify(item),item])).values()];
const stateRank=state=>({verified:4,metadata_checked:3,unverified:2,unavailable:1}[state]||0);

function mergeLink(a,b){
  if(!a)return clone(b);if(!b)return clone(a);
  const out=clone(a);
  for(const [key,value] of Object.entries(b)){
    if(key==='state'){if(stateRank(value)>stateRank(out.state))out.state=value;continue;}
    if(out[key]==null||out[key]===''||(Array.isArray(out[key])&&!out[key].length))out[key]=clone(value);
  }
  return out;
}
function mergeProvider(target,source){
  target.links=Array.isArray(target.links)?target.links:[];source=source||{preferredId:null,links:[]};
  const links=new Map(target.links.map(link=>[link.id,clone(link)]));
  for(const link of source.links||[])links.set(link.id,mergeLink(links.get(link.id),link));
  target.links=[...links.values()];
  const unique=[...new Set([target.preferredId,source.preferredId].filter(Boolean))];
  if(unique.length>1)throw new Error(`Conflicting preferred provider ids: ${unique.join(', ')}`);
  target.preferredId=unique[0]||null;
}
function membershipScore(m){
  const md=m.metadata||{},refs=m.providerRefs||{};let n=0;
  if(md.evidenceState==='externally_observed')n+=100;if(validYear(md.releaseYear))n+=30;if(md.releaseYearEvidence)n+=25;if(md.yearEvidence)n+=20;
  if(refs.spotify)n+=18;if(refs.youtube)n+=9;if(md.sourceUrl)n+=6;if(md.sourceProvider)n+=4;if(md.musicbrainzId)n+=4;n+=Math.min(5,Number(md.mbScore||0)/20);return n;
}
function mergeMembership(winner,loser){
  const out=winner;out.metadata={...(out.metadata||{})};
  const aliases=[...(out.metadata.legacyKeys||[]),...((loser.metadata||{}).legacyKeys||[])];if(aliases.length)out.metadata.legacyKeys=[...new Set(aliases.map(String))];
  out.providerRefs={...(out.providerRefs||{})};for(const provider of PROVIDERS){const current=out.providerRefs[provider],alternate=loser.providerRefs?.[provider];if((current==null||current==='')&&alternate)out.providerRefs[provider]=alternate;}
  if(!Object.keys(out.providerRefs).length)delete out.providerRefs;if(!out.displayOverrides&&loser.displayOverrides)out.displayOverrides=clone(loser.displayOverrides);
  out.fieldOrder=[...new Set([...(out.fieldOrder||[]),...(loser.fieldOrder||[])])];return out;
}
function addAliasesToMemberships(db,id,aliases){
  const values=[...new Set(aliases.map(String).filter(Boolean))];for(const m of db.memberships.filter(row=>row.songId===id)){m.metadata={...(m.metadata||{})};m.metadata.legacyKeys=[...new Set([...(m.metadata.legacyKeys||[]),...values])].filter(key=>key!==id);}
}
function effectiveMembershipKey(db,m){const song=db.songs[m.songId];if(!song)throw new Error(`Dangling membership ${m.songId}`);const year=RELEASE_MODES.has(m.mode)?Number(song.release?.answerYear):Number(m.year);return `${m.mode}/${year}/${m.songId}`;}
function dedupeMemberships(db,archive){
  const groups=new Map();for(const m of db.memberships){const key=effectiveMembershipKey(db,m),list=groups.get(key)||[];list.push(m);groups.set(key,list);}
  const out=[];for(const [key,list] of groups){if(list.length===1){out.push(list[0]);continue;}const ranked=[...list].sort((a,b)=>membershipScore(b)-membershipScore(a));let winner=ranked[0];for(const loser of ranked.slice(1))winner=mergeMembership(winner,loser);archive.droppedMemberships.push({key,kept:clone(winner),dropped:ranked.slice(1).map(clone)});out.push(winner);}db.memberships=out;
}
function applyReleaseEvidence(song,year,sourceUrl,evidence){song.release={...(song.release||{}),answerYear:Number(year),year:Number(year),state:'externally_observed'};song.release.claims=uniqueJson([...(song.release.claims||[]),{year:Number(year),state:'externally_observed',sourceUrl,evidence}]);}
function mergeSongGroup(db,group,archive){
  const keep=db.songs[group.keep];if(!keep)throw new Error(`Missing survivor ${group.keep}`);const existingRemoved=group.remove.filter(id=>db.songs[id]);const allSongs=[keep,...existingRemoved.map(id=>db.songs[id])];const aliases=[];
  for(const song of allSongs)aliases.push(song.id,song.canonicalKey,...(song.legacyKeys||[]));for(const m of db.memberships.filter(row=>[group.keep,...group.remove].includes(row.songId)))aliases.push(...((m.metadata||{}).legacyKeys||[]));
  const priorAnswerYears=[...new Set(allSongs.map(s=>s.release?.answerYear).filter(validYear).map(Number))];const oldKeep={canonicalKey:keep.canonicalKey};
  for(const provider of PROVIDERS){keep.providers[provider]=keep.providers[provider]||{preferredId:null,links:[]};for(const removed of existingRemoved)mergeProvider(keep.providers[provider],removed.providers?.[provider]);}
  keep.release={...(keep.release||{}),claims:uniqueJson(allSongs.flatMap(song=>song.release?.claims||[]))};
  const observed=[...new Set(allSongs.filter(song=>song.release?.state==='externally_observed'&&validYear(song.release?.year)).map(song=>Number(song.release.year)))];
  if(group.releaseYear!=null){keep.release.answerYear=Number(group.releaseYear);if(group.releaseEvidence)applyReleaseEvidence(keep,group.releaseYear,group.releaseEvidence.sourceUrl,group.releaseEvidence.evidence);else if(observed.includes(Number(group.releaseYear))){keep.release.year=Number(group.releaseYear);keep.release.state='externally_observed';}}
  else if(validYear(keep.release.answerYear))keep.release.answerYear=Number(keep.release.answerYear);else if(priorAnswerYears.length===1)keep.release.answerYear=priorAnswerYears[0];else if(priorAnswerYears.length>1)throw new Error(`Conflicting release answer years for merge ${group.keep}: ${priorAnswerYears.join(', ')}`);
  if(group.title)keep.title=group.title;if(group.artist)keep.artist=group.artist;if(group.canonicalKey)keep.canonicalKey=group.canonicalKey;
  for(const m of db.memberships)if(group.remove.includes(m.songId))m.songId=group.keep;addAliasesToMemberships(db,group.keep,[...aliases,oldKeep.canonicalKey].filter(key=>key!==keep.canonicalKey));
  for(const removedId of existingRemoved){archive.mergedSongs.push({survivor:group.keep,removed:removedId,song:clone(db.songs[removedId])});delete db.songs[removedId];}
  if(group.chartVariant){const m=db.memberships.find(row=>row.songId===group.keep&&row.mode===group.chartVariant.mode&&Number(row.year)===Number(group.chartVariant.year));if(!m)throw new Error(`Missing chart variant membership ${group.keep}/${group.chartVariant.mode}/${group.chartVariant.year}`);m.displayOverrides={title:group.chartVariant.title,artist:group.chartVariant.artist};m.metadata={...(m.metadata||{}),recordingVariant:group.chartVariant.label};const ref=m.providerRefs?.spotify;if(ref){const link=keep.providers.spotify.links.find(item=>item.id===ref);if(link)link.recordingVariant=group.chartVariant.label;}}
}
function removeBadProviderLinks(db,archive){
  for(const fix of BAD_PROVIDER_LINKS){const song=db.songs[fix.songId];if(!song)throw new Error(`Missing provider-fix song ${fix.songId}`);const provider=song.providers?.[fix.provider];if(!provider)throw new Error(`Missing provider ${fix.provider} on ${fix.songId}`);const before=provider.links.length;provider.links=provider.links.filter(link=>link.id!==fix.id);if(provider.preferredId===fix.id)provider.preferredId=null;let refsCleared=0;for(const m of db.memberships.filter(row=>row.songId===fix.songId))if(m.providerRefs?.[fix.provider]===fix.id){m.providerRefs[fix.provider]=null;refsCleared++;m.metadata={...(m.metadata||{}),playbackEvidenceState:'needs_reenrichment',playbackIssue:'incorrect_spotify_mapping_removed'};}archive.removedProviderLinks.push({...fix,linksRemoved:before-provider.links.length,refsCleared});}
}
function makeMembership(id,year,source){return {songId:id,mode:'greatest',year:Number(year),metadata:{releaseYear:Number(year),source:'identity-dedupe-depth-replacement',sourceLabel:'Sourced replacement after duplicate merge',evidenceState:'externally_observed',evidenceDisposition:'exact',sourceProvider:source.sourceProvider,sourceUrl:source.sourceUrl,releaseYearEvidence:source.evidence,sourceRetrievalDate:TODAY},fieldOrder:['title','artist','year','releaseYear','source','sourceLabel','evidenceState','evidenceDisposition','sourceProvider','sourceUrl','releaseYearEvidence','sourceRetrievalDate','songId','canonicalKey']};}
function ensureReplacement(db,item,archive){
  let id=item.songId;if(item.kind==='new'){id=songId(item.canonicalKey);if(!db.songs[id]){db.songs[id]={id,canonicalKey:item.canonicalKey,title:item.title,artist:item.artist,release:{answerYear:item.year,year:item.year,state:'externally_observed',claims:[{year:item.year,state:'externally_observed',sourceUrl:item.sourceUrl,evidence:item.evidence}]},providers:{spotify:{preferredId:null,links:[]},youtube:{preferredId:null,links:[]}}};archive.addedSongs.push({songId:id,title:item.title,artist:item.artist,year:item.year});}}
  const song=db.songs[id];if(!song)throw new Error(`Missing replacement master ${id}`);applyReleaseEvidence(song,item.year,item.sourceUrl,item.evidence);const exists=db.memberships.some(m=>m.songId===id&&m.mode==='greatest'&&Number(song.release.answerYear)===Number(item.year));if(!exists){db.memberships.push(makeMembership(id,item.year,item));archive.addedMemberships.push({songId:id,mode:'greatest',year:item.year});}
}
function validatePostMigration(db){
  for(const group of MERGES){if(!db.songs[group.keep])throw new Error(`Survivor disappeared ${group.keep}`);for(const id of group.remove)if(db.songs[id])throw new Error(`Duplicate master remains ${id}`);}for(const fix of BAD_PROVIDER_LINKS)if(db.songs[fix.songId].providers[fix.provider].links.some(link=>link.id===fix.id))throw new Error(`Bad provider link remains ${fix.songId}/${fix.id}`);
  const seen=new Set();for(const m of db.memberships){const key=effectiveMembershipKey(db,m);if(seen.has(key))throw new Error(`Duplicate membership remains ${key}`);seen.add(key);}for(const provider of PROVIDERS){const owners=new Map();for(const song of Object.values(db.songs))for(const link of song.providers?.[provider]?.links||[]){const prior=owners.get(link.id);if(prior&&prior!==song.id)throw new Error(`Provider ${provider} id ${link.id} is owned by both ${prior} and ${song.id}`);owners.set(link.id,song.id);}}
  const counts=new Map();for(const m of db.memberships)if(m.mode==='greatest'){const y=Number(db.songs[m.songId].release.answerYear);counts.set(y,(counts.get(y)||0)+1);}const shallow=[...counts].filter(([,count])=>count<12);if(shallow.length)throw new Error(`Greatest depth fell below 12: ${JSON.stringify(shallow)}`);
}
function main(){
  const db=JSON.parse(fs.readFileSync(DB_PATH,'utf8'));if(db.schemaVersion!==2)throw new Error(`Unsupported schema ${db.schemaVersion}`);const archive={date:TODAY,mergedSongs:[],droppedMemberships:[],removedProviderLinks:[],addedSongs:[],addedMemberships:[]};
  for(const group of MERGES)mergeSongGroup(db,group,archive);removeBadProviderLinks(db,archive);dedupeMemberships(db,archive);for(const item of REPLACEMENTS)ensureReplacement(db,item,archive);dedupeMemberships(db,archive);db.catalogue.version=Number(db.catalogue.version||0)+1;db.catalogue.generatedAt=new Date().toISOString();validatePostMigration(db);
  const result={songs:Object.keys(db.songs).length,memberships:db.memberships.length,catalogueVersion:db.catalogue.version,mergedMasters:archive.mergedSongs.length,droppedMemberships:archive.droppedMemberships.length,removedProviderLinks:archive.removedProviderLinks.length,addedSongs:archive.addedSongs.length,addedMemberships:archive.addedMemberships.length};if(WRITE){fs.writeFileSync(DB_PATH,JSON.stringify(db,null,2)+'\n');fs.writeFileSync(ARCHIVE_PATH,JSON.stringify({...result,...archive},null,2)+'\n');}console.log(JSON.stringify(result,null,2));
}
main();
