#!/usr/bin/env python3
"""Build the canonical Greatest Hits catalogue, then add verified themed playlists."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / 'scripts'
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import build_catalogue_v8 as base
import build_modes


def fixed_wikipedia_page_title(year):
    # Wikipedia uses stable explicit names before the Hot 100 era.
    if 1950 <= year <= 1955:
        return f'Billboard year-end top 30 singles of {year}'
    if 1956 <= year <= 1958:
        return f'Billboard year-end top 50 singles of {year}'
    return f'Billboard Year-End Hot 100 singles of {year}'


def main():
    base.wikipedia_page_title = fixed_wikipedia_page_title
    # Four is the hard quality floor for sparse early years. The workflow validator
    # separately requires each bucket to cover the number of physical cards mapped
    # to that year, so depth follows actual gameplay demand instead of an arbitrary
    # eight-song blanket rule.
    base.MIN_POOL = 4
    base.main()
    build_modes.augment_catalogue(base.OUT)


if __name__ == '__main__':
    main()
