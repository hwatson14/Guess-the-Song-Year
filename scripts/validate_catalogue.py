#!/usr/bin/env python3
import ast
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = ROOT / 'data' / 'catalogue.json'
SCHEMA = ROOT / 'data' / 'catalogue.schema.json'
ENGINE = ROOT / 'engine.js'
APP = ROOT / 'app.js'


def fail(message):
    raise SystemExit(f'catalogue validation failed: {message}')


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


def main():
    if not CATALOGUE.exists():
        fail('data/catalogue.json is missing')
    if not SCHEMA.exists():
        fail('data/catalogue.schema.json is missing')

    data = json.loads(CATALOGUE.read_text(encoding='utf-8'))
    schema = json.loads(SCHEMA.read_text(encoding='utf-8'))
    if schema.get('title') != 'Guess the Song Year prebuilt catalogue':
        fail('unexpected catalogue schema')

    greatest = data.get('modes', {}).get('greatest')
    if not isinstance(greatest, dict):
        fail('modes.greatest is missing')

    year_map = load_year_map()
    required_years = sorted(set(int(y) for y in year_map[1:] if y))
    if required_years[0] != 1950 or required_years[-1] != 2022:
        fail('card map year range changed unexpectedly')

    warnings = []
    for year in required_years:
        pool = greatest.get(str(year))
        if not isinstance(pool, list) or not pool:
            fail(f'Greatest Hits has no prebuilt songs for {year}')

        seen_playback = set()
        unique = 0
        for index, song in enumerate(pool):
            if not isinstance(song, dict):
                fail(f'{year}[{index}] is not an object')
            title = str(song.get('title') or '').strip()
            artist = str(song.get('artist') or '').strip()
            song_year = int(song.get('year') or 0)
            if not title or not artist:
                fail(f'{year}[{index}] is missing title/artist')
            if song_year != year:
                fail(f'{year}[{index}] {title!r} declares year {song_year}')

            playback_key = str(song.get('spotifyId') or '').strip() or f'{title.lower()}|{artist.lower()}'
            if playback_key in seen_playback:
                warnings.append(f'{year}: duplicate candidate {title} / {artist}')
            else:
                seen_playback.add(playback_key)
                unique += 1

        if unique < 1:
            fail(f'{year} has no unique playable candidate')

    app = APP.read_text(encoding='utf-8')
    for forbidden in ('data-deck=', 'data-policy=', 'data-round-deck='):
        if forbidden in app:
            fail(f'v7 app still exposes multi-mode UI: {forbidden}')
    for required in ("const MODE='greatest'", "'physical'", "'virtual'", "popstate", "end-game"):
        if required not in app:
            fail(f'app contract token missing: {required}')

    print(f'Greatest Hits catalogue validated for {len(required_years)} years and 308 cards.')
    if warnings:
        print(f'WARN: {len(warnings)} duplicate catalogue candidates remain; runtime dedupe/curation is still recommended.')
        for warning in warnings[:12]:
            print('WARN:', warning)


if __name__ == '__main__':
    main()
