#!/usr/bin/env python3
"""Regression checks for externally verified Australian chart leaders."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def main() -> None:
    catalogue = json.loads((ROOT / "data" / "catalogue.json").read_text(encoding="utf-8"))
    buckets = catalogue["modes"]["number1_au"]
    assert set(buckets) == {str(year) for year in range(1950, 2023)}
    for year in range(1950, 2023):
        bucket = buckets[str(year)]
        assert len(bucket) == 1
        song = bucket[0]
        assert song["year"] == year
        assert song["chartYear"] == year
        assert song["chartRank"] == 1
        assert song["source"] == "australia-eoy-1"
        assert song["evidenceState"] == "externally_observed"
        assert song["evidenceDisposition"] in {
            "exact", "normalized_equivalent", "expanded_credit_double_sided",
            "substantive_correction",
        }
        assert song["sourceUrl"].startswith("https://")
        assert song["sourceTitle"].strip()
        assert song["sourceArtist"].strip()
        assert "\\" not in song["sourceTitle"]
        assert "\\" not in song["sourceArtist"]
    row_1953 = buckets["1953"][0]
    assert row_1953["title"] == 'The Song from "Moulin Rouge" (Where is Your Heart)'
    assert row_1953["artist"] == "Percy Faith feat. Felicia Sanders"
    assert row_1953["evidenceDisposition"] == "substantive_correction"
    row_1998 = buckets["1998"][0]
    assert row_1998["title"] == "Maria"
    assert row_1998["artist"] == "Ricky Martin"
    assert row_1998["evidenceDisposition"] == "substantive_correction"
    for year in (1962, 1964, 1965, 1968, 1969, 1997):
        assert "/" in buckets[str(year)][0]["sourceTitle"]
    print("number1_au provenance checks passed (73/73)")

if __name__ == "__main__":
    main()
