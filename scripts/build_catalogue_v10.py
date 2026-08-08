#!/usr/bin/env python3
"""Build the single-mode Greatest Hits catalogue with canonical underlying songs.

Rules:
- Candidate popularity comes from Billboard year-end pop / Hot 100 tables.
- A year may also use the next two chart years to catch late-year releases.
- Answer-year evidence comes from the earliest matching MusicBrainz RECORDING
  first-release-date, not a later release group/reissue.
- Alternate versions never count as extra songs. Remixes, edits, remasters,
  acoustic/live versions, featured-artist remix credits, etc. collapse to one
  underlying-song identity. The builder keeps searching until replacements fill
  the pool with distinct songs.
"""
import ast
import csv
import io
import json
import re
import time
import unicodedata
from collections import Counter
from pathlib import Path

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'catalogue.json'
YEARS = list(range(1950, 2023))
DEFAULT_TARGET_POOL = 12
MIN_POOL = 8
CHART_LOOKAHEAD = 2
BIMMUDA = 'https://raw.githubusercontent.com/madelinehamilton/BiMMuDa/main/metadata/bimmuda_per_song_metadata.csv'
MB_RECORDING = 'https://musicbrainz.org/ws/2/recording/'
WIKI_API = 'https://en.wikipedia.org/w/api.php'
UA = 'Guess-the-Song-Year/3.0 (private-use catalogue builder; https://github.com/hwatson14/Guess-the-Song-Year)'

S = requests.Session()
S.headers.update({'User-Agent': UA})
_last_mb = 0.0
_chart_cache = {}
_year_cache = {}

VERSION_MARKER = re.compile(
    r'\b(?:karaoke|tribute|demo|live|remix|re[- ]?mix|mix|acoustic|a cappella|acapella|'
    r'backing(?: track)?|instrumental|bootleg|mashup|preview|playback|deluxe|'
    r'remaster(?:ed)?(?:\s*\d{4})?|radio edit|radio version|single edit|single version|'
    r'album version|extended(?: version| mix)?|club mix|dance mix|original mix|'
    r'mono|stereo|sped up|slowed|re[- ]?record(?:ed)?|music video|video version|'
    r'take\s*\d+|pt\.?\s*\d+|part\s*\d+|special disco version|clean version)\b',
    re.I,
)
FEATURE_MARKER = re.compile(r'\b(?:feat\.?|ft\.?|featuring|with)\b', re.I)


def clean(v):
    return str(v or '').strip().strip('“”"')


def norm(v):
    return re.sub(
        r'[^a-z0-9]+', ' ',
        unicodedata.normalize('NFKD', clean(v)).encode('ascii', 'ignore').decode().lower(),
    ).strip()


def toks(v):
    return set(norm(v).split())


def sim(a, b):
    aa, bb = toks(a), toks(b)
    return len(aa & bb) / max(len(aa), len(bb)) if aa and bb else 0


def lucene(v):
    return re.sub(r'[+\-!(){}\[\]^"~*?:\\/]', ' ', clean(v)).strip()


def base_title(v):
    """Strip version/feature annotations while retaining real title parentheses."""
    s = clean(v)

    def strip_bracket(match):
        inside = match.group(1)
        if VERSION_MARKER.search(inside) or re.match(r'^\s*(?:feat\.?|ft\.?|featuring|with)\b', inside, re.I):
            return ' '
        return match.group(0)

    s = re.sub(r'\(([^)]*)\)', strip_bracket, s)
    s = re.sub(r'\[([^]]*)\]', strip_bracket, s)
    m = re.search(r'\s[-–—:]\s(.+)$', s)
    if m and VERSION_MARKER.search(m.group(1)):
        s = s[:m.start()]
    s = re.sub(r'\s+(?:feat\.?|ft\.?|featuring|with)\s+.+$', '', s, flags=re.I)
    return clean(s)


def primary_artist(v):
    """Lead artist for underlying-version identity; distinct covers stay distinct."""
    s = clean(v)
    s = re.split(r'\s+(?:feat\.?|ft\.?|featuring|with)\s+', s, maxsplit=1, flags=re.I)[0]
    # Billboard sometimes credits a remix as "Lead Artist and Guest".
    s = re.split(r'\s+(?:and|&)\s+', s, maxsplit=1, flags=re.I)[0]
    return clean(s)


def song_key(title, artist):
    return f'{norm(title)}|{norm(artist)}'


def underlying_key(title, artist):
    return f'{norm(base_title(title))}|{norm(primary_artist(artist)).removeprefix("the ")}'


def is_explicit_alternate_title(title):
    return bool(VERSION_MARKER.search(clean(title)))


def get(url, **kw):
    for i in range(7):
        try:
            r = S.get(url, timeout=45, **kw)
            if r.ok:
                return r
            if r.status_code not in (429, 500, 502, 503, 504):
                r.raise_for_status()
        except requests.RequestException:
            pass
        time.sleep(min(25, 2 * (i + 1)))
    raise RuntimeError('GET failed: ' + url)


def mb_recordings(query, limit=100):
    global _last_mb
    wait = max(0, 1.1 - (time.time() - _last_mb))
    if wait:
        time.sleep(wait)
    r = get(
        MB_RECORDING,
        params={'fmt': 'json', 'limit': limit, 'query': query},
        headers={'Accept': 'application/json', 'User-Agent': UA},
    )
    _last_mb = time.time()
    return r.json()


def physical_card_counts():
    text = (ROOT / 'engine.js').read_text(encoding='utf-8')
    m = re.search(r'const YEAR_MAP=(\[[^;]+\]);', text)
    if not m:
        raise RuntimeError('YEAR_MAP not found in engine.js')
    years = ast.literal_eval(re.sub(r'\bnull\b', 'None', m.group(1)))[1:]
    return Counter(int(y) for y in years if y)


def bimmuda_lookup():
    """Known playback IDs, indexed by exact and underlying-song identities."""
    exact, underlying = {}, {}
    for r in csv.DictReader(io.StringIO(get(BIMMUDA).text)):
        title, artist = clean(r.get('Title')), clean(r.get('Artist'))
        if not title or not artist:
            continue
        link = r.get('Link to Audio') or ''
        sp = re.search(r'open\.spotify\.com/track/([A-Za-z0-9]+)', link)
        yt = re.search(r'[?&]v=([A-Za-z0-9_-]{11})', link)
        ids = {'spotifyId': sp.group(1) if sp else '', 'youtubeId': yt.group(1) if yt else ''}
        exact[song_key(title, artist)] = ids
        k = underlying_key(title, artist)
        clean_version = not is_explicit_alternate_title(title)
        old = underlying.get(k)
        if old is None or (clean_version and not old[0]):
            underlying[k] = (clean_version, ids)
    return exact, {k: ids for k, (_, ids) in underlying.items()}


def wikipedia_page_title(year):
    # Use stable page names where Wikipedia has them.
    if 1950 <= year <= 1955:
        return f'Billboard year-end top 30 singles of {year}'
    if 1956 <= year <= 1958:
        return f'Billboard year-end top 50 singles of {year}'
    return f'Billboard Year-End Hot 100 singles of {year}'


def clean_chart_text(v):
    v = clean(v)
    return re.sub(r'\s*\[[^\]]+\]\s*$', '', v).strip()


def billboard_year_rows(year):
    if year in _chart_cache:
        return [dict(r) for r in _chart_cache[year]]

    page_title = wikipedia_page_title(year)
    payload = get(WIKI_API, params={
        'action': 'parse', 'page': page_title, 'prop': 'text',
        'format': 'json', 'origin': '*',
    }).json()
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
            for title in titles:
                if not title or not artist or is_explicit_alternate_title(title):
                    continue
                rows.append({'rank': int(m.group()), 'title': title, 'artist': artist, 'chartYear': year})
        if len(rows) > len(best):
            best = rows

    if len(best) < MIN_POOL:
        raise RuntimeError(f'Only parsed {len(best)} Billboard candidates for {year}: {page_title}')

    grouped = {}
    for row in sorted(best, key=lambda x: x['rank']):
        k = underlying_key(row['title'], row['artist'])
        complexity = len(toks(row['artist'])) + (5 if FEATURE_MARKER.search(row['artist']) else 0)
        score = (complexity, row['rank'])
        old = grouped.get(k)
        if old is None or score < old[0]:
            grouped[k] = (score, row)
    rows = [v[1] for v in grouped.values()]
    rows.sort(key=lambda x: x['rank'])
    _chart_cache[year] = [dict(r) for r in rows]
    return [dict(r) for r in rows]


def candidate_chart_rows(release_year):
    """Popularity-ordered candidates, deduped by underlying song across chart years."""
    candidates = {}
    last_chart_year = min(YEARS[-1], release_year + CHART_LOOKAHEAD)
    for chart_year in range(release_year, last_chart_year + 1):
        offset = chart_year - release_year
        for row in billboard_year_rows(chart_year):
            candidate = dict(row)
            candidate['chartOffset'] = offset
            candidate['rankScore'] = offset * 1000 + int(row['rank'])
            k = underlying_key(row['title'], row['artist'])
            complexity = len(toks(row['artist'])) + (5 if FEATURE_MARKER.search(row['artist']) else 0)
            # Simpler/canonical billing wins; chart proximity/rank breaks ties.
            score = (complexity, candidate['rankScore'])
            old = candidates.get(k)
            if old is None or score < old[0]:
                candidates[k] = (score, candidate)
    rows = [v[1] for v in candidates.values()]
    return sorted(rows, key=lambda r: (r['rankScore'], r['title'].lower(), r['artist'].lower()))


def artist_credit(entity):
    return ''.join(
        x if isinstance(x, str) else x.get('name') or (x.get('artist') or {}).get('name') or ''
        for x in entity.get('artist-credit', [])
    ).strip()


def match_scores(entity, row):
    title = clean(entity.get('title'))
    artist = artist_credit(entity)
    title_score = sim(base_title(title), base_title(row['title']))
    artist_score = max(sim(artist, row['artist']), sim(primary_artist(artist), primary_artist(row['artist'])))
    return title_score, artist_score, title_score * 2 + artist_score


def plausible_match(entity, row):
    title = clean(entity.get('title'))
    if not title or is_explicit_alternate_title(title):
        return False
    ts, ars, total = match_scores(entity, row)
    return ts >= 0.60 and ars >= 0.45 and total >= 1.70


def batch_candidates_for_year(target_year, chunk):
    clauses = [
        f'(recording:"{lucene(base_title(r["title"]))}" AND artistname:"{lucene(primary_artist(r["artist"]))}")'
        for r in chunk
    ]
    try:
        data = mb_recordings('(' + ' OR '.join(clauses) + ')', 100)
    except Exception as e:
        print('MusicBrainz batch query failed', target_year, e, flush=True)
        return []

    earliest = {}
    for entity in data.get('recordings', []):
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
        k = underlying_key(row['title'], row['artist'])
        yr = int(date[:4])
        old = earliest.get(k)
        if old is None or yr < old[0] or (yr == old[0] and float(entity.get('score') or 0) > old[1]):
            earliest[k] = (yr, float(entity.get('score') or 0), row)
    return [v[2] for v in earliest.values() if v[0] == target_year]


def confirm_release_year(row):
    """Exact recording-level first-release evidence for one underlying song."""
    k = underlying_key(row['title'], row['artist'])
    if k in _year_cache:
        return _year_cache[k]

    query = f'recording:"{lucene(base_title(row["title"]))}" AND artistname:"{lucene(primary_artist(row["artist"]))}"'
    try:
        data = mb_recordings(query, 100)
    except Exception as e:
        print('MusicBrainz exact query failed', row['title'], row['artist'], e, flush=True)
        _year_cache[k] = None
        return None

    valid = []
    for entity in data.get('recordings', []):
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


def canonical_display(row, evidence):
    """Return original-facing title/artist rather than remix/edit billing."""
    title = base_title(row['title'])
    artist = clean(row['artist'])
    matched_artist = clean(evidence.get('musicbrainzMatchedArtist'))
    row_primary = norm(primary_artist(artist)).removeprefix('the ')
    mb_primary = norm(primary_artist(matched_artist)).removeprefix('the ')
    if matched_artist and row_primary and row_primary == mb_primary:
        if len(toks(matched_artist)) < len(toks(artist)) and not re.search(r'[a-zà-ÿ][A-Z]', matched_artist):
            artist = matched_artist
    return title, artist


def verified_pool(year, rows, playback_exact, playback_underlying, target_pool):
    """Fill with distinct songs; every candidate gets exact recording-year verification.

    This intentionally avoids the old multi-song batch pre-screen because MusicBrainz can
    truncate/fuzzily rank OR queries, which caused genuine early recordings to disappear.
    If a remix/edit/duplicate is rejected we simply continue down the popularity list until
    a different underlying song replaces it.
    """
    confirmed = {}
    screened = set()

    for row in rows:
        k = underlying_key(row['title'], row['artist'])
        if k in screened:
            continue
        screened.add(k)

        evidence = confirm_release_year(row)
        if not evidence or int(evidence['year']) != year:
            continue

        title, artist = canonical_display(row, evidence)
        canonical = underlying_key(title, artist)
        if canonical in confirmed or is_explicit_alternate_title(title):
            continue

        rank_score = int(row.get('rankScore', row['rank']))
        song = {
            'title': title,
            'artist': artist,
            'year': year,
            'canonicalKey': canonical,
            'yearEvidence': 'MusicBrainz recording earliest first-release-date',
            'musicbrainzId': evidence['musicbrainzId'],
            'musicbrainzMatchedTitle': evidence['musicbrainzMatchedTitle'],
            'musicbrainzMatchedArtist': evidence['musicbrainzMatchedArtist'],
            'mbScore': evidence['mbScore'],
            'titleSimilarity': evidence['titleSimilarity'],
            'artistSimilarity': evidence['artistSimilarity'],
            'chartYear': int(row['chartYear']),
            'chartRank': int(row['rank']),
            'source': 'billboard-underlying-song-recording-year-verified',
            'sourceLabel': f'Billboard {row["chartYear"]} year-end #{row["rank"]} · earliest recording release {year} verified',
        }
        ids = playback_exact.get(song_key(title, artist)) or playback_underlying.get(canonical) or {}
        song['spotifyId'] = ids.get('spotifyId', '')
        song['youtubeId'] = ids.get('youtubeId', '')
        confirmed[canonical] = (rank_score, song)

        if len(confirmed) >= target_pool:
            break

    ranked = [v[1] for v in sorted(confirmed.values(), key=lambda x: x[0])[:target_pool]]
    if len(ranked) < MIN_POOL:
        raise RuntimeError(f'{year} produced only {len(ranked)} distinct canonically verified songs; need {MIN_POOL}')
    return ranked


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    playback_exact, playback_underlying = bimmuda_lookup()
    card_counts = physical_card_counts()
    greatest = {}

    for year in YEARS:
        # At least 12 per year, and never fewer than the number of physical cards mapped to that year.
        target_pool = max(DEFAULT_TARGET_POOL, card_counts.get(year, 0))
        print('Release year', year, 'target', target_pool, flush=True)
        rows = candidate_chart_rows(year)
        pool = verified_pool(year, rows, playback_exact, playback_underlying, target_pool)
        greatest[str(year)] = pool
        print(' ', len(pool), 'distinct canonical songs', flush=True)

    sizes = [len(v) for v in greatest.values()]
    data = {
        'version': 10,
        'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'years': YEARS,
        'modes': {'greatest': greatest},
        'coverage': {'greatest': len(greatest)},
        'sources': {
            'greatest': 'Billboard year-end pop/Hot 100 tables rank recognisable candidates; MusicBrainz recording first-release-date verifies answer year. Alternate versions collapse to one underlying song and are replaced by the next distinct candidate.'
        },
        'poolStats': {
            'defaultTargetPerYear': DEFAULT_TARGET_POOL,
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
