import importlib.util
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,ROOT/path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

provider=load('provider_hardening','scripts/harden_provider_links.py')
release=load('release_hardening','scripts/harden_release_evidence.py')

recording={
    'id':'11111111-1111-1111-1111-111111111111','title':'Example Song','video':False,'disambiguation':'',
    'first-release-date':'2000-05-01','artist-credit':[{'name':'Example Artist','joinphrase':''}],
    'releases':[{'status':'Official'}],
    'relations':[
        {'type':'free streaming','url':{'resource':'https://open.spotify.com/track/1234567890123456789012'}},
        {'type':'streaming','url':{'resource':'https://www.youtube.com/watch?v=abcdefghijk'}},
        {'type':'purchase for download','url':{'resource':'https://www.youtube.com/watch?v=zzzzzzzzzzz'}},
    ],
}
song={'id':'song_test','title':'Example Song','artist':'Example Artist','release':{'answerYear':2000,'year':None,'state':'unresolved','claims':[]},'providers':{'spotify':{'preferredId':None,'links':[]},'youtube':{'preferredId':None,'links':[]}}}

assert provider.recording_acceptable(song,recording)==(True,None)
wrong=dict(recording,**{'first-release-date':'1999-05-01'})
assert provider.recording_acceptable(song,wrong)[1]=='recording_year_differs'
relations=provider.relation_candidates(recording)
assert {(r['provider'],r['id']) for r in relations}=={('spotify','1234567890123456789012'),('youtube','abcdefghijk')}
assert all(r['relationship'] in {'free streaming','streaming'} for r in relations)

confirmed=release.classify(song,{'fullyPaged':True,'recordings':[recording]})
assert confirmed['status']=='confirmed' and confirmed['earliestYear']==2000
earlier=release.classify(song,{'fullyPaged':True,'recordings':[dict(recording,**{'first-release-date':'1999-05-01'})]})
assert earlier['status']=='review' and earlier['reason']=='earlier_exact_recording'

synthetic={'songs':{'song_test':song},'memberships':[
    {'songId':'song_test','mode':'greatest','metadata':{}},
    {'songId':'song_test','mode':'one_hit_wonders','metadata':{}},
    {'songId':'song_test','mode':'number1_us','metadata':{}},
]}
release.apply_confirmation(synthetic,song,confirmed,'2026-09-06',{'greatest','one_hit_wonders'})
assert song['release']['answerYear']==2000
assert song['release']['state']=='externally_observed' and song['release']['year']==2000
assert synthetic['memberships'][0]['metadata']['evidenceState']=='externally_observed'
assert synthetic['memberships'][1]['metadata']['evidenceState']=='externally_observed'
assert synthetic['memberships'][2]['metadata']=={}

print('evidence/provider hardening policy regressions passed')
