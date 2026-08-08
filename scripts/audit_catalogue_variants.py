#!/usr/bin/env python3
"""Fail if the playable catalogue contains alternate versions or duplicate underlying songs."""
import json
import re
from pathlib import Path

import build_catalogue_v10 as identity

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = ROOT / 'data' / 'catalogue.json'


def fail(msg):
    raise SystemExit('CATALOGUE VARIANT AUDIT FAILED: ' + msg)


def main():
    data = json.loads(CATALOGUE.read_text(encoding='utf-8'))
    if set(data.get('modes', {})) != {'greatest'}:
        fail(f"playable catalogue must contain only Greatest Hits, got {sorted(data.get('modes', {}))}")

    pools = data['modes']['greatest']
    global_seen = {}
    total = 0

    for year in sorted(pools, key=int):
        seen_keys = {}
        seen_spotify = {}
        seen_youtube = {}
        pool = pools[year]
        if len(pool) < 8:
            fail(f'{year} has only {len(pool)} songs; need at least 8 distinct underlying songs')

        for i, song in enumerate(pool):
            total += 1
            title = str(song.get('title') or '').strip()
            artist = str(song.get('artist') or '').strip()
            if not title or not artist:
                fail(f'{year}[{i}] missing title/artist')
            if int(song.get('year') or 0) != int(year):
                fail(f'{year}: {title} has stored year {song.get("year")}')
            if identity.is_explicit_alternate_title(title):
                fail(f'{year}: alternate/version title survived: {title} — {artist}')

            computed = identity.underlying_key(title, artist)
            stored = str(song.get('canonicalKey') or '')
            if not stored:
                fail(f'{year}: {title} — {artist} has no canonicalKey')
            if stored != computed:
                fail(f'{year}: canonicalKey mismatch for {title} — {artist}: {stored!r} != {computed!r}')

            if stored in seen_keys:
                other = seen_keys[stored]
                fail(f'{year}: alternate/duplicate underlying song: {other}  <=>  {title} — {artist}')
            seen_keys[stored] = f'{title} — {artist}'

            prior_year = global_seen.get(stored)
            if prior_year is not None and prior_year != year:
                fail(f'underlying song {stored!r} appears in both {prior_year} and {year}')
            global_seen[stored] = year

            sp = str(song.get('spotifyId') or '')
            yt = str(song.get('youtubeId') or '')
            if sp:
                if sp in seen_spotify:
                    fail(f'{year}: Spotify track {sp} reused by {seen_spotify[sp]} and {title} — {artist}')
                seen_spotify[sp] = f'{title} — {artist}'
            if yt:
                if yt in seen_youtube:
                    fail(f'{year}: YouTube video {yt} reused by {seen_youtube[yt]} and {title} — {artist}')
                seen_youtube[yt] = f'{title} — {artist}'

            # If the verified original recording has a materially simpler artist credit,
            # a remix/guest billing should already have been replaced by canonical_display().
            mb_artist = str(song.get('musicbrainzMatchedArtist') or '').strip()
            if mb_artist:
                p1 = identity.norm(identity.primary_artist(artist)).removeprefix('the ')
                p2 = identity.norm(identity.primary_artist(mb_artist)).removeprefix('the ')
                if p1 and p1 == p2:
                    extra = len(identity.toks(artist)) - len(identity.toks(mb_artist))
                    if extra >= 2 and re.search(r'\b(?:feat\.?|ft\.?|featuring|with|and|&)\b', artist, re.I):
                        fail(f'{year}: likely alternate guest/remix billing survived: {title} — {artist}; earliest recording credit is {mb_artist}')

    print(f'catalogue variant audit passed: {total} entries, {len(global_seen)} distinct underlying songs')


if __name__ == '__main__':
    main()
