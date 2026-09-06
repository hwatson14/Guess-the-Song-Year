#!/usr/bin/env python3
"""Resolve staged One Hit Wonders against recording-level release evidence.

This is a verification-stage resolver. It does not mutate data/song-database.json.
Only core/expansion rows are resolved by default; disputed/recent rows stay held.
"""
from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from pathlib import Path

from build_catalogue_v10 import (
    bimmuda_lookup,
    canonical_display,
    confirm_release_year,
    underlying_key,
)

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "verification" / "mode-expansion" / "one-hit-wonders-seed.csv"
MATCH_REPORT = ROOT / "verification" / "mode-expansion" / "one-hit-wonders-match-report.csv"
OUT = ROOT / "verification" / "mode-expansion" / "one-hit-wonders-resolution-report.csv"
SUMMARY = ROOT / "verification" / "mode-expansion" / "one-hit-wonders-resolution-summary.json"


def norm(v: object) -> str:
    import re
    import unicodedata
    text = unicodedata.normalize("NFKD", str(v or ""))
    text = text.encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def row_key(title: object, artist: object) -> str:
    return f"{norm(title)}|{norm(artist)}"


def load_existing_matches() -> dict[str, dict]:
    if not MATCH_REPORT.exists():
        return {}
    rows = csv.DictReader(MATCH_REPORT.open(encoding="utf-8", newline=""))
    return {row_key(r.get("title"), r.get("artist")): r for r in rows}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--include-held",
        action="store_true",
        help="Also resolve review/review_recent rows. They remain ineligible for promotion.",
    )
    args = ap.parse_args()

    seed_rows = list(csv.DictReader(SEED.open(encoding="utf-8", newline="")))
    existing = load_existing_matches()
    playback_exact, playback_underlying = bimmuda_lookup()

    output: list[dict] = []
    for index, seed in enumerate(seed_rows, 1):
        priority = seed["priority"]
        should_resolve = priority in {"core", "expansion"} or args.include_held
        match = existing.get(row_key(seed["title"], seed["artist"]), {})
        resolved = None
        canonical_title = seed["title"]
        canonical_artist = seed["artist"]
        provider = {"spotifyId": "", "youtubeId": ""}
        state = "held" if not should_resolve else "unresolved"

        if should_resolve:
            resolved = confirm_release_year(seed)
            if resolved:
                canonical_title, canonical_artist = canonical_display(seed, resolved)
                state = "resolved"
                provider = (
                    playback_exact.get(row_key(seed["title"], seed["artist"]))
                    or playback_underlying.get(underlying_key(seed["title"], seed["artist"]))
                    or {"spotifyId": "", "youtubeId": ""}
                )

        answer_year = resolved.get("year", "") if resolved else ""
        in_game_range = bool(answer_year and 1950 <= int(answer_year) <= 2022)
        output.append({
            **seed,
            "resolution_state": state,
            "canonical_title": canonical_title,
            "canonical_artist": canonical_artist,
            "canonical_key": underlying_key(canonical_title, canonical_artist) if resolved else "",
            "answer_year": answer_year,
            "in_game_range": "yes" if in_game_range else "no" if answer_year else "",
            "year_evidence": "MusicBrainz recording earliest first-release-date" if resolved else "",
            "musicbrainz_id": resolved.get("musicbrainzId", "") if resolved else "",
            "musicbrainz_matched_title": resolved.get("musicbrainzMatchedTitle", "") if resolved else "",
            "musicbrainz_matched_artist": resolved.get("musicbrainzMatchedArtist", "") if resolved else "",
            "mb_score": resolved.get("mbScore", "") if resolved else "",
            "title_similarity": resolved.get("titleSimilarity", "") if resolved else "",
            "artist_similarity": resolved.get("artistSimilarity", "") if resolved else "",
            "existing_match_state": match.get("match_state", ""),
            "existing_song_id": match.get("song_id", ""),
            "existing_release_state": match.get("release_state", ""),
            "candidate_spotify_id": provider.get("spotifyId", ""),
            "candidate_youtube_id": provider.get("youtubeId", ""),
        })
        if index % 20 == 0:
            print(f"resolved {index}/{len(seed_rows)} seed rows", flush=True)

    with OUT.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(output[0].keys()))
        writer.writeheader()
        writer.writerows(output)

    active = [r for r in output if r["priority"] in {"core", "expansion"}]
    resolved_active = [r for r in active if r["resolution_state"] == "resolved"]
    resolved_core = [r for r in resolved_active if r["priority"] == "core"]
    summary = {
        "seedRows": len(output),
        "activeSeedRows": len(active),
        "coreSeedRows": sum(r["priority"] == "core" for r in output),
        "expansionSeedRows": sum(r["priority"] == "expansion" for r in output),
        "heldRows": sum(r["priority"] in {"review", "review_recent"} for r in output),
        "resolvedActive": len(resolved_active),
        "unresolvedActive": len(active) - len(resolved_active),
        "resolvedCore": len(resolved_core),
        "resolvedExpansion": len(resolved_active) - len(resolved_core),
        "resolvedInGameRange": sum(r["in_game_range"] == "yes" for r in resolved_active),
        "resolvedYearCoverage": len({int(r["answer_year"]) for r in resolved_active if r["in_game_range"] == "yes"}),
        "resolvedCoreYearCoverage": len({int(r["answer_year"]) for r in resolved_core if r["in_game_range"] == "yes"}),
        "existingMasterMatchesAmongResolved": sum(bool(r["existing_song_id"]) for r in resolved_active),
        "newMasterCandidatesAmongResolved": sum(not bool(r["existing_song_id"]) for r in resolved_active),
        "candidateSpotifyIds": sum(bool(r["candidate_spotify_id"]) for r in resolved_active),
        "candidateYouTubeIds": sum(bool(r["candidate_youtube_id"]) for r in resolved_active),
        "resolvedByPriority": dict(Counter(r["priority"] for r in resolved_active)),
        "note": "Release/provider resolution is not One Hit Wonder qualification. Candidate provider IDs remain unverified until provider-recording review.",
    }
    SUMMARY.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == "__main__":
    main()
