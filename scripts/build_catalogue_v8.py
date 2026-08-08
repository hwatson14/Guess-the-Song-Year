#!/usr/bin/env python3
"""Build the one-mode prebuilt Greatest Hits catalogue.

Candidate ranking: full Billboard year-end singles tables from the release year
and, when needed, the following two chart years. This catches songs released late
in a calendar year that became major hits later.

Canonical song identity: Billboard title + artist.
Year truth: the EARLIEST MusicBrainz release-group first-release-date matching that
canonical song. A later reissue/remix/re-release never changes the game year.
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
MB_RELEASE_GROUP = 'https://musicbrainz.org/ws/2/release-group/'
WIKI_API = 'https://en.wikipedia.org/w/api.php'
UA = 'Guess-the-Song-Year/2.2 (private-use catalogue builder; https://github.com/hwatson14/Guess-the-Song-Year)'
S = requests.Session()
S.headers.update({'User-Agent': UA})
_last_mb = 0.0
_chart_cache = {}
_year_cache = {}
VARIANT = re.compile(r'\b(karaoke|tribute|demo|live|remix|instrumental|acoustic|backing track|sped up|slowed|re-record)\b', re.I)


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
    return re.split(r'feat\.|ft\.|&|,| and | featuring | with ', clean(v), maxsplit=1, flags=re.I)[0].strip()


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


def mb(query, limit=100):
    global _last_mb
    wait = max(0, 1.1 - (time.time() - _last_mb))
    if wait:
        time.sleep(wait)
    r = get(MB_RELEASE_GROUP, params={'fmt': 'json', 'limit': limit, 'query': query}, headers={'Accept': 'application/json', 'User-Agent': UA})
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
    # The Hot 100 began during 1958; 1959 has a normal Hot 100 year-end page.
    if year >= 1959:
        return f'Billboard Year-End Hot 100 singles of {year}'
    q = f'Billboard year-end singles {year}'
    data = get(WIKI_API, params={'action': 'query', 'list': 'search', 'srsearch': q, 'srlimit': 12, 'format': 'json', 'origin': '*'}).json()
    hits = data.get('query', {}).get('search', [])
    ranked = []
    for h in hits:
        title = clean(h.get('title'))
        low = title.lower()
        if str(year) not in title or 'billboard' not in low:
            continue
        if any(x in low for x in ('country', 'western', 'r&b', 'rhythm', 'jazz', 'dance')):
            continue
        bonus = 0
        if 'year-end' in low or 'year end' in low:
            bonus += 4
        if 'single' in low:
            bonus += 3
        if 'top' in low:
            bonus += 2
        if 'pop' in low:
            bonus += 2
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
        ri = next((i for i, h in enumerate(heads) if h in ('no.', 'no', 'rank', 'position', '№') or 'rank' in h), 0)
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


def match_scores(entity, row):
    title = clean(entity.get('title'))
    artist = artist_credit(entity)
    title_score = sim(title, row['title'])
    artist_score = max(sim(artist, row['artist']), sim(main_artist(artist), main_artist(row['artist'])))
    return title_score, artist_score, title_score * 2 + artist_score


def plausible_match(entity, row):
    title = clean(entity.get('title'))
    if not title or VARIANT.search(title):
        return False
    ts, ars, total = match_scores(entity, row)
    return ts >= 0.55 and ars >= 0.45 and total >= 1.65


def batch_candidates_for_year(target_year, chunk):
    """Cheap screening pass. Returns rows whose earliest matching group in the batch looks right.

    Final acceptance always goes through confirm_release_year(), which repeats the query for
    that one canonical title/artist so a crowded OR search can never establish the answer year.
    """
    clauses = [f'(releasegroup:"{lucene(r["title"])}" AND artistname:"{lucene(main_artist(r["artist"]))}")' for r in chunk]
    try:
        data = mb('(' + ' OR '.join(clauses) + ')', 100)
    except Exception as e:
        print('MusicBrainz batch query failed', target_year, e)
        return []

    matches = {}
    for entity in data.get('release-groups', []):
        date = clean(entity.get('first-release-date'))
        if not re.match(r'^\d{4}', date):
            continue
        best = None
        for row in chunk:
            if not plausible_match(entity, row):
                continue
            ts, ars, total = match_scores(entity, row)
            candidate = (total, ts, ars, row)
            if best is None or candidate[:3] > best[:3]:
                best = candidate
        if best is None:
            continue
        row = best[3]
        k = song_key(row['title'], row['artist'])
        yr = int(date[:4])
        old = matches.get(k)
        if old is None or yr < old[0] or (yr == old[0] and float(entity.get('score') or 0) > old[1]):
            matches[k] = (yr, float(entity.get('score') or 0), row)
    return [v[2] for v in matches.values() if v[0] == target_year]


def confirm_release_year(row):
    """Return canonical earliest release evidence for one Billboard title/artist."""
    k = song_key(row['title'], row['artist'])
    if k in _year_cache:
        return _year_cache[k]

    query = f'releasegroup:"{lucene(row["title"])}" AND artistname:"{lucene(main_artist(row["artist"]))}"'
    try:
        data = mb(query, 50)
    except Exception as e:
        print('MusicBrainz exact query failed', row['title'], row['artist'], e)
        _year_cache[k] = None
        return None

    valid = []
    for entity in data.get('release-groups', []):
        date = clean(entity.get('first-release-date'))
        if not re.match(r'^\d{4}', date) or not plausible_match(entity, row):
            continue
        ts, ars, total = match_scores(entity, row)
        valid.append((int(date[:4]), -total, -float(entity.get('score') or 0), entity, ts, ars))
    if not valid:
        _year_cache[k] = None
        return None

    valid.sort(key=lambda x: (x[0], x[1], x[2]))
    year, _, _, entity, ts, ars = valid[0]
    evidence = {
        'year': year,
        'musicbrainzId': clean(entity.get('id')),
        'musicbrainzMatchedTitle': clean(entity.get('title')),
        'musicbrainzMatchedArtist': artist_credit(entity),
        'mbScore': float(entity.get('score') or 0),
        'titleSimilarity': round(ts, 4),
        'artistSimilarity': round(ars, 4),
    }
    _year_cache[k] = evidence
    return evidence


def verified_pool(year, rows, playback):
    confirmed = {}
    screened = set()
    for start in range(0, len(rows), 10):
        chunk = rows[start:start + 10]
        prelim = batch_candidates_for_year(year, chunk)
        for row in prelim:
            k = song_key(row['title'], row['artist'])
            if k in screened:
                continue
            screened.add(k)
            evidence = confirm_release_year(row)
            if not evidence or int(evidence['year']) != year:
                continue
            rank_score = int(row.get('rankScore', row['rank']))
            confirmed[k] = (rank_score, row, evidence)
        if len(confirmed) >= TARGET_POOL:
            break

    ranked = sorted(confirmed.values(), key=lambda x: x[0])[:TARGET_POOL]
    pool = []
    for _, row, evidence in ranked:
        song = {
            'title': row['title'],
            'artist': row['artist'],
            'year': year,
            'yearEvidence': 'MusicBrainz release-group earliest first-release-date',
            'musicbrainzId': evidence['musicbrainzId'],
            'musicbrainzMatchedTitle': evidence['musicbrainzMatchedTitle'],
            'musicbrainzMatchedArtist': evidence['musicbrainzMatchedArtist'],
            'mbScore': evidence['mbScore'],
            'titleSimilarity': evidence['titleSimilarity'],
            'artistSimilarity': evidence['artistSimilarity'],
            'chartYear': int(row['chartYear']),
            'chartRank': int(row['rank']),
            'source': 'billboard-canonical-release-year-verified',
            'sourceLabel': f'Billboard {row["chartYear"]} year-end #{row["rank"]} · earliest release {year} verified',
        }
        ids = playback.get(song_key(row['title'], row['artist'])) or {}
        song['spotifyId'] = ids.get('spotifyId', '')
        song['youtubeId'] = ids.get('youtubeId', '')
        pool.append(song)

    if len(pool) < MIN_POOL:
        raise RuntimeError(f'{year} produced only {len(pool)} canonically verified distinct Billboard songs; need {MIN_POOL}')
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
        chart_years = sorted(set(int(s['chartYear']) for s in pool))
        print(' ', len(pool), 'canonical verified songs from chart years', chart_years, flush=True)

    sizes = [len(v) for v in greatest.values()]
    data = {
        'version': 9,
        'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'years': YEARS,
        'modes': {'greatest': greatest},
        'coverage': {'greatest': len(greatest)},
        'sources': {
            'greatest': 'Full Billboard year-end pop/Hot 100 tables from release year and up to two following chart years provide canonical hit identity/ranking; the earliest matching MusicBrainz release-group first-release-date defines the answer year.'
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
