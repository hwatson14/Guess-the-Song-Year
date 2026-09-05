import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const data=JSON.parse(fs.readFileSync(path.join(ROOT,'data','catalogue.json'),'utf8'));
const mode=data.modes.australian;
const norm=value=>String(value||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const expected=[
  ['Paperback Writer','Bee Gees',1970],['One Million Years','Robin Gibb',1969],['Lonely Days','Bee Gees',1970],
  ['Down Under','Men at Work',1981],['Dig It Up','Hoodoo Gurus',1984],["The Machine’s Breaking Down",'Tina Arena',1990],
  ['Word Is Out','Kylie Minogue',1991],['Love Is the Answer','Tina Arena',1994],['Torn','Natalie Imbruglia',1997],
  ['Smoke','Natalie Imbruglia',1997],['The Sentinel','Hilltop Hoods',2002],['The Calling','Hilltop Hoods',2003],
  ['Dumb Enough','Hilltop Hoods',2003],['Out of My Limit','5 Seconds of Summer',2012],
  ['Wherever You Are','5 Seconds of Summer',2013],['Rager teenager!','Troye Sivan',2020],['Easy','Troye Sivan',2020]
];
const all=Object.entries(mode).flatMap(([bucket,pool])=>pool.map(song=>({bucket:Number(bucket),song})));

for(const [title,artist,year] of expected){
  const rows=all.filter(({song})=>norm(song.title)===norm(title)&&norm(song.artist)===norm(artist));
  if(rows.length!==1)throw new Error(`${title} expected once, found ${rows.length}`);
  const row=rows[0];
  if(row.bucket!==year||row.song.year!==year||row.song.releaseYear!==year)throw new Error(`${title} is not verified in ${year}`);
  if(row.song.evidenceState!=='externally_observed'||!String(row.song.sourceUrl||'').startsWith('https://'))throw new Error(`${title} lacks external evidence`);
}

const beside=all.filter(({song})=>norm(song.title)==='beside you'&&norm(song.artist)==='5 seconds of summer');
if(beside.length!==1||beside[0].bucket!==2012||beside[0].song.evidenceState!=='ambiguous'||'releaseYear' in beside[0].song){
  throw new Error('Beside You must remain once in the provisional 2012 bucket with an unresolved recording master');
}
if(data.coverage.australian!==73)throw new Error(`Australian coverage expected 73/73, got ${data.coverage.australian}/73`);
console.log('Australian release audit checks passed (17 verified, 1 recording master unresolved)');
