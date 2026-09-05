#!/usr/bin/env python3
"""Validate every catalogue mode according to its declared readiness status."""

import ast
import json
import re
from collections import Counter
from pathlib import Path

try:
    from .validate_catalogue import is_alternate_title
except ImportError:
    from validate_catalogue import is_alternate_title


ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = ROOT / "data" / "catalogue.json"
SCHEMA = ROOT / "data" / "catalogue.schema.json"
MANIFEST = ROOT / "data" / "modes.json"
ENGINE = ROOT / "engine.js"
GUARD = ROOT / "engine-v7.js"
APP = ROOT / "app.js"
VALID_STATUSES = {"ready", "beta", "preview", "building"}
STATUS_LABELS = {"ready": "Ready", "beta": "Beta", "preview": "Preview", "building": "Building"}
VALID_YEAR_BASES = {"release", "chart"}
VALID_REPEAT_POLICIES = {"unique", "fixed"}


def fail(message):
    raise SystemExit(f"catalogue validation failed: {message}")


def load_year_map():
    text = ENGINE.read_text(encoding="utf-8")
    match = re.search(r"const YEAR_MAP=(\[[^;]+\]);", text)
    if not match:
        fail("YEAR_MAP not found in engine.js")
    values = ast.literal_eval(re.sub(r"\bnull\b", "None", match.group(1)))
    if len(values) != 309:
        fail(f"YEAR_MAP must contain null + 308 cards, found {len(values)} entries")
    return values


def duplicate_count(songs, field):
    seen = set()
    duplicates = 0
    for song in songs:
        value = str(song.get(field) or "").strip()
        if not value:
            continue
        if value in seen:
            duplicates += 1
        seen.add(value)
    return duplicates


def main():
    for path in (CATALOGUE, SCHEMA, MANIFEST):
        if not path.exists():
            fail(f"{path.relative_to(ROOT)} is missing")

    data = json.loads(CATALOGUE.read_text(encoding="utf-8"))
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        fail("catalogue root must be an object")
    if type(data.get("version")) is not int or data["version"] < 6:
        fail("catalogue version must be an integer >= 6")
    if "generatedAt" in data and not isinstance(data["generatedAt"], str):
        fail("generatedAt must be a string")
    expected_years = list(range(1950, 2023))
    if "years" in data and data["years"] != expected_years:
        fail("years must contain each integer from 1950 through 2022 exactly once")
    for field in ("coverage", "poolStats", "sources"):
        if field in data and not isinstance(data[field], dict):
            fail(f"{field} must be an object")
    if not isinstance(manifest, dict) or type(manifest.get("version")) is not int:
        fail("mode manifest must be a versioned object")
    catalogue_modes = data.get("modes")
    declared_modes = manifest.get("modes")
    if not isinstance(catalogue_modes, dict) or not isinstance(declared_modes, dict):
        fail("catalogue modes and manifest modes must be objects")

    if schema.get("title") != "Guess the Song Year prebuilt catalogue":
        fail("unexpected catalogue schema")
    if set(catalogue_modes) != set(declared_modes):
        fail(
            "catalogue and mode manifest disagree: "
            f"catalogue={sorted(catalogue_modes)}, manifest={sorted(declared_modes)}"
        )

    year_map = load_year_map()
    required_years = set(int(year) for year in year_map[1:] if year)
    card_counts = Counter(int(year) for year in year_map[1:] if year)
    if required_years != set(range(1950, 2023)):
        fail("card map must cover every year 1950-2022")

    reports = {}
    for mode_id, meta in declared_modes.items():
        status = str(meta.get("status") or "")
        if status not in VALID_STATUSES:
            fail(f"{mode_id} has invalid status {status!r}")
        if not isinstance(meta, dict):
            fail(f"{mode_id} metadata is not an object")
        for field in ("name", "short", "desc", "statusLabel", "statusNote", "yearBasis", "repeatPolicy"):
            if not isinstance(meta.get(field), str) or not meta[field].strip():
                fail(f"{mode_id} is missing mode metadata {field}")
        if meta["statusLabel"] != STATUS_LABELS[status]:
            fail(f"{mode_id} statusLabel must be {STATUS_LABELS[status]!r}")
        if meta["yearBasis"] not in VALID_YEAR_BASES:
            fail(f"{mode_id} has invalid yearBasis {meta['yearBasis']!r}")
        if meta["repeatPolicy"] not in VALID_REPEAT_POLICIES:
            fail(f"{mode_id} has invalid repeatPolicy {meta['repeatPolicy']!r}")
        if (meta["yearBasis"] == "chart") != (meta["repeatPolicy"] == "fixed"):
            fail(f"{mode_id} chart modes must use the fixed repeat policy, and only chart modes may use it")

        buckets = catalogue_modes.get(mode_id)
        if not isinstance(buckets, dict):
            fail(f"{mode_id} catalogue is not an object")
        years = set()
        songs = []
        alternate_labels = 0
        missing_canonical = 0
        for raw_year, pool in buckets.items():
            try:
                year = int(raw_year)
            except ValueError:
                fail(f"{mode_id} has invalid year key {raw_year!r}")
            if year not in required_years:
                fail(f"{mode_id} contains unsupported year {year}")
            if not isinstance(pool, list) or not pool:
                fail(f"{mode_id} {year} has no playable songs")
            years.add(year)
            for index, song in enumerate(pool):
                if not isinstance(song, dict):
                    fail(f"{mode_id} {year}[{index}] is not an object")
                if not isinstance(song.get("title"), str) or not song["title"].strip():
                    fail(f"{mode_id} {year}[{index}] is missing a string title")
                if not isinstance(song.get("artist"), str) or not song["artist"].strip():
                    fail(f"{mode_id} {year}[{index}] is missing a string artist")
                title = song["title"].strip()
                if type(song.get("year")) is not int or song["year"] != year:
                    fail(f"{mode_id} {year}[{index}] declares year {song.get('year')!r}")
                for field in ("canonicalKey", "yearEvidence", "musicbrainzId", "musicbrainzMatchedTitle", "musicbrainzMatchedArtist", "spotifyId", "youtubeId", "source", "sourceLabel"):
                    if field in song and not isinstance(song[field], str):
                        fail(f"{mode_id} {year}[{index}] {field} must be a string")
                for field in ("chartYear", "chartRank"):
                    if field in song and type(song[field]) is not int:
                        fail(f"{mode_id} {year}[{index}] {field} must be an integer")
                for field in ("mbScore", "titleSimilarity", "artistSimilarity"):
                    if field in song and (not isinstance(song[field], (int, float)) or isinstance(song[field], bool)):
                        fail(f"{mode_id} {year}[{index}] {field} must be a number")
                if is_alternate_title(title):
                    alternate_labels += 1
                if not (
                    song.get("canonicalKey")
                    and song.get("musicbrainzId")
                    and song.get("yearEvidence") == "MusicBrainz recording earliest first-release-date"
                ):
                    missing_canonical += 1
                if meta["yearBasis"] == "chart" and int(song.get("chartYear") or 0) != year:
                    fail(f"{mode_id} {year}[{index}] must identify chartYear {year}")
                songs.append(song)

        coverage = len(years)
        if int((data.get("coverage") or {}).get(mode_id, coverage)) != coverage:
            fail(f"{mode_id} coverage metadata does not match its buckets")
        missing_years = sorted(required_years - years)
        min_pool = min((len(buckets[str(year)]) for year in years), default=0)
        duplicate_spotify = duplicate_count(songs, "spotifyId")
        duplicate_youtube = duplicate_count(songs, "youtubeId")
        duplicate_canonical = duplicate_count(songs, "canonicalKey")
        duplicate_musicbrainz = duplicate_count(songs, "musicbrainzId")

        if meta["repeatPolicy"] == "fixed":
            if missing_years:
                fail(f"{mode_id} fixed chart mode is missing {len(missing_years)} years")
            if any(len(buckets[str(year)]) != 1 for year in years):
                fail(f"{mode_id} fixed chart mode must contain exactly one leader per year")

        if status == "ready":
            if missing_years:
                fail(f"ready mode {mode_id} is missing {len(missing_years)} years")
            if missing_canonical:
                fail(f"ready mode {mode_id} has {missing_canonical} songs without canonical evidence")
            if alternate_labels:
                fail(f"ready mode {mode_id} has {alternate_labels} alternate-version labels")
            if duplicate_spotify or duplicate_youtube:
                fail(f"ready mode {mode_id} contains duplicate playback IDs")
            if duplicate_canonical or duplicate_musicbrainz:
                fail(f"ready mode {mode_id} contains duplicate canonical identities")
            if mode_id == "greatest":
                shallow = [year for year in years if len(buckets[str(year)]) < max(12, card_counts[year])]
                if shallow:
                    fail(f"ready Greatest Hits has insufficient distinct songs in {len(shallow)} years")
            if meta["yearBasis"] == "chart":
                for song in songs:
                    if song.get("chartRank") != 1 or not str(song.get("source") or "").endswith("eoy-1") or not str(song.get("sourceLabel") or "").strip():
                        fail(f"ready chart mode {mode_id} requires rank-1 source evidence for every leader")

        reports[mode_id] = {
            "status": meta["statusLabel"],
            "coverage": f"{coverage}/73",
            "songs": len(songs),
            "minPool": min_pool,
            "missingCanonical": missing_canonical,
            "duplicateSpotify": duplicate_spotify,
            "alternateLabels": alternate_labels,
        }

    app = APP.read_text(encoding="utf-8")
    guard = GUARD.read_text(encoding="utf-8")
    for token in ("data-mode-picker", "function modeId()", "virtualCardsForMode", "modeReports"):
        if token not in app + guard:
            fail(f"multi-mode runtime token missing: {token}")
    for forbidden in ("const MODE='greatest'", "E.MODES={greatest}", "modeFallbacks"):
        if forbidden in app + guard:
            fail(f"obsolete single-mode/fallback token remains: {forbidden}")
    if "MODE_YEAR_UNAVAILABLE" not in guard:
        fail("sparse modes must report MODE_YEAR_UNAVAILABLE")

    print(f"Catalogue v{data.get('version')} mode status:")
    for mode_id in declared_modes:
        print(f"  {mode_id}: {reports[mode_id]}")


if __name__ == "__main__":
    main()
