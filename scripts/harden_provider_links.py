"""Discover and objectively verify playback links tied to canonical recordings.

Only provider URLs directly attached to an accepted MusicBrainz recording claim are
eligible. A preferred link is promoted automatically only when exactly one candidate
for that provider passes recording identity, public provider metadata and alternate-
version checks. Ambiguity remains in the durable review queue.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse, parse_qs
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "song-database.json"
LEDGER_PATH = ROOT / "verification" / "provider-recording-research.json"
QUEUE_PATH = ROOT / "verification" / "provider-hardening-review-queue.json"
CACHE = ROOT / "output" / "provider-hardening" / "recordings"
USER_AGENT = "Guess-the-Song-Year/1.0 (provider hardening; https://github.com/hwatson14/Guess-the-Song-Year)"
POLICY = "musicbrainz-recording-provider-v1"
MB_RE = re.compile(r"^https?://musicbrainz\.org/recording/([0-9a-f-]{36})(?:[/?#].*)?$", re.I)
SPOTIFY_RE = re.compile(r"^https?://open\.spotify\.com/track/([A-Za-z0-9]{22})(?:\?.*)?$", re.I)
YT_WATCH_RE = re.compile(r"^https?://(?:www\.)?youtube\.com/watch\?v=([A-Za-z0-9_-]{11})(?:[&#].*)?$", re.I)
YT_SHORT_RE = re.compile(r"^https?://youtu\.be/([A-Za-z0-9_-]{11})(?:\?.*)?$", re.I)
BAD_MARKERS = ["karaoke", "reaction", "cover", "tribute", "sped up", "slowed", "nightcore", "remix", "re-mix", "live", "acoustic", "instrumental", "remaster", "remastered", "demo"]
BAD_DISAMBIG = re.compile(r"\b(live|remix|re[- ]?mix|remaster(?:ed)?|demo|karaoke|tribute|cover|acoustic|instrumental|re[- ]?record(?:ed)?|edit|mix)\b", re.I)
STREAM_RELATIONS = {"free streaming", "streaming"}


def norm(value):
    value = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def artist_norm(value):
    tokens = [t for t in norm(value).split() if t not in {"and", "with", "feat", "featuring", "ft"}]
    return " ".join(tokens)


def recording_credit(recording):
    return "".join(
        item if isinstance(item, str) else str(item.get("name", "")) + str(item.get("joinphrase", ""))
        for item in recording.get("artist-credit", [])
    ).strip()


def recording_artist_names(recording):
    return [str(item.get("name", "")) for item in recording.get("artist-credit", []) if isinstance(item, dict) and item.get("name")]


def recording_claim(song):
    answer = song.get("release", {}).get("answerYear")
    candidates = []
    for claim in song.get("release", {}).get("claims", []):
        match = MB_RE.match(str(claim.get("sourceUrl", "")))
        if match and claim.get("state") == "externally_observed" and int(claim.get("year", -1)) == int(answer or -2):
            candidates.append((match.group(1).lower(), match.group(0)))
    return candidates[0] if candidates else (None, None)


def recording_acceptable(song, recording):
    if recording.get("video") is True or BAD_DISAMBIG.search(str(recording.get("disambiguation", ""))):
        return False, "alternate_recording"
    date_value = str(recording.get("first-release-date", ""))
    if not re.match(r"^\d{4}", date_value) or int(date_value[:4]) != int(song.get("release", {}).get("answerYear", -1)):
        return False, "recording_year_differs"
    if norm(recording.get("title")) != norm(song.get("title")):
        return False, "recording_title_differs"
    if artist_norm(recording_credit(recording)) != artist_norm(song.get("artist")):
        return False, "recording_artist_differs"
    return True, None


def mb_get(recording_id, state):
    CACHE.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE / f"{recording_id}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8")), False
    url = f"https://musicbrainz.org/ws/2/recording/{recording_id}?inc=url-rels+artist-credits+releases&fmt=json"
    last = None
    for attempt in range(4):
        elapsed = time.monotonic() - state.get("last_request", 0.0)
        if state.get("last_request") and elapsed < 1.1:
            time.sleep(1.1 - elapsed)
        state["last_request"] = time.monotonic()
        try:
            req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urlopen(req, timeout=25) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if str(payload.get("id", "")).lower() != recording_id:
                raise ValueError("MusicBrainz recording id mismatch")
            cache_file.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            return payload, True
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, ValueError) as exc:
            last = exc
            code = getattr(exc, "code", None)
            transient = isinstance(exc, (URLError, TimeoutError)) or code in {429, 500, 502, 503, 504}
            if not transient or attempt == 3:
                raise
            time.sleep(min(20, 2 ** (attempt + 1)))
    raise last


def relation_candidates(recording):
    out = []
    for relation in recording.get("relations", []):
        if str(relation.get("type", "")).lower() not in STREAM_RELATIONS:
            continue
        url = str(relation.get("url", {}).get("resource", ""))
        match = SPOTIFY_RE.match(url)
        if match:
            out.append({"provider": "spotify", "id": match.group(1), "url": f"https://open.spotify.com/track/{match.group(1)}", "sourceUrl": url, "relationship": relation.get("type")})
            continue
        match = YT_WATCH_RE.match(url) or YT_SHORT_RE.match(url)
        if match:
            out.append({"provider": "youtube", "id": match.group(1), "url": f"https://www.youtube.com/watch?v={match.group(1)}", "sourceUrl": url, "relationship": relation.get("type")})
    unique = {}
    for row in out:
        unique[(row["provider"], row["id"])] = row
    return list(unique.values())


def fetch_text(url):
    req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/json"})
    with urlopen(req, timeout=20) as response:
        return response.status, response.read().decode("utf-8", "replace")


def spotify_metadata(candidate):
    try:
        status, body = fetch_text(f"https://open.spotify.com/embed/track/{candidate['id']}")
        match = re.search(r'<script[^>]+id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>', body, re.S | re.I)
        if not match:
            return {"state": "unverified", "httpStatus": status, "error": "metadata_payload_missing"}
        payload = json.loads(html.unescape(match.group(1)))
        entity = payload["props"]["pageProps"]["state"]["data"]["entity"]
        artists = [str(a.get("name", "")) for a in entity.get("artists", [])]
        return {"state": "metadata_checked", "httpStatus": status, "title": entity.get("title") or entity.get("name", ""), "artists": artists, "playable": entity.get("isPlayable") is True}
    except HTTPError as exc:
        return {"state": "unavailable" if exc.code == 404 else "unverified", "httpStatus": exc.code, "error": "HTTPError"}
    except Exception as exc:
        return {"state": "unverified", "error": type(exc).__name__}


def youtube_metadata(candidate):
    try:
        url = "https://www.youtube.com/oembed?" + urlencode({"url": candidate["url"], "format": "json"})
        status, body = fetch_text(url)
        payload = json.loads(body)
        return {"state": "metadata_checked", "httpStatus": status, "title": str(payload.get("title", "")), "author": str(payload.get("author_name", "")), "playable": True}
    except HTTPError as exc:
        return {"state": "unavailable" if exc.code in {401, 404} else "unverified", "httpStatus": exc.code, "error": "HTTPError"}
    except Exception as exc:
        return {"state": "unverified", "error": type(exc).__name__}


def marker_safe(observed, expected):
    observed_n = norm(observed)
    expected_n = norm(expected)
    for marker in BAD_MARKERS:
        marker_n = norm(marker)
        if re.search(rf"\b{re.escape(marker_n)}\b", observed_n) and not re.search(rf"\b{re.escape(marker_n)}\b", expected_n):
            return False
    return True


def spotify_allowed(song, recording, meta):
    if meta.get("state") != "metadata_checked" or meta.get("playable") is not True:
        return False, "provider_unavailable"
    if norm(meta.get("title")) != norm(song.get("title")):
        return False, "provider_title_differs"
    if not marker_safe(meta.get("title"), song.get("title")):
        return False, "provider_alternate_version"
    expected = {norm(x) for x in recording_artist_names(recording) if norm(x)}
    observed = {norm(x) for x in meta.get("artists", []) if norm(x)}
    if expected and observed != expected:
        return False, "provider_artist_differs"
    return True, None


def youtube_allowed(song, recording, meta):
    if meta.get("state") != "metadata_checked":
        return False, "provider_unavailable"
    observed_title = re.sub(r"\bofficial\s+(?:music\s+)?(?:video|audio|lyrics?)\b", " ", str(meta.get("title", "")), flags=re.I)
    if norm(song.get("title")) not in norm(observed_title):
        return False, "provider_title_differs"
    source_text = f"{meta.get('title', '')} {meta.get('author', '')}"
    if not marker_safe(source_text, song.get("title")):
        return False, "provider_alternate_version"
    credits = recording_artist_names(recording)
    lead = norm(credits[0] if credits else song.get("artist"))
    haystack = norm(source_text.replace("VEVO", " ").replace("- Topic", " "))
    if lead and lead not in haystack:
        return False, "provider_artist_differs"
    return True, None


def add_asset(song, candidate, recording_id, claim_url, checked_at):
    bucket = song["providers"][candidate["provider"]]
    asset = next((x for x in bucket["links"] if x.get("id") == candidate["id"]), None)
    if asset is None:
        asset = {"id": candidate["id"], "url": candidate["url"], "state": "unverified", "origin": "musicbrainz-recording-url-relation", "sourceUrl": claim_url, "recordingId": recording_id, "relationship": candidate.get("relationship"), "checkedAt": checked_at}
        bucket["links"].append(asset)
    elif asset.get("origin") == "musicbrainz-recording-url-relation":
        asset.setdefault("sourceUrl", claim_url)
        asset.setdefault("recordingId", recording_id)
    return asset


def verify_asset(song, provider, asset, meta, recording, checked_at):
    asset["state"] = "verified"
    asset["metadataCheck"] = {"provider": provider, "songId": song["id"], "id": asset["id"], "state": "metadata_checked", "checkedAt": checked_at, **meta}
    asset["lastAudit"] = dict(asset["metadataCheck"])
    asset["evidence"] = {
        "recordingMatch": True,
        "checkedAt": checked_at,
        "method": POLICY,
        "recordingId": asset["recordingId"],
        "sourceUrl": asset["sourceUrl"],
        "observedTitle": meta.get("title"),
        "observedArtists": meta.get("artists") or ([meta.get("author")] if meta.get("author") else []),
        "audioAuditioned": False,
        "automatedPolicy": True,
    }
    song["providers"][provider]["preferredId"] = asset["id"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="0 means all accepted MusicBrainz recording claims")
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    db = json.loads(DB_PATH.read_text(encoding="utf-8"))
    prior = {"records": {}}
    if LEDGER_PATH.exists() and not args.refresh:
        prior = json.loads(LEDGER_PATH.read_text(encoding="utf-8"))
        prior.setdefault("records", {})
    prior_review = []
    if QUEUE_PATH.exists() and not args.refresh:
        prior_queue = json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
        prior_review = list(prior_queue.get("queue", []))
    checked_at = date.today().isoformat()
    targets = []
    for song in db.get("songs", {}).values():
        recording_id, claim_url = recording_claim(song)
        # The durable recording ledger is the checkpoint: normal runs only research
        # recording IDs not already classified. --refresh explicitly rechecks all.
        if recording_id and (args.refresh or recording_id not in prior["records"]):
            targets.append((song, recording_id, claim_url))
    targets.sort(key=lambda x: (sum(1 for m in db.get("memberships", []) if m.get("songId") == x[0]["id"]) * -1, int(x[0]["release"]["answerYear"]), x[0]["id"]))
    if args.limit > 0:
        targets = targets[: args.limit]

    mb_state = {"last_request": 0.0}
    records = prior["records"]
    review = list(prior_review)
    stats = {"targeted": len(targets), "recordingsFetched": 0, "recordingsCached": 0, "recordingRejected": 0, "linksAdded": 0, "spotifyVerified": 0, "youtubeVerified": 0, "ambiguous": 0, "providerFailures": 0}
    candidates_to_check = []
    recording_by_song = {}
    consecutive_mb_errors = 0

    for index, (song, recording_id, claim_url) in enumerate(targets, start=1):
        try:
            recording, fetched = mb_get(recording_id, mb_state)
            stats["recordingsFetched" if fetched else "recordingsCached"] += 1
            consecutive_mb_errors = 0
        except Exception as exc:
            consecutive_mb_errors += 1
            review.append({"songId": song["id"], "provider": "all", "reason": "musicbrainz_fetch_failed", "recordingId": recording_id, "error": type(exc).__name__})
            if consecutive_mb_errors >= 5:
                raise RuntimeError("MusicBrainz appears systemically unreachable") from exc
            continue
        ok, reason = recording_acceptable(song, recording)
        relations = relation_candidates(recording)
        records[recording_id] = {"songId": song["id"], "checkedAt": checked_at, "accepted": ok, "reason": reason, "relations": [{k: c[k] for k in ("provider", "id", "url", "relationship")} for c in relations]}
        if not ok:
            stats["recordingRejected"] += 1
            review.append({"songId": song["id"], "provider": "all", "reason": reason, "recordingId": recording_id})
            continue
        recording_by_song[song["id"]] = recording
        for candidate in relations:
            asset = add_asset(song, candidate, recording_id, claim_url, checked_at)
            if asset.get("origin") != "musicbrainz-recording-url-relation":
                continue
            if asset.get("checkedAt") == checked_at and not any(x.get("id") == candidate["id"] and x is not asset for x in song["providers"][candidate["provider"]]["links"]):
                pass
            candidates_to_check.append((song, recording, candidate, asset))
        if index % 100 == 0:
            print(json.dumps({"recordingsProcessed": index, **stats}), flush=True)

    # Public provider endpoints are independent; audit them concurrently after respecting MB rate limits.
    checked = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        future_map = {}
        for song, recording, candidate, asset in candidates_to_check:
            fn = spotify_metadata if candidate["provider"] == "spotify" else youtube_metadata
            future_map[pool.submit(fn, candidate)] = (song, recording, candidate, asset)
        for future in as_completed(future_map):
            song, recording, candidate, asset = future_map[future]
            meta = future.result()
            meta_record = {"provider": candidate["provider"], "songId": song["id"], "id": candidate["id"], "state": meta.get("state", "unverified"), "checkedAt": checked_at, **meta}
            asset["lastAudit"] = meta_record
            if meta.get("state") == "metadata_checked":
                asset["metadataCheck"] = meta_record
                if asset.get("state") != "verified":
                    asset["state"] = "metadata_checked"
            elif meta.get("state") == "unavailable" and asset.get("state") != "verified":
                asset["state"] = "unavailable"
            allowed, reason = (spotify_allowed if candidate["provider"] == "spotify" else youtube_allowed)(song, recording, meta)
            checked.append((song, recording, candidate, asset, meta, allowed, reason))
            if not allowed:
                stats["providerFailures"] += 1
                review.append({"songId": song["id"], "provider": candidate["provider"], "id": candidate["id"], "reason": reason, "observedTitle": meta.get("title"), "observedArtist": meta.get("artists") or meta.get("author")})

    # Promote only a single qualifying direct-recording candidate per song/provider.
    grouped = {}
    for row in checked:
        song, recording, candidate, asset, meta, allowed, reason = row
        if allowed:
            grouped.setdefault((song["id"], candidate["provider"]), []).append(row)
    for (song_id, provider), rows in grouped.items():
        song = db["songs"][song_id]
        unique = {row[2]["id"]: row for row in rows}
        if len(unique) != 1:
            stats["ambiguous"] += 1
            review.append({"songId": song_id, "provider": provider, "reason": "multiple_qualifying_recording_links", "ids": sorted(unique)})
            continue
        _, recording, candidate, asset, meta, _, _ = next(iter(unique.values()))
        verify_asset(song, provider, asset, meta, recording, checked_at)
        stats[provider + "Verified"] += 1

    # Count genuinely new relations after all processing by comparing durable source properties.
    stats["linksAdded"] = sum(1 for song in db["songs"].values() for provider in ("spotify", "youtube") for asset in song["providers"][provider]["links"] if asset.get("origin") == "musicbrainz-recording-url-relation" and asset.get("checkedAt") == checked_at)
    # Preserve review findings across resumable chunks while replacing duplicate observations.
    review_by_key = {}
    for row in review:
        key = (str(row.get("songId", "")), str(row.get("provider", "")), str(row.get("id") or row.get("recordingId") or ""), str(row.get("reason", "")))
        review_by_key[key] = row
    review = [review_by_key[key] for key in sorted(review_by_key)]
    ledger = {"generatedAt": checked_at, "policy": POLICY, "records": records}
    queue = {"generatedAt": checked_at, "policy": POLICY, "counts": stats, "queue": review}
    LEDGER_PATH.write_text(json.dumps(ledger, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    QUEUE_PATH.write_text(json.dumps(queue, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if args.write:
        db["catalogue"]["generatedAt"] = checked_at
        DB_PATH.write_text(json.dumps(db, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(stats))


if __name__ == "__main__":
    main()
