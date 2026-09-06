"""Conservatively confirm unresolved canonical release years against MusicBrainz.

This tool never changes ``release.answerYear``. It may only promote an unresolved
master to externally observed when an exact title/artist recording has an earliest
MusicBrainz first-release year equal to the existing answer year. Earlier dates,
ambiguous searches and network failures are review items, never automatic edits.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import time
import unicodedata
from datetime import date
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "song-database.json"
REVIEW_PATH = ROOT / "verification" / "release-evidence-review-queue.json"
CACHE = ROOT / "output" / "evidence-hardening" / "musicbrainz-search"
MB_SEARCH = "https://musicbrainz.org/ws/2/recording/"
USER_AGENT = "Guess-the-Song-Year/1.0 (evidence hardening; https://github.com/hwatson14/Guess-the-Song-Year)"
POLICY = "musicbrainz-exact-answer-year-v1"
YEAR_EVIDENCE = "MusicBrainz recording earliest first-release-date"
BAD_VERSION = re.compile(r"\b(live|remix|re[- ]?mix|remaster(?:ed)?|demo|karaoke|tribute|cover|acoustic|instrumental|re[- ]?record(?:ed)?|edit|extended|club mix|radio edit|version)\b", re.I)


def norm(value):
    value = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def artist_credit(recording):
    return "".join(
        item if isinstance(item, str) else str(item.get("name", "")) + str(item.get("joinphrase", ""))
        for item in recording.get("artist-credit", [])
    ).strip()


def exact_recording_match(song, recording):
    if recording.get("video") is True or BAD_VERSION.search(str(recording.get("disambiguation", ""))):
        return False
    if norm(recording.get("title")) != norm(song.get("title")):
        return False
    return norm(artist_credit(recording)) == norm(song.get("artist"))


def recording_year(recording):
    value = str(recording.get("first-release-date", ""))
    return int(value[:4]) if re.match(r"^\d{4}", value) else None


def has_official_release(recording):
    releases = recording.get("releases")
    if not isinstance(releases, list) or not releases:
        return False
    return any(str(release.get("status", "")).lower() == "official" for release in releases)


def lucene(value):
    return re.sub(r"[+\-!(){}\[\]^\"~*?:\\/]", " ", str(value or "")).strip()


def request_json(url, params, state):
    query = urlencode(params)
    full_url = f"{url}?{query}"
    last_error = None
    for attempt in range(4):
        elapsed = time.monotonic() - state.get("last_request", 0.0)
        if state.get("last_request") and elapsed < 1.1:
            time.sleep(1.1 - elapsed)
        state["last_request"] = time.monotonic()
        try:
            req = Request(full_url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
            with urlopen(req, timeout=25) as response:
                return json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
            code = getattr(exc, "code", None)
            transient = isinstance(exc, (URLError, TimeoutError)) or code in {429, 500, 502, 503, 504}
            if not transient or attempt == 3:
                raise
            time.sleep(min(20, 2 ** (attempt + 1)))
    raise last_error


def search_payload(song, answer_year, state):
    query = f'recording:"{lucene(song["title"])}" AND artistname:"{lucene(song["artist"])}" AND firstreleasedate:[* TO {answer_year}]'
    CACHE.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE / (hashlib.sha256(query.encode()).hexdigest() + ".json")
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8")), cache_file, False
    payload = request_json(MB_SEARCH, {"query": query, "fmt": "json", "limit": 100}, state)
    rows = list(payload.get("recordings", []))
    count = int(payload.get("count", len(rows)) or 0)
    while len(rows) < count and len(rows) < 500:
        more = request_json(MB_SEARCH, {"query": query, "fmt": "json", "limit": 100, "offset": len(rows)}, state)
        batch = more.get("recordings", [])
        if not batch:
            break
        rows.extend(batch)
    payload["recordings"] = rows
    payload["fullyPaged"] = len(rows) >= count
    cache_file.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return payload, cache_file, True


def classify(song, payload):
    answer_year = int(song["release"]["answerYear"])
    if not payload.get("fullyPaged", True):
        return {"status": "review", "reason": "search_truncated", "searchCount": payload.get("count")}
    matches = [r for r in payload.get("recordings", []) if exact_recording_match(song, r) and recording_year(r) is not None and has_official_release(r)]
    if not matches:
        return {"status": "review", "reason": "no_exact_official_recording"}
    earliest = min(recording_year(r) for r in matches)
    earliest_rows = [r for r in matches if recording_year(r) == earliest]
    best = max(earliest_rows, key=lambda r: float(r.get("score") or 0))
    compact = [{"id": r.get("id"), "date": r.get("first-release-date"), "score": r.get("score"), "title": r.get("title"), "artist": artist_credit(r)} for r in earliest_rows[:5]]
    if earliest < answer_year:
        return {"status": "review", "reason": "earlier_exact_recording", "earliestYear": earliest, "candidates": compact}
    if earliest > answer_year:
        return {"status": "review", "reason": "no_recording_at_or_before_answer_year", "earliestYear": earliest, "candidates": compact}
    if float(best.get("score") or 0) < 90:
        return {"status": "review", "reason": "low_search_score", "earliestYear": earliest, "candidates": compact}
    return {"status": "confirmed", "recording": best, "earliestYear": earliest, "candidateCount": len(earliest_rows)}


def apply_confirmation(db, song, result, checked_at):
    answer_year = int(song["release"]["answerYear"])
    recording = result["recording"]
    recording_id = str(recording["id"])
    source_url = f"https://musicbrainz.org/recording/{recording_id}"
    release_date = str(recording["first-release-date"])
    claim = {
        "year": answer_year,
        "state": "externally_observed",
        "sourceUrl": source_url,
        "evidence": "Exact title/artist MusicBrainz recording; earliest observed official first-release-date matches canonical answer year.",
        "checkedAt": checked_at,
        "policy": POLICY,
    }
    claims = song["release"].setdefault("claims", [])
    if not any(c.get("sourceUrl") == source_url and int(c.get("year", -1)) == answer_year for c in claims):
        claims.append(claim)
    song["release"]["year"] = answer_year
    song["release"]["state"] = "externally_observed"
    song["release"]["evidencePolicy"] = POLICY
    song["release"]["evidenceCheckedAt"] = checked_at

    # Keep the runtime provenance useful without replacing any existing source attribution.
    for membership in db.get("memberships", []):
        if membership.get("songId") != song["id"] or membership.get("mode") not in {"greatest", "australian", "unexpected"}:
            continue
        metadata = membership.setdefault("metadata", {})
        metadata.setdefault("musicbrainzId", recording_id)
        metadata.setdefault("musicbrainzSourceUrl", source_url)
        metadata.setdefault("releaseYear", answer_year)
        metadata.setdefault("releaseDateEvidence", release_date)
        metadata.setdefault("releaseYearEvidence", claim["evidence"])
        metadata.setdefault("sourceRetrievalDate", checked_at)
        metadata.setdefault("evidenceState", "externally_observed")
        metadata.setdefault("yearEvidence", YEAR_EVIDENCE)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="0 means all unresolved songs")
    args = parser.parse_args()
    db = json.loads(DB_PATH.read_text(encoding="utf-8"))
    targets = [song for song in db.get("songs", {}).values() if song.get("release", {}).get("state") == "unresolved" and isinstance(song.get("release", {}).get("answerYear"), int)]
    targets.sort(key=lambda s: (int(s["release"]["answerYear"]), s.get("artist", ""), s.get("title", ""), s["id"]))
    if args.limit > 0:
        targets = targets[: args.limit]
    checked_at = date.today().isoformat()
    state = {"last_request": 0.0}
    counts = {"targeted": len(targets), "confirmed": 0, "review": 0, "network_error": 0, "fetched": 0, "cached": 0}
    review = []
    confirmed = []
    consecutive_network_errors = 0

    for index, song in enumerate(targets, start=1):
        try:
            payload, cache_file, fetched = search_payload(song, int(song["release"]["answerYear"]), state)
            counts["fetched" if fetched else "cached"] += 1
            result = classify(song, payload)
            consecutive_network_errors = 0
        except Exception as exc:
            counts["network_error"] += 1
            consecutive_network_errors += 1
            review.append({"songId": song["id"], "title": song["title"], "artist": song["artist"], "answerYear": song["release"]["answerYear"], "reason": "network_error", "error": type(exc).__name__})
            if consecutive_network_errors >= 5:
                raise RuntimeError("MusicBrainz appears systemically unreachable") from exc
            continue

        if result["status"] == "confirmed":
            counts["confirmed"] += 1
            rec = result["recording"]
            confirmed.append({"songId": song["id"], "title": song["title"], "artist": song["artist"], "answerYear": song["release"]["answerYear"], "recordingId": rec["id"], "firstReleaseDate": rec["first-release-date"], "score": rec.get("score"), "candidateCount": result["candidateCount"]})
            if args.write:
                apply_confirmation(db, song, result, checked_at)
        else:
            counts["review"] += 1
            review.append({"songId": song["id"], "title": song["title"], "artist": song["artist"], "answerYear": song["release"]["answerYear"], **{k: v for k, v in result.items() if k != "status"}})

        if index % 25 == 0:
            print(json.dumps({"processed": index, **counts}), flush=True)

    report = {"generatedAt": checked_at, "policy": POLICY, "write": args.write, "counts": counts, "confirmed": confirmed, "review": review}
    REVIEW_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if args.write and counts["confirmed"]:
        db["catalogue"]["generatedAt"] = checked_at
        DB_PATH.write_text(json.dumps(db, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(counts))


if __name__ == "__main__":
    main()
