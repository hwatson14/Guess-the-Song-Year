"""Audit centralized YouTube IDs via public oEmbed metadata.

This checks provider metadata only; it does not verify exact recordings or playback.
"""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import requests
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "song-database.json"
OUT = ROOT / "output" / "expansion" / "youtube-link-audit.json"

def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def review_reasons(title, author):
    haystack = f"{title} {author}".lower()
    reasons = []
    for label, terms in {
        "live": (r"\blive\b", r"\bconcert\b", r"\bon stage\b", r"\bin concert\b"),
        "remix": (r"\bremix\b", r"\bre-mix\b", r"\bextended mix\b", r"\bclub mix\b"),
        "performance": (r"\bperformance\b", r"\bperformed\b", r"\bsession\b", r"\bacoustic\b", r"\bcover\b", r"\bkaraoke\b"),
    }.items():
        if any(re.search(term, haystack) for term in terms):
            reasons.append(label)
    return reasons

def audit(item):
    song_id, link = item
    video_id = link.get("id") or ""
    base = {"songId": song_id, "id": video_id, "provider": "youtube"}
    try:
        response = requests.get("https://www.youtube.com/oembed", params={
            "url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"}, timeout=15)
        response.raise_for_status()
        payload = response.json()
        title = payload.get("title", "")
        reasons = review_reasons(title, payload.get("author_name", ""))
        result = {**base, "state": "metadata_checked", "title": title,
                  "author": payload.get("author_name", ""), "httpstatus": response.status_code,
                  "checkedAt": now()}
        if reasons:
            result["reviewReasons"] = reasons
        return result
    except requests.HTTPError as exc:
        return {**base, "state": "unverified", "httpstatus": exc.response.status_code if exc.response is not None else None, "checkedAt": now()}
    except (requests.RequestException, ValueError) as exc:
        return {**base, "state": "unverified", "httpstatus": None, "checkedAt": now(), "error": type(exc).__name__}

def main():
    db = json.loads(DB.read_text(encoding="utf-8"))
    prior = {}
    if OUT.exists():
        prior = {(x.get("songId"), x.get("id")): x for x in json.loads(OUT.read_text(encoding="utf-8"))
                 if x.get("state") == "metadata_checked"}
        for x in prior.values():
            reasons = review_reasons(x.get("title", ""), x.get("author", ""))
            if reasons:
                x["reviewReasons"] = reasons
            else:
                x.pop("reviewReasons", None)
    items = []
    for song_id, song in db.get("songs", {}).items():
        for link in song.get("providers", {}).get("youtube", {}).get("links", []):
            video_id = link.get("id") or ""
            if video_id and (song_id, video_id) not in prior:
                items.append((song_id, link))
    # Audit all existing candidates, with periodic checkpoints and a systemic-error guard.
    results = list(prior.values())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    completed = 0
    failures = 0
    pending = []
    pool = ThreadPoolExecutor(max_workers=2)
    futures = [pool.submit(audit, item) for item in items]
    try:
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            completed += 1
            if result.get("state") != "metadata_checked":
                failures += 1
            if completed % 20 == 0:
                snapshot = sorted(results, key=lambda x: (x.get("songId", ""), x.get("id", "")))
                OUT.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            # Stop when the endpoint is clearly unavailable, while retaining the checkpoint.
            if completed >= 20 and failures >= 20 and failures / completed >= 0.9:
                for pending_future in futures:
                    pending_future.cancel()
                pool.shutdown(wait=False, cancel_futures=True)
                break
    finally:
        if completed < len(items) and not (completed >= 20 and failures >= 20 and failures / completed >= 0.9):
            pool.shutdown(wait=True)
    results.sort(key=lambda x: (x.get("songId", ""), x.get("id", "")))
    OUT.write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"audited={completed} candidates={len(items)} cached={len(prior)} failures={failures} total={len(results)}")

if __name__ == "__main__":
    main()
