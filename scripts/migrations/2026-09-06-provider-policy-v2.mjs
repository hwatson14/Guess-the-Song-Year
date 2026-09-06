import fs from 'node:fs';

const write=process.argv.includes('--write');
function patch(file,from,to,label){
  let text=fs.readFileSync(file,'utf8');
  if(text.includes(to))return false;
  if(!text.includes(from))throw new Error(`${label} migration anchor not found`);
  text=text.replace(from,to);
  if(write)fs.writeFileSync(file,text);
  return true;
}

let changed=false;
const provider='scripts/harden_provider_links.py';
changed=patch(provider,
`BAD_DISAMBIG = re.compile(r"\\b(live|remix|re[- ]?mix|remaster(?:ed)?|demo|karaoke|tribute|cover|acoustic|instrumental|re[- ]?record(?:ed)?|edit|mix)\\b", re.I)`,
`BAD_DISAMBIG = re.compile(r"\\b(live|remix|re[- ]?mix|remaster(?:ed)?|demo|karaoke|tribute|cover|acoustic|instrumental|re[- ]?record(?:ed)?|edit|mix)\\b", re.I)\nSTREAM_RELATIONS = {"free streaming", "streaming"}`,
'provider relationship whitelist')||changed;
changed=patch(provider,
`    for relation in recording.get("relations", []):\n        url = str(relation.get("url", {}).get("resource", ""))`,
`    for relation in recording.get("relations", []):\n        if str(relation.get("type", "")).lower() not in STREAM_RELATIONS:\n            continue\n        url = str(relation.get("url", {}).get("resource", ""))`,
'provider relation filtering')||changed;
changed=patch(provider,
`    checked_at = date.today().isoformat()\n    targets = []`,
`    prior_review = []\n    if QUEUE_PATH.exists() and not args.refresh:\n        prior_queue = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))\n        prior_review = list(prior_queue.get("queue", []))\n    checked_at = date.today().isoformat()\n    targets = []`,
'provider review resume')||changed;
changed=patch(provider,
`    records = prior["records"]\n    review = []`,
`    records = prior["records"]\n    review = list(prior_review)`,
'provider review accumulation')||changed;
changed=patch(provider,
`    ledger = {"generatedAt": checked_at, "policy": POLICY, "records": records}\n    queue = {"generatedAt": checked_at, "policy": POLICY, "counts": stats, "queue": review}`,
`    # Preserve review findings across resumable chunks while replacing duplicate observations.\n    review_by_key = {}\n    for row in review:\n        key = (str(row.get("songId", "")), str(row.get("provider", "")), str(row.get("id") or row.get("recordingId") or ""), str(row.get("reason", "")))\n        review_by_key[key] = row\n    review = [review_by_key[key] for key in sorted(review_by_key)]\n    ledger = {"generatedAt": checked_at, "policy": POLICY, "records": records}\n    queue = {"generatedAt": checked_at, "policy": POLICY, "counts": stats, "queue": review}`,
'provider review dedupe')||changed;

const release='scripts/harden_release_evidence.py';
changed=patch(release,
`DB_PATH = ROOT / "data" / "song-database.json"\nREVIEW_PATH`,
`DB_PATH = ROOT / "data" / "song-database.json"\nMODES_PATH = ROOT / "data" / "modes.json"\nREVIEW_PATH`,
'release manifest path')||changed;
changed=patch(release,
`def apply_confirmation(db, song, result, checked_at):`,
`def apply_confirmation(db, song, result, checked_at, release_modes):`,
'release confirmation signature')||changed;
changed=patch(release,
`        if membership.get("songId") != song["id"] or membership.get("mode") not in {"greatest", "australian", "unexpected"}:`,
`        if membership.get("songId") != song["id"] or membership.get("mode") not in release_modes:`,
'release mode generalisation')||changed;
changed=patch(release,
`    db = json.loads(DB_PATH.read_text(encoding="utf-8"))\n    targets =`,
`    db = json.loads(DB_PATH.read_text(encoding="utf-8"))\n    mode_defs = json.loads(MODES_PATH.read_text(encoding="utf-8")).get("modes", {})\n    release_modes = {mode for mode, info in mode_defs.items() if info.get("yearBasis") == "release" and not info.get("compositeOf")}\n    targets =`,
'release mode discovery')||changed;
changed=patch(release,
`                    apply_confirmation(db, song, result, checked_at)`,
`                    apply_confirmation(db, song, result, checked_at, release_modes)`,
'release confirmation call')||changed;

console.log(JSON.stringify({write,changed}));
