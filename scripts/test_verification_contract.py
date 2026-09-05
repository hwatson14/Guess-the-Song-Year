#!/usr/bin/env python3
"""Assert that unresolved physical-card years cannot be promoted accidentally."""

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VERIFY = ROOT / "verification"


def csv_rows(name: str) -> list[dict[str, str]]:
    with (VERIFY / name).open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


ledger = csv_rows("card_year_verification_ledger.csv")
assert len(ledger) == 308
assert [int(row["card_id"]) for row in ledger] == list(range(1, 309))
assert all(not row["authoritative_observed_year"].strip() for row in ledger)

capture = csv_rows("physical_card_capture_template.csv")
assert len(capture) == 308
assert [int(row["card_id"]) for row in capture] == list(range(1, 309))

proposal = json.loads((VERIFY / "proposed_year_map.json").read_text(encoding="utf-8"))
assert proposal["safeToApplyAutomatically"] is False
assert proposal["yearMap"] is None
assert proposal["authoritativeObservedYearCount"] == 0
assert proposal["unresolvedCardIds"] == list(range(1, 309))

print("physical-card evidence boundary regression tests passed")
