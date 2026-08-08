#!/usr/bin/env python3
"""Build the one-mode prebuilt Greatest Hits catalogue.

Candidate ranking: full Billboard year-end singles tables from the release year
and, when needed, the following two chart years. This catches songs released late
in a calendar year that became major hits the next year.
Canonical song identity: Billboard title + artist.
Year truth: MusicBrainz first-release year from recording and/or release-group search.
A chart candidate is admitted only when a MusicBrainz entity verifies the target release year.
"""
import csv
import io
import json
import re
import time
import unicodedata
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'catalogue.json'
YEARS = list(range(1950, 2023))
TARGET_POOL = 12
MIN_POOL = 8
CHART_LOOKAHEAD = 2
BIMMUDA = 'https://raw.githubusercontent.com/madelinehamilton/BiMMuDa/main/metadata/bimmuda_per_song_metadata.csv'
MB_RECORDING = 'https://musicbrainz.org/ws/2/recording/'
MB_RELEASE_GROUP = 'https://musicbrainz.org/ws/2/release-group/'
WIKI_API = 'https://en.wikipedia.org/w/api.php'
UA = 'Guess-the-Song-Year/2.1 (private-use catalogue builder; https://github.com/hwatson14/Guess-the-Song-Year)'
S = requests.Session()
S.headers.update({'User-Agent': UA})
_last_mb = 0.0
_chart_cache = {}


def clean(v):
    return str(v or '').strip().strip('“”"')


def norm(v):
    return re.sub(r'[^a-z0-9]+', ' ', unicodedata.normalize('NFKD', clean(v)).encode('ascii', 'ignore').decode().lower()).strip()


def toks(v):
    return set(norm(v).split())


def sim(a, b):
    aa, bb = toks(a), toks(b)
    return len(aa & bb) / max(len(aa), len(bb)) if aa and bb else 0


def main_artist(v):
    return re.split(r'feat\.|ft\.|&|,| and | featuring ', clean(v), maxsplit=1, flags=re.I)[0].strip()


def lucene(v):
    return re.sub(r'[+\-!(){}\[\]^"~*?:\\/]', ' ', clean(v)).strip()


def song_key(title, artist):
    return f'{norm(title)}|{norm(artist)}'


def get(url, **kw):
    for i in range(6):
        try:
            r = S.get(url, timeout=45, **kw)
            if r.ok:
                return r
            if r.status_code not in (429, 500, 502, 503, 504):
                r.raise_for_status()
        except requests.RequestException:
            pass
        time.sleep(min(20, 2 * (i + 1)))
    raise RuntimeError('GET failed: ' + url)


def mb(endpoint, query, limit=100):
    global _last_mb
    wait = max(0, 1.1 - (time.time() - _last_mb))
    if wait:
        time.sleep(wait)
    r = get(endpoint, params={'fmt': 'json', 'limit': limit, 'query': query}, headers={'Accept': 'application/json', 'User-Agent': UA})
    _last_mb = time.time()
    return r.json()


def bimmuda_lookup():
    """Only used to attach already-known playback IDs to matching songs."""
    out = {}
    for r in csv.DictReader(io.StringIO(get(BIMMUDA).text)):
        title, artist = clean(r.get('Title')), clean(r.get('Artist'))
        if not title or not artist:
            continue
        link = r.get('Link to Audio') or ''
        sp = re.search(r'open\.spotify\.com/track/([A-Za-z0-9]+)', link)
        yt = re.search(r'[?&]v=([A-Za-z0-9_-]{11})', link)
        out[song_key(title, artist)] = {
            'spotifyId': sp.group(1) if sp else '',
            'youtubeId': yt.group(1) if yt else '',
        }
    return out


def wikipedia_page_title(year):
    if year >= 1960:
        return f'Billboard Year-End Hot 100 singles of {year}'
    q = f'Billboard year-end singles {year}'
    data = get(WIKI_API, params={'action': 'query', 'list': 'search', 'srsearch': q, 'srlimit': 10, 'format': 'json', 'origin': '*'}).json()
    hits = data.get('query', {}).get('search', [])
    ranked = []
    for h in hits:
        title = clean(h.get('title'))
        low = title.lower()
        if str(year) not in title or 'billboard' not in low:
            continue
        bonus = 0
        if 'year-end' in low or 'year end' in low:
            bonus += 3
        if 'single' in low:
            bonus += 2
        if 'top' in low:
            bonus += 1
        ranked.append((bonus, title))
    if not ranked:
        raise RuntimeError(f'No Billboard year-end page found for {year}')
    ranked.sort(reverse=True)
    return ranked[0][1]


def clean_chart_text(v):
    v = clean(v)
    v = re.sub(r'\s*\[[^\]]+\]\s*$', '', v).strip()
    return v


def billboard_year_rows(year):
    if year in _chart_cache:
        return [dict(r) for r in _chart_cache[year]]

    page_title = wikipedia_page_title(year)
    payload = get(WIKI_API, params={'action': 'parse', 'page': page_title, 'prop': 'text', 'format': 'json', 'origin': '*'}).json()
    html = payload.get('parse', {}).get('text', {}).get('*', '')
    if not html:
        raise RuntimeError(f'Wikipedia returned no chart table for {year}: {page_title}')
    soup = BeautifulSoup(html, 'html.parser')
    best = []
    for table in soup.select('table.wikitable'):
        trs = table.find_all('tr')
        if not trs:
            continue
        heads = [clean_chart_text(x.get_text(' ', strip=True)).lower() for x in trs[0].find_all(['th', 'td'])]
        ti = next((i for i, h in enumerate(heads) if h == 'title' or 'title' in h or h == 'single'), None)
        ai = next((i for i, h in enumerate(heads) if 'artist' in h), None)
        ri = next((i for i, h in enumerate(heads) if h in ('no.', 'no', 'rank', 'position') or 'rank' in h), 0)
        if ti is None or ai is None:
            continue
        rows = []
        for tr in trs[1:]:
            cells = [clean_chart_text(x.get_text(' ', strip=True)) for x in tr.find_all(['th', 'td'])]
            if len(cells) <= max(ti, ai, ri):
                continue
            m = re.search(r'\d+', cells[ri])
            if not m:
                continue
            artist = cells[ai].strip()
            # Early charts can list both sides of a hit single as "A / B".
            titles = [x.strip('“”" ') for x in re.split(r'\s+/\s+', cells[ti]) if x.strip('“”" ')]
            for song_title in titles:
                if song_title and artist:
                    rows.append({'rank': int(m.group()), 'title': song_title, 'artist': artist, 'chartYear': year})
        if len(rows) > len(best):
            best = rows
    if len(best) < MIN_POOL:
        raise RuntimeError(f'Only parsed {len(best)} Billboard candidates for {year}: {page_title}')

    deduped, seen = [], set()
    for row in sorted(best, key=lambda x: x['rank']):
        k = song_key(row['title'], row['artist'])
        if k in seen:
            continue
        seen.add(k)
        deduped.append(row)
    _chart_cache[year] = [dict(r) for r in deduped]
    return [dict(r) for r in deduped]


def candidate_chart_rows(release_year):
    """Return recognisable chart candidates while keeping release year hidden/truthful.

    The target year's chart is ranked first. Following-year charts only provide extra
    candidate songs; MusicBrainz must still verify first release in `release_year`.
    """
    rows, seen = [], set()
    last_chart_year = min(YEARS[-1], release_year + CHART_LOOKAHEAD)
    for chart_year in range(release_year, last_chart_year + 1):
        offset = chart_year - release_year
        for row in billboard_year_rows(chart_year):
            k = song_key(row['title'], row['artist'])
            if k in seen:
                continue
            seen.add(k)
            candidate = dict(row)
            candidate['chartOffset'] = offset
            candidate['rankScore'] = offset * 1000 + int(row['rank'])
            rows.append(candidate)
    return sorted(rows, key=lambda r: (r['rankScore'], r['title'].lower(), r['artist'].lower()))


def artist_credit(entity):
    return ''.join(
        x if isinstance(x, str) else x.get('name') or (x.get('artist') or {}).get('name') or ''
        for x in entity.get('artist-credit', [])
    ).strip()


def collect_verified(endpoint, result_key, year, chunk):
    clauses = []
    field = 'recording' if endpoint == MB_RECORDING else 'releasegroup'
    for r in chunk:
        clauses.append(f'({field}:"{lucene(r["title"])}" AND artistname:"{lucene(main_artist(r["artist"]))}")')
    query = f'firstreleasedate:[{year}-01-01 TO {year}-12-31] AND (' + ' OR '.join(clauses) + ')'
    try:
        data = mb(endpoint, query, 100)
    except Exception as e:
        print('MusicBrainz query failed', year, field, e)
        return []
    out = []
    for entity in data.get(result_key, []):
        date = clean(entity.get('first-release-date'))
        if not date.startswith(str(year)):
            continue
        matched_title = clean(entity.get('title'))
        matched_artist = artist_credit(entity)
        if not matched_title or not matched_artist:
            continue
        if re.search(r'karaoke|tribute|demo|live|remix|instrumental|acoustic|backing track', matched_title, re.I):
            continue
        matches = []
        for row in chunk:
            score = sim(matched_title, row['title']) * 2 + sim(matched_artist, row['artist'])
            matches.append((score, row))
        score, row = max(matches, key=lambda x: x[0])
        if score < 1.35:
            continue
        out.append((row, {
            'title': row['title'],
            'artist': row['artist'],
            'year': year,
            'mbScore': float(entity.get('score') or 0),
            'yearEvidence': 'MusicBrainz first-release-date',
            'musicbrainzId': clean(entity.get('id')),
            'musicbrainzMatchedTitle': matched_title,
            'musicbrainzMatchedArtist': matched_artist,
            'chartYear': int(row['chartYear']),
            'chartRank': int(row['rank']),
        }))
    return out


def verified_pool(year, rows, playback):
    found = {}
    for start in range(0, len(rows), 10):
        chunk = rows[start:start + 10]
        results = collect_verified(MB_RECORDING, 'recordings', year, chunk)
        if len(results) < len(chunk):
            results += collect_verified(MB_RELEASE_GROUP, 'release-groups', year, chunk)
        for row, song in results:
            k = song_key(row['title'], row['artist'])
            rank_score = int(row.get('rankScore', row['rank']))
            current = found.get(k)
            if current is None or rank_score < current[0] or (rank_score == current[0] and song.get('mbScore', 0) > current[2].get('mbScore', 0)):
                found[k] = (rank_score, row, song)
        if len(found) >= TARGET_POOL * 2:
            break

    ranked = sorted(found.values(), key=lambda x: (x[0], -x[2].get('mbScore', 0)))
    pool = []
    for _, row, song in ranked[:TARGET_POOL]:
        song['source'] = 'billboard-release-year-verified'
        song['sourceLabel'] = f'Billboard {row["chartYear"]} year-end #{row["rank"]} · {year} release verified'
        ids = playback.get(song_key(row['title'], row['artist'])) or {}
        song['spotifyId'] = ids.get('spotifyId', '')
        song['youtubeId'] = ids.get('youtubeId', '')
        pool.append(song)
    if len(pool) < MIN_POOL:
        raise RuntimeError(f'{year} produced only {len(pool)} verified distinct Billboard songs; need {MIN_POOL}')
    return pool


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    playback = bimmuda_lookup()
    greatest = {}
    for year in YEARS:
        print('Release year', year, flush=True)
        rows = candidate_chart_rows(year)
        pool = verified_pool(year, rows, playback)
        greatest[str(year)] = pool
        chart_years = sorted(set(int(s.get('chartYear', year)) for s in pool))
        print(' ', len(pool), 'verified distinct songs from chart years', chart_years, flush=True)

    sizes = [len(v) for v in greatest.values()]
    data = {
        'version': 8,
        'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'years': YEARS,
        'modes': {'greatest': greatest},
        'coverage': {'greatest': len(greatest)},
        'sources': {
            'greatest': 'Full Billboard year-end singles tables from release year and up to two following chart years provide canonical hit identity/ranking; MusicBrainz first-release-date verifies the answer year.'
        },
        'poolStats': {
            'targetPerYear': TARGET_POOL,
            'minimumRequiredPerYear': MIN_POOL,
            'chartLookaheadYears': CHART_LOOKAHEAD,
            'minimumPerYear': min(sizes),
            'maximumPerYear': max(sizes),
            'totalSongs': sum(sizes),
        },
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    print('Wrote', OUT, data['poolStats'], flush=True)


if __name__ == '__main__':
    main()
