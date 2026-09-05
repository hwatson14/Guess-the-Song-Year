#!/usr/bin/env python3
"""Block production deployment until every printed card year is evidenced."""

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VERIFY = ROOT / "verification"
proposal = json.loads((VERIFY / "proposed_year_map.json").read_text(encoding="utf-8"))

if proposal.get("safeToApplyAutomatically") is not True or proposal.get("yearMap") is None:
    raise SystemExit(
        "production deployment blocked: the 308 printed physical-card years are still unresolved; "
        "complete verification/physical_card_capture_template.csv and approve an evidence-backed YEAR_MAP"
    )

with (VERIFY / "card_year_verification_ledger.csv").open(encoding="utf-8-sig", newline="") as handle:
    rows = list(csv.DictReader(handle))

if len(rows) != 308:
    raise SystemExit(f"production deployment blocked: expected 308 verification rows, found {len(rows)}")

observed = [row.get("authoritative_observed_year", "").strip() for row in rows]
if any(not value.isdigit() for value in observed):
    raise SystemExit("production deployment blocked: every card needs an authoritative observed year")

expected = [None, *(int(value) for value in observed)]
if proposal["yearMap"] != expected:
    raise SystemExit("production deployment blocked: approved yearMap does not match the evidence ledger")

print("verified physical-card production gate passed")
