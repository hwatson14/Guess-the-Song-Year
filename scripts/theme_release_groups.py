#!/usr/bin/env python3
"""Conservative year verifier for curated themed playlists.

MusicBrainz recording search can surface later re-recordings and compilation-only
recording entities ahead of the original. For themed playlists we therefore use
release groups as the answer-year evidence and reject uncertainty rather than guess:

1. title must match the seed's underlying title exactly after punctuation/version cleanup;
2. lead artist must match strongly;
3. alternate/live/remix/compilation release groups are rejected;
4. the earliest remaining release-group first-release-date is the game year;
5. if no strict release group exists, the seed is omitted and same-year Greatest Hits
   fallback handles that card year at runtime.
"""
import re
import time

import build_catalogue_v10 as canonical
from build_modes import MODE_META, SEEDS

MB_RELEASE_GROUP='https://musicbrainz.org/ws/2/release-group/'
_last_rg=0.0
_cache={}
BAD_SECONDARY={'compilation','remix','live','dj-mix','mixtape/street','demo','broadcast'}


def rg_artist(entity):
    return ''.join(
        x if isinstance(x,str) else x.get('name') or (x.get('artist') or {}).get('name') or ''
        for x in entity.get('artist-credit',[])
    ).strip()


def artist_score(found,wanted):
    return max(
        canonical.sim(found,wanted),
        canonical.sim(canonical.primary_artist(found),canonical.primary_artist(wanted)),
    )


def search_release_groups(query):
    global _last_rg
    wait=max(0,1.1-(time.time()-_last_rg))
    if wait:time.sleep(wait)
    r=canonical.get(
        MB_RELEASE_GROUP,
        params={'fmt':'json','limit':100,'query':query},
        headers={'Accept':'application/json','User-Agent':canonical.UA},
    )
    _last_rg=time.time()
    return r.json().get('release-groups',[])


def strict_candidates(title,artist,entities):
    wanted_title=canonical.norm(canonical.base_title(title))
    out=[]
    for e in entities:
        et=canonical.clean(e.get('title'));ea=rg_artist(e);date=canonical.clean(e.get('first-release-date'))
        if not re.match(r'^\d{4}',date) or not et or not ea:continue
        if canonical.norm(canonical.base_title(et))!=wanted_title:continue
        if canonical.is_explicit_alternate_title(et):continue
        if artist_score(ea,artist)<0.60:continue
        secondary={str(x).lower() for x in (e.get('secondary-types') or [])}
        if secondary & BAD_SECONDARY:continue
        out.append({
            'year':int(date[:4]),
            'date':date,
            'releaseGroupId':canonical.clean(e.get('id')),
            'matchedTitle':et,
            'matchedArtist':ea,
            'primaryType':canonical.clean(e.get('primary-type')),
            'secondaryTypes':sorted(secondary),
            'score':float(e.get('score') or 0),
            'artistSimilarity':round(artist_score(ea,artist),4),
        })
    return out


def confirm_theme_year(title,artist):
    key=canonical.underlying_key(title,artist)
    if key in _cache:return _cache[key]

    queries=[
        f'releasegroup:"{canonical.lucene(canonical.base_title(title))}" AND artistname:"{canonical.lucene(canonical.primary_artist(artist))}"',
        f'releasegroup:"{canonical.lucene(canonical.base_title(title))}"',
    ]
    found=[];seen=set()
    for query in queries:
        for e in search_release_groups(query):
            rid=canonical.clean(e.get('id'))
            if rid and rid not in seen:
                seen.add(rid);found.append(e)
        candidates=strict_candidates(title,artist,found)
        if candidates:break

    candidates=strict_candidates(title,artist,found)
    if not candidates:
        _cache[key]=None;return None

    # Earliest exact release group wins. Same-date ties prefer Singles, then EPs,
    # then other group types, then the strongest MusicBrainz search score.
    type_rank={'Single':0,'EP':1,'Album':2}
    candidates.sort(key=lambda x:(x['year'],type_rank.get(x['primaryType'],3),-x['score']))
    best=candidates[0]
    if not 1950<=best['year']<=2022:
        _cache[key]=None;return None
    _cache[key]=best
    return best


def build_themed_modes():
    playback_exact,playback_underlying=canonical.bimmuda_lookup()
    modes={};rejected={}
    for mode in ('sing_along','australian','unexpected','party','rock'):
        buckets={};seen=set();misses=[]
        print('Playlist',MODE_META[mode]['name'],flush=True)
        for title,artist in SEEDS[mode]:
            if canonical.is_explicit_alternate_title(title):
                misses.append(f'{title} / {artist} [alternate seed]');continue
            evidence=confirm_theme_year(title,artist)
            if not evidence:
                misses.append(f'{title} / {artist} [no strict original release-group evidence]');continue
            year=int(evidence['year'])
            display_title=canonical.base_title(title);display_artist=canonical.clean(artist)
            key=canonical.underlying_key(display_title,display_artist)
            if key in seen:continue
            seen.add(key)
            ids=playback_exact.get(canonical.song_key(display_title,display_artist)) or playback_underlying.get(key) or {}
            song={
                'title':display_title,'artist':display_artist,'year':year,'canonicalKey':key,
                'yearEvidence':'MusicBrainz release-group earliest first-release-date',
                'musicbrainzReleaseGroupId':evidence['releaseGroupId'],
                'musicbrainzMatchedTitle':evidence['matchedTitle'],
                'musicbrainzMatchedArtist':evidence['matchedArtist'],
                'releaseGroupDate':evidence['date'],
                'releaseGroupPrimaryType':evidence['primaryType'],
                'mbScore':evidence['score'],'artistSimilarity':evidence['artistSimilarity'],
                'source':f'curated-{mode}-strict-release-group-year',
                'sourceLabel':f'{MODE_META[mode]["name"]} · earliest exact release group {year} verified',
                'playlist':mode,'spotifyId':ids.get('spotifyId',''),'youtubeId':ids.get('youtubeId',''),
            }
            buckets.setdefault(str(year),[]).append(song)
        modes[mode]=dict(sorted(buckets.items(),key=lambda x:int(x[0])))
        rejected[mode]=misses
        print(' ',len(buckets),'years',sum(len(v) for v in buckets.values()),'songs;',len(misses),'rejected seeds',flush=True)
    return modes,rejected


if __name__=='__main__':
    modes,rejected=build_themed_modes()
    print({m:{'years':len(v),'songs':sum(map(len,v.values())),'rejected':len(rejected[m])} for m,v in modes.items()})
