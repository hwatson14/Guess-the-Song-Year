import fs from 'node:fs';

const file='scripts/harden_provider_links.py';
const write=process.argv.includes('--write');
let text=fs.readFileSync(file,'utf8');
const from=`    for song in db.get("songs", {}).values():\n        recording_id, claim_url = recording_claim(song)\n        if recording_id:\n            targets.append((song, recording_id, claim_url))`;
const to=`    for song in db.get("songs", {}).values():\n        recording_id, claim_url = recording_claim(song)\n        # The durable recording ledger is the checkpoint: normal runs only research\n        # recording IDs not already classified. --refresh explicitly rechecks all.\n        if recording_id and (args.refresh or recording_id not in prior["records"]):\n            targets.append((song, recording_id, claim_url))`;
if(!text.includes(to)){
  if(!text.includes(from))throw new Error('Provider incremental migration anchor not found');
  text=text.replace(from,to);
  if(write)fs.writeFileSync(file,text);
}
console.log(JSON.stringify({write,patched:true}));
