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
    global_mb = {}
    global_spotify = {}
    global_youtube = {}
    total = 0

    for year in sorted(pools, key=int):
        seen_keys = {}
        seen_titles = {}
        pool = pools[year]
        if len(pool) < 12:
            fail(f'{year} has only {len(pool)} songs; need at least 12 distinct underlying songs')

        for i, song in enumerate(pool):
            total += 1
            title = str(song.get('title') or '').strip()
            artist = str(song.get('artist') or '').strip()
            label = f'{year}: {title} — {artist}'
            if not title or not artist:
                fail(f'{year}[{i}] missing title/artist')
            if int(song.get('year') or 0) != int(year):
                fail(f'{year}: {title} has stored year {song.get("year")}')
            if identity.is_explicit_alternate_title(title):
                fail(f'{year}: alternate/version title survived: {title} — {artist}')

            # In one year, two performers of the same named chart song are not useful variety.
            title_key = identity.norm(identity.base_title(title))
            if title_key in seen_titles:
                fail(f'{year}: same song title appears twice: {seen_titles[title_key]}  <=>  {title} — {artist}')
            seen_titles[title_key] = f'{title} — {artist}'

            computed = identity.underlying_key(title, artist)
            stored = str(song.get('canonicalKey') or '')
            if not stored:
                fail(f'{label} has no canonicalKey')
            if stored != computed:
                fail(f'{label}: canonicalKey mismatch: {stored!r} != {computed!r}')

            if stored in seen_keys:
                fail(f'{year}: alternate/duplicate underlying song: {seen_keys[stored]}  <=>  {title} — {artist}')
            seen_keys[stored] = f'{title} — {artist}'

            prior_year = global_seen.get(stored)
            if prior_year is not None and prior_year != year:
                fail(f'underlying song {stored!r} appears in both {prior_year} and {year}')
            global_seen[stored] = year

            # If the same verified recording or playback target is reused under another label,
            # it is still the same underlying song/version family and the later entry must be replaced.
            mb = str(song.get('musicbrainzId') or '')
            sp = str(song.get('spotifyId') or '')
            yt = str(song.get('youtubeId') or '')
            for kind, value, registry in (
                ('MusicBrainz recording', mb, global_mb),
                ('Spotify track', sp, global_spotify),
                ('YouTube video', yt, global_youtube),
            ):
                if not value:
                    continue
                if value in registry and registry[value] != label:
                    fail(f'{kind} {value} reused by {registry[value]} and {label}')
                registry[value] = label

            # Verification itself must point at a clean canonical recording, not a hidden edit.
            mb_title = str(song.get('musicbrainzMatchedTitle') or '').strip()
            mb_artist = str(song.get('musicbrainzMatchedArtist') or '').strip()
            if mb_title and identity.is_explicit_alternate_title(mb_title):
                fail(f'{label}: verification points to alternate recording title {mb_title!r}')
            if mb_artist:
                p1 = identity.norm(identity.primary_artist(artist)).removeprefix('the ')
                p2 = identity.norm(identity.primary_artist(mb_artist)).removeprefix('the ')
                if p1 and p1 == p2:
                    extra = len(identity.toks(artist)) - len(identity.toks(mb_artist))
                    if extra >= 2 and re.search(r'\b(?:feat\.?|ft\.?|featuring|with|and|&)\b', artist, re.I):
                        fail(f'{label}: likely alternate guest/remix billing survived; earliest recording credit is {mb_artist}')

    print(
        'catalogue variant audit passed:',
        {'entries': total, 'underlyingSongs': len(global_seen), 'recordingIds': len(global_mb),
         'spotifyIds': len(global_spotify), 'youtubeIds': len(global_youtube)},
    )


if __name__ == '__main__':
    main()