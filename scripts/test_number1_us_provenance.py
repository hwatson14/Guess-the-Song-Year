#!/usr/bin/env python3
"""Regression checks for externally verified US chart leaders."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def main() -> None:
    buckets = json.loads((ROOT / "data" / "catalogue.json").read_text(encoding="utf-8"))["modes"]["number1_us"]
    assert set(buckets) == {str(year) for year in range(1950, 2023)}
    for year in range(1950, 2023):
        assert len(buckets[str(year)]) == 1
        song = buckets[str(year)][0]
        assert song["year"] == song["chartYear"] == year
        assert song["chartRank"] == 1
        assert song["source"] == "billboard-eoy-1"
        assert song["evidenceState"] == "externally_observed"
        assert song["sourceUrl"].startswith("https://raw.githubusercontent.com/")
        assert song["sourceTitle"].strip() and song["sourceArtist"].strip()
    special = buckets["1997"][0]
    assert special["evidenceDisposition"] == "expanded_double_sided"
    assert special["title"] == "Something About The Way You Look Tonight"
    assert len(special["sourceSides"]) == 2
    assert [side["chartRankRaw"] for side in special["sourceSides"]] == ["1a", "1b"]
    assert "single app playback side" in special["playablePolicy"]
    print("number1_us provenance checks passed (73/73)")

if __name__ == "__main__":
    main()
