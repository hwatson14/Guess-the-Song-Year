#!/usr/bin/env python3
"""Merge a reviewed Australian year-end #1 acquisition artifact into the catalogue."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOGUE = ROOT / "data" / "catalogue.json"
YEARS = set(range(1950, 2023))
IDENTITY_FIELDS = {
    "spotifyId", "youtubeId", "canonicalKey", "yearEvidence",
    "musicbrainzId", "musicbrainzMatchedTitle", "musicbrainzMatchedArtist",
    "mbScore", "titleSimilarity", "artistSimilarity",
}
ALLOWED_DISPOSITIONS = {
    "exact", "normalized_equivalent", "expanded_credit_double_sided",
    "substantive_correction",
}

def fail(message: str) -> None:
    raise SystemExit(message)

def load_candidates(path: Path) -> dict[int, dict]:
    rows: dict[int, dict] = {}
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw_line.strip():
            continue
        try:
            row = json.loads(raw_line)
        except json.JSONDecodeError as exc:
            fail(f"{path}:{line_number}: invalid JSON: {exc}")
        year = row.get("year")
        if not isinstance(year, int) or year not in YEARS:
            fail(f"{path}:{line_number}: invalid year {year!r}")
        if year in rows:
            fail(f"{path}:{line_number}: duplicate year {year}")
        if row.get("disposition") not in ALLOWED_DISPOSITIONS:
            fail(f"{path}:{line_number}: unresolved disposition for {year}")
        for field in ("title", "artist", "source", "sourceUrl"):
            if not str(row.get(field) or "").strip():
                fail(f"{path}:{line_number}: {year} is missing {field}")
        if row.get("rank") != 1:
            fail(f"{path}:{line_number}: {year} is not rank 1")
        rows[year] = row
    missing = sorted(YEARS - set(rows))
    if missing:
        fail(f"candidate artifact is missing {len(missing)} years: {missing}")
    return rows

def merge(catalogue: dict, candidates: dict[int, dict]) -> dict[str, int]:
    try:
        buckets = catalogue["modes"]["number1_au"]
    except KeyError:
        fail("catalogue has no number1_au mode")
    substantive = 0
    for year in sorted(YEARS):
        bucket = buckets.get(str(year))
        if not isinstance(bucket, list) or len(bucket) != 1:
            fail(f"catalogue number1_au {year} must contain exactly one row")
        candidate = candidates[year]
        song = bucket[0]
        song["title"] = str(song.get("title") or "").strip()
        song["artist"] = str(song.get("artist") or "").strip()
        if candidate["disposition"] == "substantive_correction":
            substantive += 1
            song["title"] = candidate["title"].strip()
            song["artist"] = candidate["artist"].strip()
            for field in IDENTITY_FIELDS:
                song.pop(field, None)
        song.update({
            "year": year,
            "chartYear": year,
            "chartRank": 1,
            "source": "australia-eoy-1",
            "sourceLabel": "Australian year-end #1",
            "evidenceState": "externally_observed",
            "evidenceDisposition": candidate["disposition"],
            "sourceProvider": candidate["source"],
            "sourceUrl": candidate["sourceUrl"],
            "sourceTitle": candidate["title"].strip(),
            "sourceArtist": candidate["artist"].strip(),
        })
        optional = {
            "sourcePageId": candidate.get("pageId"),
            "sourceRevisionId": candidate.get("revisionId"),
            "sourceRevisionTimestamp": candidate.get("revisionTimestamp"),
        }
        for field, value in optional.items():
            if value is None:
                song.pop(field, None)
            else:
                song[field] = value
    catalogue.setdefault("coverage", {})["number1_au"] = 73
    return {"rows": len(candidates), "substantiveCorrections": substantive}

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("candidates", type=Path)
    parser.add_argument("--catalogue", type=Path, default=DEFAULT_CATALOGUE)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    candidates = load_candidates(args.candidates)
    catalogue = json.loads(args.catalogue.read_text(encoding="utf-8"))
    report = merge(catalogue, candidates)
    if args.write:
        catalogue["version"] = max(int(catalogue.get("version") or 0) + 1, 7)
        catalogue["generatedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
        args.catalogue.write_text(
            json.dumps(catalogue, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
    print(json.dumps({**report, "write": args.write}, sort_keys=True))

if __name__ == "__main__":
    main()
