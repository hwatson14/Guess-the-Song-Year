#!/usr/bin/env python3
"""Fetch the best public ordered-identity evidence available without Spotify OAuth.

Spotify's February 2026 API changes no longer expose another owner's playlist
items through the Web API.  The public embed still exposes the first 100 rows.
This script cross-checks those 100 official rows against the fully numbered
Bopster import and retains an explicit lower evidence tier for rows 101..308.
"""

from __future__ import annotations

import html
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "verification" / "sources" / "official_uk_playlist.json"
PLAYLIST_ID = "0Mpj1KwRmY2pHzmj7mfbdh"
OFFICIAL_FAQ = "https://hitstergame.com/en-gb/faq/"
OFFICIAL_PLAYLIST = f"https://open.spotify.com/playlist/{PLAYLIST_ID}"
SPOTIFY_EMBED = f"https://open.spotify.com/embed/playlist/{PLAYLIST_ID}"
BOPSTER = "https://bopster.app/en/playlist?id=4450"
USER_AGENT = "GuessSongYearCardAudit/1.0"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def norm(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def get(session: requests.Session, url: str) -> str:
    response = session.get(url, timeout=60)
    response.raise_for_status()
    return response.text


def parse_bopster(body: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(body, "html.parser")
    heading = next((h for h in soup.find_all("h2") if h.get_text(" ", strip=True) == "Tracklist"), None)
    if not heading:
        raise RuntimeError("Bopster Tracklist heading not found")
    container = heading.find_next("div", class_=lambda value: value and "space-y-3" in value)
    if not container:
        raise RuntimeError("Bopster track container not found")

    tracks: list[dict[str, Any]] = []
    for row in container.find_all("div", recursive=False):
        number_node = row.find("div", class_=lambda value: value and "font-mono" in value)
        paragraphs = row.find_all("p")
        link = row.find("a", href=re.compile(r"open\.spotify\.com/track/"))
        if not number_node or len(paragraphs) < 2 or not link:
            continue
        position_text = number_node.get_text(" ", strip=True)
        if not position_text.isdigit():
            continue
        artist_node = paragraphs[1]
        year_node = artist_node.find("span")
        displayed_year = None
        if year_node:
            match = re.search(r"(\d{4})", year_node.get_text(" ", strip=True))
            displayed_year = int(match.group(1)) if match else None
            year_node.extract()
        artist = artist_node.get_text(" ", strip=True)
        track_match = re.search(r"open\.spotify\.com/track/([A-Za-z0-9]+)", link["href"])
        tracks.append(
            {
                "position": int(position_text),
                "spotifyTrackId": track_match.group(1),
                "spotifyUri": f"spotify:track:{track_match.group(1)}",
                "title": paragraphs[0].get_text(" ", strip=True),
                "artists": [artist],
                "album": "",
                "spotifyAlbumReleaseDate": "",
                "spotifyUrl": f"https://open.spotify.com/track/{track_match.group(1)}",
                "bopsterDisplayedYear": displayed_year,
                "orderedIdentityEvidence": "community_bopster_numbered_import",
            }
        )
    if len(tracks) != 308:
        raise RuntimeError(f"Expected 308 Bopster tracks, found {len(tracks)}")
    if [row["position"] for row in tracks] != list(range(1, 309)):
        raise RuntimeError("Bopster positions are not contiguous 1..308")
    return tracks


def walk_lists(value: Any):
    if isinstance(value, list):
        yield value
        for item in value:
            yield from walk_lists(item)
    elif isinstance(value, dict):
        for item in value.values():
            yield from walk_lists(item)


def parse_official_embed(body: str) -> list[dict[str, Any]]:
    match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', body, re.S)
    if not match:
        raise RuntimeError("Spotify embed __NEXT_DATA__ not found")
    state = json.loads(html.unescape(match.group(1)))
    candidates = []
    for values in walk_lists(state):
        if values and all(
            isinstance(row, dict)
            and str(row.get("uri") or "").startswith("spotify:track:")
            and row.get("title")
            for row in values
        ):
            candidates.append(values)
    if not candidates:
        raise RuntimeError("No ordered Spotify track list found in public embed")
    values = max(candidates, key=len)
    return [
        {
            "position": index,
            "spotifyTrackId": row["uri"].split(":")[-1],
            "title": row.get("title") or "",
            "artist": row.get("subtitle") or "",
        }
        for index, row in enumerate(values, 1)
    ]


def main() -> int:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    bopster = parse_bopster(get(session, BOPSTER))
    official = parse_official_embed(get(session, SPOTIFY_EMBED))
    if len(official) != 100:
        raise RuntimeError(f"Expected current public embed limit of 100, found {len(official)}")

    mismatches: list[dict[str, Any]] = []
    for direct, community in zip(official, bopster):
        fields = {
            "spotifyTrackId": direct["spotifyTrackId"] == community["spotifyTrackId"],
            "title": norm(direct["title"]) == norm(community["title"]),
            "artist": norm(direct["artist"]).startswith(norm(community["artists"][0])),
        }
        if not all(fields.values()):
            mismatches.append(
                {"position": direct["position"], "fields": fields, "official": direct, "community": community}
            )
        else:
            community["orderedIdentityEvidence"] = "official_spotify_embed_direct_and_bopster_match"
    if mismatches:
        raise RuntimeError(f"Official/Bopster first-100 mismatch: {json.dumps(mismatches[:3], ensure_ascii=False)}")

    result = {
        "fetchedAt": now_iso(),
        "authority": "Tiered ordered identity evidence for HITSTER UK",
        "faqUrl": OFFICIAL_FAQ,
        "playlistUrl": OFFICIAL_PLAYLIST,
        "playlistId": PLAYLIST_ID,
        "market": "AU",
        "fullOrderCrossCheckUrl": BOPSTER,
        "officialDirectRows": len(official),
        "communityOnlyRows": len(bopster) - len(official),
        "importantLimitation": (
            "Rows 1..100 match Spotify's official public embed directly. Rows 101..308 come from "
            "the numbered Bopster import because Spotify's February 2026 API restrictions hide "
            "another owner's remaining playlist items. Playlist position -> physical card ID is "
            "not explicitly documented by Jumbo and is not a physical-card observation."
        ),
        "tracks": bopster,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(bopster)} rows; {len(official)} official direct matches")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
