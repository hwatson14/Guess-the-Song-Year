#!/usr/bin/env python3
"""Build the canonical Greatest Hits catalogue, then add verified themed playlists."""
import ast
import re
import sys
from collections import Counter
from pathlib import Path

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


def physical_card_counts():
    text=(ROOT/'engine.js').read_text(encoding='utf-8')
    m=re.search(r'const YEAR_MAP=(\[[^;]+\]);',text)
    if not m:
        raise RuntimeError('YEAR_MAP not found in engine.js')
    years=ast.literal_eval(re.sub(r'\bnull\b','None',m.group(1)))[1:]
    return Counter(int(y) for y in years if y)


def main():
    base.wikipedia_page_title = fixed_wikipedia_page_title
    counts=physical_card_counts()
    original_verified_pool=base.verified_pool

    def distribution_verified_pool(year, rows, playback):
        # Six songs is the normal floor; years with more physical cards require at
        # least one distinct canonical song per mapped card. Sparse early years may
        # legitimately bottom out at four if the source evidence cannot support six.
        base.TARGET_POOL=max(6,counts.get(int(year),0))
        base.MIN_POOL=max(4,counts.get(int(year),0))
        return original_verified_pool(year,rows,playback)

    base.verified_pool=distribution_verified_pool
    base.MIN_POOL=4
    base.TARGET_POOL=6
    base.main()
    build_modes.augment_catalogue(base.OUT)


if __name__ == '__main__':
    main()
