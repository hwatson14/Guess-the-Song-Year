"""Discover provider links attached to existing MusicBrainz recording claims.

This is proposal-only research: it never edits the song database or marks a
provider link verified. Requests are cached by recording id and rate limited
to protect the public MusicBrainz API.
"""
from __future__ import annotations

import argparse
import json
import re
import time
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATABASE = ROOT / "data" / "song-database.json"
OUT = ROOT / "output" / "expansion" / "recording-provider-links.json"
CACHE = ROOT / "output" / "expansion" / "recording-link-cache"
MB_RE = re.compile(r"https?://musicbrainz\.org/recording/([0-9a-f-]{36})(?:[/?#].*)?$", re.I)
SPOTIFY_RE = re.compile(r"^https?://open\.spotify\.com/track/([A-Za-z0-9]{22})(?:\?.*)?$", re.I)
YOUTUBE_RE = re.compile(r"^https?://(?:www\.)?youtube\.com/watch\?v=([A-Za-z0-9_-]{11})(?:[&#].*)?$", re.I)
YOUTU_BE_RE = re.compile(r"^https?://youtu\.be/([A-Za-z0-9_-]{11})(?:\?.*)?$", re.I)


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def provider_present(song, provider):
    return bool(song.get("providers", {}).get(provider, {}).get("links"))


def recording_claim(song):
    for claim in song.get("release", {}).get("claims", []):
        match = MB_RE.match(str(claim.get("sourceUrl", "")))
        if match:
            return match.group(1).lower(), match.group(0)
    return None, None


def fetch(recording_id, cache_path, session_state):
    if cache_path.exists():
        return read_json(cache_path), False
    url = f"https://musicbrainz.org/ws/2/recording/{recording_id}?inc=url-rels&fmt=json"
    last = None
    for attempt in range(4):
        if session_state["last_request"]:
            time.sleep(max(0, 1.1 - (time.monotonic() - session_state["last_request"])))
        session_state["last_request"] = time.monotonic()
        try:
            request = Request(url, headers={"User-Agent": "Guess-the-Song-Year/1.0 (research; https://github.com/hwatson14/Guess-the-Song-Year)", "Accept": "application/json"})
            with urlopen(request, timeout=25) as response:
                payload = json.loads(response.read().decode("utf-8"))
            cache_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
            return payload, True
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            last = exc
            transient = isinstance(exc, (URLError, TimeoutError)) or getattr(exc, "code", None) in {429, 500, 502, 503, 504}
            if not transient or attempt == 3:
                raise
            time.sleep(min(30, 2 ** (attempt + 1)))
    raise last  # pragma: no cover


def extract(song, recording_id, source_url, payload):
    proposals = []
    for relation in payload.get("relations", []):
        target = str(relation.get("url", {}).get("resource", ""))
        provider = provider_id = None
        match = SPOTIFY_RE.match(target)
        if match:
            provider, provider_id = "spotify", match.group(1)
        else:
            match = YOUTUBE_RE.match(target) or YOUTU_BE_RE.match(target)
            if match:
                provider, provider_id = "youtube", match.group(1)
        if provider:
            proposals.append({"songId": song["id"], "provider": provider, "id": provider_id, "url": target, "recordingId": recording_id, "sourceUrl": source_url, "relationship": relation.get("type"), "checkedAt": date.today().isoformat()})
    return proposals


def write_output(args, selected, proposals, cached, fetched, failed, failures, processed=None):
    OUT.write_text(json.dumps({"schemaVersion": 1, "generatedAt": date.today().isoformat(), "scope": {"requested": args.limit, "selected": selected, "source": "existing MusicBrainz recording claims", "proposalOnly": True}, "counts": {"cached": cached, "fetched": fetched, "failed": failed, "proposals": len(proposals)}, "failures": failures, "proposals": proposals}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if processed is not None:
        print(json.dumps({"checkpoint": processed, "selected": selected, "cached": cached, "fetched": fetched, "failed": failed, "proposals": len(proposals)}), flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=50)
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    songs = read_json(DATABASE)["songs"]
    targets = []
    for song in songs.values():
        missing = not provider_present(song, "spotify") or not provider_present(song, "youtube")
        recording_id, source_url = recording_claim(song)
        if missing and recording_id:
            targets.append((song, recording_id, source_url))
    targets = targets[: max(0, args.limit)]
    proposals, cached, fetched, failed = [], 0, 0, 0
    failures = []
    session_state = {"last_request": None}
    for processed, (song, recording_id, source_url) in enumerate(targets, start=1):
        cache_path = CACHE / f"{recording_id}.json"
        try:
            payload, did_fetch = fetch(recording_id, cache_path, session_state)
            cached += not did_fetch
            fetched += did_fetch
            if str(payload.get("id", "")).lower() != recording_id:
                raise ValueError(f"payload id {payload.get('id')!r} does not match requested recording {recording_id}")
            proposals.extend(extract(song, recording_id, source_url, payload))
        except Exception as exc:
            failed += 1
            failures.append({"recordingId": recording_id, "songId": song["id"], "reason": f"{type(exc).__name__}: {exc}"})
            if failed >= 3 and fetched == 0 and cached == 0:
                raise RuntimeError("MusicBrainz appears systemically unreachable")
        if processed % 25 == 0:
            write_output(args, len(targets), proposals, cached, fetched, failed, failures, processed)
    write_output(args, len(targets), proposals, cached, fetched, failed, failures)
    print(json.dumps({"selected": len(targets), "cached": cached, "fetched": fetched, "failed": failed, "proposals": len(proposals)}))


if __name__ == "__main__":
    main()
