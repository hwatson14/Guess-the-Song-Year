#!/usr/bin/env python3
"""Conservatively match the One Hit Wonders seed against canonical song masters.

This script never mutates production data. Exact/relaxed matches are diagnostic only;
production promotion still requires qualification and release/provider review.
"""
from __future__ import annotations

import csv
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "song-database.json"
SEED_PATH = ROOT / "verification" / "mode-expansion" / "one-hit-wonders-seed.csv"
REPORT_PATH = ROOT / "verification" / "mode-expansion" / "one-hit-wonders-match-report.csv"
SUMMARY_PATH = ROOT / "verification" / "mode-expansion" / "one-hit-wonders-match-summary.json"


def norm(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = text.encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def primary_artist(value: object) -> str:
    text = str(value or "").strip()
    text = re.split(r"\s+(?:feat\.?|ft\.?|featuring|with)\s+", text, maxsplit=1, flags=re.I)[0]
    text = re.split(r"\s+(?:and|&)\s+", text, maxsplit=1, flags=re.I)[0]
    return norm(text).removeprefix("the ")


def token_similarity(a: object, b: object) -> float:
    aa, bb = set(norm(a).split()), set(norm(b).split())
    if not aa or not bb:
        return 0.0
    return len(aa & bb) / max(len(aa), len(bb))


def providers(song: dict) -> tuple[str, str]:
    def state(provider: str) -> str:
        data = song.get("providers", {}).get(provider, {}) or {}
        if data.get("preferredId"):
            return "preferred"
        if data.get("links"):
            return "candidate"
        return "missing"
    return state("spotify"), state("youtube")


def main() -> None:
    db = json.loads(DB_PATH.read_text(encoding="utf-8"))
    songs = list((db.get("songs") or {}).values())
    memberships = db.get("memberships") or []

    membership_modes: dict[str, set[str]] = defaultdict(set)
    for m in memberships:
        membership_modes[str(m.get("songId") or "")].add(str(m.get("mode") or ""))

    exact: dict[str, list[dict]] = defaultdict(list)
    relaxed: dict[str, list[dict]] = defaultdict(list)
    title_only: dict[str, list[dict]] = defaultdict(list)
    for song in songs:
        exact[f"{norm(song.get('title'))}|{norm(song.get('artist'))}"].append(song)
        relaxed[f"{norm(song.get('title'))}|{primary_artist(song.get('artist'))}"].append(song)
        title_only[norm(song.get("title"))].append(song)

    seed_rows = list(csv.DictReader(SEED_PATH.open(encoding="utf-8", newline="")))
    output: list[dict] = []

    for seed in seed_rows:
        title, artist = seed["title"], seed["artist"]
        candidates = exact.get(f"{norm(title)}|{norm(artist)}", [])
        state = "exact" if len(candidates) == 1 else ""

        if not state:
            candidates = relaxed.get(f"{norm(title)}|{primary_artist(artist)}", [])
            state = "relaxed_artist" if len(candidates) == 1 else ""

        if not state:
            title_candidates = title_only.get(norm(title), [])
            plausible = [s for s in title_candidates if token_similarity(s.get("artist"), artist) >= 0.45]
            if len(plausible) == 1:
                candidates = plausible
                state = "title_artist_candidate"
            elif len(plausible) > 1 or len(title_candidates) > 1:
                candidates = plausible or title_candidates
                state = "ambiguous"
            else:
                candidates = []
                state = "unmatched"

        song = candidates[0] if len(candidates) == 1 else None
        spotify_state, youtube_state = providers(song or {})
        release = (song or {}).get("release", {}) or {}
        output.append({
            **seed,
            "match_state": state,
            "candidate_count": len(candidates),
            "song_id": (song or {}).get("id", ""),
            "canonical_title": (song or {}).get("title", ""),
            "canonical_artist": (song or {}).get("artist", ""),
            "answer_year": release.get("answerYear", ""),
            "release_state": release.get("state", ""),
            "existing_modes": ";".join(sorted(membership_modes.get(str((song or {}).get("id", "")), set()))),
            "spotify_state": spotify_state,
            "youtube_state": youtube_state,
        })

    fieldnames = list(output[0].keys()) if output else []
    with REPORT_PATH.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(output)

    match_counts = Counter(r["match_state"] for r in output)
    priority_counts = Counter(r["priority"] for r in output)
    strict = [r for r in output if r["match_state"] in {"exact", "relaxed_artist"}]
    strict_core = [r for r in strict if r["priority"] == "core"]
    strict_years = sorted({int(r["answer_year"]) for r in strict if str(r["answer_year"]).isdigit()})
    strict_core_years = sorted({int(r["answer_year"]) for r in strict_core if str(r["answer_year"]).isdigit()})

    summary = {
        "seedRows": len(output),
        "databaseSongs": len(songs),
        "priorityCounts": dict(sorted(priority_counts.items())),
        "matchCounts": dict(sorted(match_counts.items())),
        "strictMatches": len(strict),
        "strictCoreMatches": len(strict_core),
        "strictReleaseYearCoverage": len(strict_years),
        "strictReleaseYears": strict_years,
        "strictCoreReleaseYearCoverage": len(strict_core_years),
        "strictCoreReleaseYears": strict_core_years,
        "unmatchedOrAmbiguous": sum(1 for r in output if r["match_state"] in {"unmatched", "ambiguous"}),
        "candidateOnly": sum(1 for r in output if r["match_state"] == "title_artist_candidate"),
        "note": "Exact/relaxed matching is diagnostic only. Qualification, release evidence and provider review remain separate gates."
    }
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
