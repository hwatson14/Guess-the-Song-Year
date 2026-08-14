#!/usr/bin/env python3
"""Validate the staged canonical song universe.

This validates the source-of-truth CSV + manifest only. The legacy runtime still
uses data/catalogue.json until a later migration switches selection behaviour.
"""
import csv
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
MANIFEST = DATA_DIR / "song-universe-manifest.json"
SONGS = DATA_DIR / "song-universe.csv"

VERSION_ANNOTATION = re.compile(
    r"\b(?:karaoke|tribute|demo|live|remix|re[- ]?mix|mix|edit|version|recording|master|radio|"
    r"acoustic|unplugged|a cappella|acapella|backing(?: track)?|instrumental|bootleg|mashup|"
    r"remaster(?:ed)?(?:\s*\d{4})?|radio edit|radio version|single edit|single version|"
    r"album version|extended(?: version| edit| mix)?|club mix|dance mix|original mix|"
    r"sped up|slowed|re[- ]?record(?:ed)?|take\s*\d+|clean version)\b",
    re.I,
)
STRONG_TRAILING_VERSION = re.compile(
    r"\b(?:remix|re[- ]?mix|remaster(?:ed)?(?:\s*\d{4})?|radio edit|radio version|"
    r"single edit|single version|album version|extended(?: version| edit| mix)?|club mix|"
    r"dance mix|original mix|acoustic(?: version)?|unplugged|live version|"
    r"instrumental(?: version)?|a cappella|acapella|sped up|slowed|"
    r"re[- ]?record(?:ed)?|clean version)\s*$",
    re.I,
)

REQUIRED_COLUMNS = {
    "id", "canonicalKey", "title", "artist", "primaryArtist", "year", "era",
    "yearConfidence", "yearSource", "needsYearReview", "selectionScore", "sources",
    "spotifyId", "spotifyPopularity", "reviewFlags",
}

def fail(msg):
    raise SystemExit(f"song-universe validation failed: {msg}")

def norm(v):
    return re.sub(
        r"[^a-z0-9]+", " ",
        unicodedata.normalize("NFKD", str(v or "")).encode("ascii", "ignore").decode().lower(),
    ).strip()

def primary_artist(v):
    s = str(v or "").strip()
    s = re.split(r"\s+(?:feat\.?|ft\.?|featuring|with)\s+", s, maxsplit=1, flags=re.I)[0]
    n = norm(s)
    return n[4:] if n.startswith("the ") else n

def as_bool(v):
    return str(v).strip().lower() in {"true", "1", "yes"}

def is_alternate_title(title):
    s = str(title or "").strip()
    for left, right in re.findall(r"\(([^)]*)\)|\[([^]]*)\]", s):
        if VERSION_ANNOTATION.search(left or right):
            return True
    suffix = re.search(r"\s[-–—:]\s(.+)$", s)
    if suffix and VERSION_ANNOTATION.search(suffix.group(1)):
        return True
    return bool(STRONG_TRAILING_VERSION.search(s))

def main():
    for path in (MANIFEST, SONGS):
        if not path.exists():
            fail(f"{path.relative_to(ROOT)} missing")

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if manifest.get("version") != 1:
        fail(f"manifest version 1 required, got {manifest.get('version')}")
    if manifest.get("status") not in {"provisional", "verified"}:
        fail("manifest status must be provisional or verified")
    if manifest.get("runtimeActive") is not False:
        fail("staged universe must remain runtimeActive=false until migration")
    if manifest.get("songsFile") != "song-universe.csv":
        fail("manifest songsFile must be song-universe.csv")

    with SONGS.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        missing = REQUIRED_COLUMNS - set(reader.fieldnames or [])
        if missing:
            fail(f"CSV missing columns: {sorted(missing)}")
        songs = list(reader)

    if len(songs) != 1000:
        fail(f"exactly 1000 songs required, found {len(songs)}")

    ids, keys, spotify = set(), set(), set()
    artists, years, confidence = Counter(), Counter(), Counter()
    review = 0

    for i, song in enumerate(songs, start=2):
        label = f"song-universe.csv row {i}"
        for field in ("id", "canonicalKey", "title", "artist", "primaryArtist", "year", "era", "yearConfidence", "yearSource"):
            if not str(song.get(field) or "").strip():
                fail(f"{label} missing {field}")

        sid = song["id"].strip()
        if not re.fullmatch(r"song_[0-9a-f]{12}", sid):
            fail(f"{label} invalid id {sid!r}")
        if sid in ids:
            fail(f"duplicate id {sid}")
        ids.add(sid)

        key = song["canonicalKey"].strip()
        if key in keys:
            fail(f"duplicate canonicalKey {key!r}")
        keys.add(key)

        year = int(song["year"])
        if not 1920 <= year <= 2026:
            fail(f"{label} year out of range: {year}")
        years[year] += 1

        conf = song["yearConfidence"].strip()
        if conf not in {"High", "Medium", "Proxy", "Low"}:
            fail(f"{label} invalid yearConfidence {conf!r}")
        confidence[conf] += 1

        flags = [x for x in song.get("reviewFlags", "").split("|") if x]
        needs_review = as_bool(song.get("needsYearReview"))
        if conf in {"Proxy", "Low"} and not needs_review:
            fail(f"{label} {conf} year must be needsYearReview=true")
        if flags and not needs_review:
            fail(f"{label} has reviewFlags but needsYearReview=false")
        review += int(needs_review)

        if is_alternate_title(song["title"]):
            fail(f"{label} explicit alternate/version title: {song['title']!r}")

        sp = song.get("spotifyId", "").strip()
        if sp:
            if not re.fullmatch(r"[A-Za-z0-9]{22}", sp):
                fail(f"{label} malformed Spotify track id {sp!r}")
            if sp in spotify:
                fail(f"duplicate Spotify id {sp}")
            spotify.add(sp)

        score = float(song["selectionScore"])
        if not 0 <= score <= 100:
            fail(f"{label} selectionScore outside 0–100: {score}")
        artists[primary_artist(song["primaryArtist"])] += 1

    cap = int(manifest.get("selectionPolicy", {}).get("artistSoftCap", 6))
    max_artist = max(artists.values())
    if max_artist > cap:
        fail(f"artist cap exceeded: {max_artist} > {cap}")

    stats = manifest.get("stats") or {}
    checks = {
        "songs": len(songs),
        "needsYearReview": review,
        "spotifyIds": len(spotify),
        "maxSongsPerPrimaryArtist": max_artist,
    }
    for key, actual in checks.items():
        if stats.get(key) != actual:
            fail(f"stats.{key}={stats.get(key)!r} but counted {actual}")
    if stats.get("yearConfidence") != dict(confidence):
        fail(f"stats.yearConfidence mismatch: {stats.get('yearConfidence')} vs {dict(confidence)}")

    alias_keys = Counter(norm(s["title"]) for s in songs)
    for title in ("Purple Rain", "Anarchy in the U.K."):
        if alias_keys[norm(title)] > 1:
            fail(f"known alias regression duplicated {title!r}")

    for genuine in ("Live and Let Die", "How Am I Supposed to Live Without You", "Dancing with a Stranger", "Radio Ga Ga"):
        if is_alternate_title(genuine):
            fail(f"alternate-version detector falsely rejects genuine title: {genuine}")

    print("song universe validated:", {
        "songs": len(songs), "years": len(years), "spotifyIds": len(spotify),
        "yearConfidence": dict(confidence), "needsYearReview": review,
        "maxSongsPerPrimaryArtist": max_artist,
    })

if __name__ == "__main__":
    main()
