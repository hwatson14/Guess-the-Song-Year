#!/usr/bin/env python3
import ast
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = ROOT / 'data' / 'catalogue.json'
SCHEMA = ROOT / 'data' / 'catalogue.schema.json'
ENGINE = ROOT / 'engine.js'
APP = ROOT / 'app.js'

# Only treat these as version markers inside metadata-like parentheses/brackets/suffixes.
# This intentionally does not reject genuine song titles such as "Live and Let Die".
VERSION_ANNOTATION = re.compile(
    r'\b(?:karaoke|tribute|demo|live|remix|re[- ]?mix|mix|edit|version|recording|master|radio|single|album|vocal|acoustic|unplugged|'
    r'a cappella|acapella|backing(?: track)?|instrumental|strumentale|base musicale|bootleg|mashup|refix|rework|'
    r'preview|playback|deluxe|bonus|voice note|alternate|alternative|original|rehearsal|session|concert|'
    r'remaster(?:ed)?(?:\s*\d{4})?|radio edit|radio version|single edit|single version|'
    r'album version|extended(?: version| edit| mix)?|club mix|dance mix|original mix|'
    r'dub(?: version| mix)?|mono|stereo|sped up|slowed|re[- ]?record(?:ed)?|'
    r'music video|video version|solo vocal|take\s*\d+|pt\.?\s*\d+|part\s*\d+|'
    r'special disco version|clean version)\b', re.I,
)
STRONG_TRAILING_VERSION = re.compile(
    r'\b(?:remix|re[- ]?mix|remaster(?:ed)?(?:\s*\d{4})?|radio edit|radio version|'
    r'single edit|single version|album version|extended(?: version| edit| mix)?|club mix|'
    r'dance mix|original mix|dub(?: version| mix)?|acoustic(?: version)?|unplugged|'
    r'live version|instrumental(?: version)?|a cappella|acapella|sped up|slowed|'
    r're[- ]?record(?:ed)?|refix|rework|voice note|alternate version|alternative version|'
    r'clean version)\s*$', re.I,
)


def fail(message):
    raise SystemExit(f'catalogue validation failed: {message}')


def norm(v):
    import unicodedata
    return re.sub(
        r'[^a-z0-9]+', ' ',
        unicodedata.normalize('NFKD', str(v or '')).encode('ascii', 'ignore').decode().lower(),
    ).strip()


def base_title(title):
    s = str(title or '').strip()
    def strip_bracket(match):
        inside = match.group(1)
        return ' ' if VERSION_ANNOTATION.search(inside) or re.match(r'^\s*(?:feat\.?|ft\.?|featuring|with)\b', inside, re.I) else match.group(0)
    s = re.sub(r'\(([^)]*)\)', strip_bracket, s)
    s = re.sub(r'\[([^]]*)\]', strip_bracket, s)
    suffix = re.search(r'\s[-–—:]\s(.+)$', s)
    if suffix and VERSION_ANNOTATION.search(suffix.group(1)):
        s = s[:suffix.start()]
    return norm(s)


def load_year_map():
    text = ENGINE.read_text(encoding='utf-8')
    m = re.search(r'const YEAR_MAP=(\[[^;]+\]);', text)
    if not m:
        fail('YEAR_MAP not found in engine.js')
    raw = re.sub(r'\bnull\b', 'None', m.group(1))
    values = ast.literal_eval(raw)
    if len(values) != 309:
        fail(f'YEAR_MAP must contain null + 308 cards, found {len(values)} entries')
    return values


def is_alternate_title(title):
    s = str(title or '').strip()
    for left, right in re.findall(r'\(([^)]*)\)|\[([^]]*)\]', s):
        if VERSION_ANNOTATION.search(left or right):
            return True
    suffix = re.search(r'\s[-–—:]\s(.+)$', s)
    if suffix and VERSION_ANNOTATION.search(suffix.group(1)):
        return True
    return bool(STRONG_TRAILING_VERSION.search(s))


def main():
    if not CATALOGUE.exists():
        fail('data/catalogue.json is missing')
    if not SCHEMA.exists():
        fail('data/catalogue.schema.json is missing')

    data = json.loads(CATALOGUE.read_text(encoding='utf-8'))
    schema = json.loads(SCHEMA.read_text(encoding='utf-8'))
    if schema.get('title') != 'Guess the Song Year prebuilt catalogue':
        fail('unexpected catalogue schema')

    if set(data.get('modes', {})) != {'greatest'}:
        fail(f"only Greatest Hits is enabled right now; found modes {sorted(data.get('modes', {}))}")
    if int(data.get('version') or 0) != 10:
        fail(f"canonical one-mode catalogue v10 required, found {data.get('version')}")

    greatest = data['modes']['greatest']
    if not isinstance(greatest, dict):
        fail('modes.greatest is missing')

    year_map = load_year_map()
    required_years = sorted(set(int(y) for y in year_map[1:] if y))
    card_counts = Counter(int(y) for y in year_map[1:] if y)
    if required_years != list(range(1950, 2023)):
        fail('card map must cover every year 1950–2022')
    if set(map(int, greatest)) != set(required_years):
        fail('Greatest Hits must contain exactly the card years 1950–2022')

    global_keys = {}
    global_recordings = {}
    global_spotify = {}
    global_youtube = {}
    total = 0

    for year in required_years:
        pool = greatest.get(str(year))
        if not isinstance(pool, list):
            fail(f'Greatest Hits has no prebuilt pool for {year}')
        minimum = max(12, card_counts[year])
        if len(pool) < minimum:
            fail(f'{year} has only {len(pool)} songs; need at least {minimum}')

        local_keys = set()
        local_titles = {}
        for index, song in enumerate(pool):
            total += 1
            if not isinstance(song, dict):
                fail(f'{year}[{index}] is not an object')
            title = str(song.get('title') or '').strip()
            artist = str(song.get('artist') or '').strip()
            song_year = int(song.get('year') or 0)
            label = f'{year}[{index}] {title} — {artist}'
            if not title or not artist:
                fail(f'{year}[{index}] is missing title/artist')
            if song_year != year:
                fail(f'{label} declares year {song_year}')
            if is_alternate_title(title):
                fail(f'{label} is an alternate/version title')

            title_key = base_title(title)
            if title_key in local_titles:
                fail(f'{year} contains the same song title twice: {local_titles[title_key]} and {title} — {artist}')
            local_titles[title_key] = f'{title} — {artist}'

            canonical = str(song.get('canonicalKey') or '').strip()
            if not canonical:
                fail(f'{label} has no canonicalKey')
            if canonical in local_keys:
                fail(f'{year} repeats underlying song {canonical!r}')
            local_keys.add(canonical)
            prior = global_keys.get(canonical)
            if prior is not None and prior != year:
                fail(f'underlying song {canonical!r} appears in both {prior} and {year}')
            global_keys[canonical] = year

            evidence = str(song.get('yearEvidence') or '')
            if evidence != 'MusicBrainz recording earliest first-release-date':
                fail(f'{label} has noncanonical year evidence: {evidence!r}')
            mb = str(song.get('musicbrainzId') or '').strip()
            if not mb:
                fail(f'{label} has no verified recording id')
            prior_mb = global_recordings.get(mb)
            if prior_mb is not None and prior_mb != canonical:
                fail(f'MusicBrainz recording {mb} reused by {prior_mb!r} and {canonical!r}')
            global_recordings[mb] = canonical

            chart_year = int(song.get('chartYear') or 0)
            if chart_year < year or chart_year > min(2022, year + 2):
                fail(f'{label} has invalid chartYear {chart_year}')

            for kind, value, registry in (
                ('Spotify track', str(song.get('spotifyId') or '').strip(), global_spotify),
                ('YouTube video', str(song.get('youtubeId') or '').strip(), global_youtube),
            ):
                if not value:
                    continue
                prior_value = registry.get(value)
                if prior_value is not None and prior_value != canonical:
                    fail(f'{kind} {value} reused by {prior_value!r} and {canonical!r}')
                registry[value] = canonical

    for bad in (
        'Song (Pop edit)', 'Song (Zwette Edit)', 'Song (LP version)', 'Song (dub version)',
        'Song (solo vocal)', 'Song (Erol Alkan rework)', 'Song (Benny Royal ReFix)',
        'Song (acoustic MTV unplugged)', 'Song (alternative version)', 'Song (voice note)',
        'Song (full version)', 'Song (Deluxe Ultra edit)', 'Song (House mix)', 'Song - 2011 Remaster',
        'Song (Third Recording)', 'Song (master)', 'Song (radio)', 'Song (strumentale)',
        'Song (base musicale)', 'Song (original)', 'Song (rehearsal)',
    ):
        if not is_alternate_title(bad):
            fail(f'alternate-version detector missed regression example: {bad}')
    for genuine in ('Live and Let Die', 'I Want to Live', 'Another Brick in the Wall (Part II)', 'Alone Again (Naturally)', 'Radio Ga Ga'):
        if is_alternate_title(genuine):
            fail(f'alternate-version detector falsely rejects genuine title: {genuine}')

    app = APP.read_text(encoding='utf-8')
    for forbidden in ('data-deck=', 'data-policy=', 'data-round-deck=', 'data-mode=', 'function modeId()'):
        if forbidden in app:
            fail(f'app still exposes multi-mode UI: {forbidden}')
    for required in ("const MODE='greatest'", "'physical'", "'virtual'", 'popstate', 'end-game'):
        if required not in app:
            fail(f'app contract token missing: {required}')

    print(
        'Canonical Greatest Hits catalogue validated:',
        {'years': len(required_years), 'cards': 308, 'songs': total, 'underlyingSongs': len(global_keys)},
    )


if __name__ == '__main__':
    main()