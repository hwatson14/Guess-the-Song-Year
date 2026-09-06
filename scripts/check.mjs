import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const cwd=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const checks=[
  ...['engine.js','engine-v7.js','app-policy.js','app.js','setup-playback.js'].map(file=>[process.execPath,'--check',file]),
  ...['test_engine_v7','test_runtime_catalogue','test_runtime_recovery','test_spotify_session','test_engine_playback_lifecycle','test_year_gap_evidence',
    'test_year_range','test_catalogue_identity','test_song_database','test_provider_audit','test_preferred_link_cache','test_reviewed_provider_links','test_catalogue_corrections','test_catalogue_expansion','test_catalogue_cleanup','test_catalogue_bucket_uniqueness',
    'test_same_year_playback_ids','test_greatest_release_provenance','test_australian_release_audit',
    'test_bonus_gameplay','test_physical_ready','test_engine_playback_fixes','test_app_policy','test_card_year_overrides','test_security_contract','test_setup_playback_ui'].map(name=>[process.execPath,`scripts/${name}.mjs`]),
  ...['validate_catalogue','validate_catalogue_schema','test_number1_us_provenance','test_number1_au_provenance',
    'test_verification_contract','audit_catalogue_variants'].map(name=>['python',`scripts/${name}.py`]),
];
for(const [command,...args] of checks){
  const result=spawnSync(command,args,{cwd,stdio:'inherit'});
  if(result.error){console.error(result.error.message);process.exit(1)}
  if(result.status!==0)process.exit(result.status||1);
}
console.log(`All ${checks.length} application and catalogue checks passed.`);
