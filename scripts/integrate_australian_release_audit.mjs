import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const CATALOGUE=path.join(ROOT,'data','catalogue.json');
const WRITE=process.argv.includes('--write');
const RETRIEVED='2026-08-14';

const RULES=[
  {titles:['Paperback Writer'],artists:['Bee Gees'],buckets:[1971,1975],year:1970,sourceTitle:'Gibb Songs: 1966',sourceUrl:'https://www.columbia.edu/~brennan/beegees/66.html'},
  {titles:['One Million Years'],artists:['Bee Gees','The Bee Gees'],buckets:[1973,1974],year:1969,artist:'Robin Gibb',sourceTitle:'Gibb Songs: 1969',sourceUrl:'https://www.columbia.edu/~brennan/beegees/69.html',disposition:'substantive_correction'},
  {titles:['Lonely Days'],artists:['Bee Gees'],buckets:[1973,1977],year:1970,sourceTitle:'Lonely Days — Bee Gees | Official Charts',sourceUrl:'https://www.officialcharts.com/songs/bee-gees-lonely-days/'},
  {titles:['Down Under'],artists:['Men at Work'],buckets:[1980,1982],year:1981,sourceTitle:'Business As Usual | Men At Work',sourceUrl:'https://www.menatworkband.com/discography/business-as-usual/',note:'The shared Spotify ID identifies the familiar Business as Usual recording; the 1980 B-side is a distinct earlier arrangement.'},
  {titles:['Dig It Up'],artists:['Hoodoo Gurus'],buckets:[1983,1984],year:1984,sourceTitle:'Albums — Hoodoo Gurus: Stoneage Romeos',sourceUrl:'https://www.hoodoogurus.net/albums/'},
  {titles:["The Machine’s Breaking Down"],artists:['Tina Arena'],buckets:[1990,1991],year:1990,sourceTitle:'NFSA Australian Vinyl Record Catalogue, Part 1',sourceUrl:'https://www.nfsa.gov.au/sites/default/files/2023-04/Australian%20Vinyl%20Record%20Catalogue_Part1_0-F.pdf'},
  {titles:['Word Is Out'],artists:['Kylie Minogue'],buckets:[1991,1992],year:1991,sourceTitle:'Word Is Out — Kylie Minogue | Official Charts',sourceUrl:'https://www.officialcharts.com/songs/kylie-minogue-word-is-out/'},
  {titles:['Love Is the Answer'],artists:['Tina Arena'],buckets:[1994,1995],year:1994,sourceTitle:'Love Is the Answer — Tina Arena | Apple Music',sourceUrl:'https://music.apple.com/us/song/305722901'},
  {titles:['Torn (extended version)','Torn'],artists:['Natalie Imbruglia'],buckets:[1997,1999],year:1997,title:'Torn',sourceTitle:'Release: Torn by Natalie Imbruglia | MusicBrainz',sourceUrl:'https://musicbrainz.org/release/57f6a5f8-c5c2-4809-9624-e67a77d6d91f',disposition:'normalized_equivalent',note:'The extended version is a mix of the same underlying Natalie Imbruglia recording.'},
  {titles:['Smoke'],artists:['Natalie Imbruglia'],buckets:[1998,1999],year:1997,sourceTitle:'Release group: Left of the Middle by Natalie Imbruglia | MusicBrainz',sourceUrl:'https://musicbrainz.org/release-group/ab544eef-d8ec-3b60-b90e-e358d9f771a4',note:'The recording first appeared on Left of the Middle in 1997; the single followed in 1998.'},
  {titles:['The Sentinel'],artists:['Hilltop Hoods'],buckets:[2002,2005],year:2002,sourceTitle:'Culture of Kings Vol 2 — track listing',sourceUrl:'https://www.albumoftheyear.org/album/1418140-various-artists-culture-of-kings-vol-2.php'},
  {titles:['The Calling'],artists:['Hilltop Hoods'],buckets:[2003,2007],year:2003,sourceTitle:'The Calling | Hilltop Hoods official discography',sourceUrl:'https://hilltophoods.com/discography/the-calling/'},
  {titles:['Dumb Enough'],artists:['Hilltop Hoods'],buckets:[2004,2006],year:2003,sourceTitle:'The Calling | Hilltop Hoods official discography',sourceUrl:'https://hilltophoods.com/discography/the-calling/'},
  {titles:['Out of My Limit'],artists:['5 Seconds of Summer'],buckets:[2012,2014],year:2012,sourceTitle:'5 Seconds of Summer — Out of My Limit (Official Video)',sourceUrl:'https://www.youtube.com/watch?v=N0V8BflCpvU'},
  {titles:['Beside You'],artists:['5 Seconds of Summer'],buckets:[2012,2013],year:2012,ambiguous:true,sourceTitle:'Beside You — Somewhere New EP | Apple Music',sourceUrl:'https://music.apple.com/us/song/1440876276',note:'Playback has no recording ID. Known masters are the 2012 Somewhere New EP original and the 2014 album re-recording; 2013 is valid for neither.'},
  {titles:['Wherever You Are'],artists:['5 Seconds of Summer'],buckets:[2013,2016],year:2013,sourceTitle:'5 Seconds of Summer — Wherever You Are',sourceUrl:'https://www.youtube.com/watch?v=2GRtFC8nTag'},
  {titles:['Rager teenager!'],artists:['Troye Sivan'],buckets:[2020,2022],year:2020,sourceTitle:'Rager teenager! — Troye Sivan | Universal Music',sourceUrl:'https://www.universalmusic.it/popular-music/album/rager-teenager-_34116036431/'},
  {titles:['Easy'],artists:['Troye Sivan'],buckets:[2020,2022],year:2020,sourceTitle:'Troye Sivan announces In a Dream EP; new single Easy out now | Universal Music Canada',sourceUrl:'https://www.universalmusic.ca/2020/07/15/troye-sivans-new-ep-in-a-dream-set-for-august-21-release/'}
];

function norm(value){
  return String(value||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}

function provider(url){
  return new URL(url).hostname.replace(/^www\./,'');
}

function score(song,year,targetYear){
  return (song.spotifyId?4:0)+(song.youtubeId?2:0)+(year===targetYear?1:0);
}

function audit(data){
  const mode=data?.modes?.australian;
  if(!mode)throw new Error('Australian mode is missing');
  const changes=[];

  for(const rule of RULES){
    const titleKeys=new Set(rule.titles.map(norm));
    const artistKeys=new Set(rule.artists.map(norm));
    const matches=[];
    for(const [bucket,pool] of Object.entries(mode)){
      for(const song of pool){
        if(titleKeys.has(norm(song.title))&&artistKeys.has(norm(song.artist)))matches.push({bucket:Number(bucket),song});
      }
    }
    const foundBuckets=matches.map(row=>row.bucket).sort((a,b)=>a-b);
    const expected=[...rule.buckets].sort((a,b)=>a-b);
    if(matches.length!==2||JSON.stringify(foundBuckets)!==JSON.stringify(expected)){
      throw new Error(`${rule.titles[0]} expected buckets ${expected}, found ${foundBuckets}`);
    }

    const selected=[...matches].sort((a,b)=>score(b.song,b.bucket,rule.year)-score(a.song,a.bucket,rule.year))[0];
    const merged={...selected.song};
    for(const field of ['spotifyId','youtubeId']){
      const value=matches.map(row=>row.song[field]).find(Boolean);
      if(value)merged[field]=value;
      else delete merged[field];
    }
    for(const field of ['mbScore','titleSimilarity','artistSimilarity','musicbrainzId','musicbrainzMatchedTitle','musicbrainzMatchedArtist','yearEvidence','playbackEvidenceState','playbackIssue'])delete merged[field];

    merged.title=rule.title||selected.song.title;
    merged.artist=rule.artist||selected.song.artist.replace(/^The Bee Gees$/,'Bee Gees');
    merged.year=rule.year;
    merged.canonicalKey=`${norm(merged.title)}|${norm(merged.artist)}`;
    merged.source='australian-release-audit';
    merged.sourceLabel=rule.ambiguous?'Australian release audit · recording master unresolved':'Australian release audit · first release verified';
    merged.evidenceState=rule.ambiguous?'ambiguous':'externally_observed';
    merged.evidenceDisposition=rule.disposition||'exact';
    merged.sourceProvider=provider(rule.sourceUrl);
    merged.sourceUrl=rule.sourceUrl;
    merged.sourceTitle=rule.sourceTitle;
    merged.sourceArtist=merged.artist;
    merged.sourceRetrievalDate=RETRIEVED;
    merged.releaseYearEvidence=rule.ambiguous?rule.note:'First-release year supported by the cited external source.';
    merged.releaseDateEvidence=rule.ambiguous?'2012 original / 2014 re-recording':String(rule.year);
    if(rule.note)merged.releaseYearResolutionNote=rule.note;
    if(rule.ambiguous)delete merged.releaseYear;
    else merged.releaseYear=rule.year;

    for(const {bucket,song} of matches){
      mode[String(bucket)]=mode[String(bucket)].filter(item=>item!==song);
      if(!mode[String(bucket)].length)delete mode[String(bucket)];
    }
    (mode[String(rule.year)]||=[]).push(merged);
    mode[String(rule.year)].sort((a,b)=>a.title.localeCompare(b.title)||a.artist.localeCompare(b.artist));
    changes.push({title:merged.title,from:foundBuckets,to:rule.year,status:rule.ambiguous?'ambiguous':'verified'});
  }

  const covered=Object.keys(mode).map(Number).sort((a,b)=>a-b);
  data.coverage||={};
  data.missing||={};
  data.coverage.australian=covered.length;
  data.missing.australian=(data.years||[]).filter(year=>!covered.includes(year));
  if(WRITE){
    data.version=Number(data.version||0)+1;
    data.generatedAt=new Date().toISOString();
  }
  return {write:WRITE,changes,songs:Object.values(mode).reduce((sum,pool)=>sum+pool.length,0),coverage:covered.length,missingYears:data.missing.australian};
}

const data=JSON.parse(fs.readFileSync(CATALOGUE,'utf8'));
const report=audit(data);
if(WRITE)fs.writeFileSync(CATALOGUE,`${JSON.stringify(data)}\n`,'utf8');
console.log(JSON.stringify(report,null,2));
