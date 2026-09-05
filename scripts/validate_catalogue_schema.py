#!/usr/bin/env python3
"""Apply the checked-in JSON Schema to the production catalogue."""

import json
from pathlib import Path

import jsonschema

ROOT = Path(__file__).resolve().parents[1]

schema = json.loads((ROOT / "data" / "catalogue.schema.json").read_text(encoding="utf-8"))
catalogue = json.loads((ROOT / "data" / "catalogue.json").read_text(encoding="utf-8"))
jsonschema.Draft202012Validator.check_schema(schema)
jsonschema.Draft202012Validator(schema).validate(catalogue)
print("catalogue schema and instance valid")
