#!/usr/bin/env python3
"""Merge a reviewed US Billboard year-end #1 artifact into the catalogue."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOGUE = ROOT / "data" / "catalogue.json"
YEARS = set(range(1950, 2023))
DISPOSITIONS = {"exact", "expanded_double_sided"}

def fail(message: str) -> None:
    raise SystemExit(message)

def load_rows(path: Path) -> dict[int, dict]:
    rows: dict[int, dict] = {}
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        year = row.get("year")
        if year not in YEARS or year in rows:
            fail(f"{path}:{line_number}: invalid or duplicate year {year!r}")
        if row.get("disposition") not in DISPOSITIONS:
            fail(f"{path}:{line_number}: unresolved disposition for {year}")
        if row.get("chartRank") != 1 or row.get("chartYear") != year:
            fail(f"{path}:{line_number}: {year} is not the annual rank-one row")
        for field in ("title", "artist", "sourceName", "sourceUrl", "retrievalDate"):
            if not str(row.get(field) or "").strip():
                fail(f"{path}:{line_number}: {year} is missing {field}")
        rows[year] = row
    missing = sorted(YEARS - set(rows))
    if missing:
        fail(f"artifact is missing {len(missing)} years: {missing}")
    return rows

def merge(catalogue: dict, rows: dict[int, dict]) -> dict[str, int]:
    buckets = catalogue["modes"]["number1_us"]
    expanded = 0
    for year in sorted(YEARS):
        bucket = buckets.get(str(year))
        if not isinstance(bucket, list) or len(bucket) != 1:
            fail(f"catalogue number1_us {year} must contain exactly one row")
        row = rows[year]
        song = bucket[0]
        song["title"] = str(song.get("title") or "").strip()
        song["artist"] = str(song.get("artist") or "").strip()
        if row["disposition"] == "expanded_double_sided":
            expanded += 1
        song.update({
            "year": year,
            "chartYear": year,
            "chartRank": 1,
            "source": "billboard-eoy-1",
            "sourceLabel": "Billboard year-end #1",
            "evidenceState": "externally_observed",
            "evidenceDisposition": row["disposition"],
            "sourceProvider": row["sourceName"],
            "sourceUrl": row["sourceUrl"],
            "sourceTitle": row["title"].strip(),
            "sourceArtist": row["artist"].strip(),
            "sourceRow": row.get("sourceRow"),
            "sourceRetrievalDate": row["retrievalDate"],
        })
        for field in ("evidenceLabel", "playablePolicy", "sourceSides"):
            if field in row:
                song[field] = row[field]
            else:
                song.pop(field, None)
    catalogue.setdefault("coverage", {})["number1_us"] = 73
    return {"rows": len(rows), "expandedDoubleSided": expanded}

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("candidates", type=Path)
    parser.add_argument("--catalogue", type=Path, default=DEFAULT_CATALOGUE)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()
    catalogue = json.loads(args.catalogue.read_text(encoding="utf-8"))
    report = merge(catalogue, load_rows(args.candidates))
    if args.write:
        catalogue["version"] = int(catalogue.get("version") or 0) + 1
        catalogue["generatedAt"] = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
        args.catalogue.write_text(json.dumps(catalogue, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({**report, "write": args.write}, sort_keys=True))

if __name__ == "__main__":
    main()
