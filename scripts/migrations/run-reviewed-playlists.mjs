import fs from 'node:fs';
import {applyReviewedPlaylistCorrections} from './2026-11-02-reviewed-playlists.mjs';
import {compileDatabase} from '../song_database.mjs';

const source='data/song-database.json';
const output='data/catalogue.json';
const ledger='verification/playlist-curation-2026-11-02.json';
const archive='verification/playlist-retirements-2026-11-02.json';
const db=JSON.parse(fs.readFileSync(source,'utf8'));
const spec=JSON.parse(fs.readFileSync(ledger,'utf8'));

if(db.catalogue.version===spec.targetCatalogueVersion){
  console.log('Reviewed playlist migration is already applied; no changes.');
  process.exit(0);
}
const result=applyReviewedPlaylistCorrections(db,spec);
const built=compileDatabase(db);
for(const mode of ['greatest','australian']){
  if(built.coverage[mode]!==73)throw new Error(mode+' lost full year coverage');
}
for(const [year,rows] of Object.entries(built.modes.greatest)){
  if(rows.length<12)throw new Error('Greatest Hits '+year+' has fewer than 12 songs');
}
const archiveData={
  schemaVersion:1,reviewDate:spec.reviewDate,
  policy:'Retired entries preserved with original master/membership and source evidence; never reuse these IDs for another recording.',
  entries:result.retired
};
fs.writeFileSync(source,JSON.stringify(db,null,2)+'\n');
fs.writeFileSync(output,JSON.stringify(built)+'\n');
fs.writeFileSync(archive,JSON.stringify(archiveData,null,2)+'\n');
console.log(JSON.stringify({
  songs:Object.keys(db.songs).length,memberships:db.memberships.length,
  greatest:Object.values(built.modes.greatest).flat().length,
  australian:Object.values(built.modes.australian).flat().length,
  corrections:result.corrections.length,retired:result.retired.length,
  additions:result.addedMemberships.length
}));
