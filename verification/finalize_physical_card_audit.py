#!/usr/bin/env python3
"""Finalize the physical-card audit without promoting metadata guesses to facts.

This script deliberately separates three things:

* the repository's current YEAR_MAP (a comparison baseline),
* authoritative live card identity data (card number -> Spotify track), and
* the printed year on the physical card (not present in any public data found).

It writes a 308-row ledger, an explicitly withheld proposed-map manifest, a
capture template, a source snapshot, QR parser cases, and a Markdown report.
It never edits engine.js.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "verification"
SOURCES = OUT / "sources"
ENGINE = ROOT / "engine.js"
PLAYLIST_CACHE = SOURCES / "official_uk_playlist.json"
MB_CACHE = SOURCES / "musicbrainz_release_years.json"
OFFICIAL_SNAPSHOT = SOURCES / "official_hitster_gamesets_uk_au.json"
LEDGER = OUT / "card_year_verification_ledger.csv"
PROPOSED = OUT / "proposed_year_map.json"
CAPTURE_TEMPLATE = OUT / "physical_card_capture_template.csv"
PARSER_CASES = OUT / "qr_parser_edge_cases.csv"
REPORT = OUT / "card_year_audit_report.md"

GAMES_DB_URL = (
    "https://stgroupprdhitster.blob.core.windows.net/"
    "hitster-assets/gameset_database.json"
)
OFFICIAL_FAQ_URL = "https://hitstergame.com/en-gb/faq/"
OFFICIAL_RULES_URL = "https://hitstergame.com/en-gb/how-to-play/"
OFFICIAL_PRODUCT_URL = (
    "https://jumboplay.com/en-gb/products/hitster-uk-edition-1110100132"
)
OFFICIAL_PLAYLIST_URL = "https://open.spotify.com/playlist/0Mpj1KwRmY2pHzmj7mfbdh"
BOPSTER_URL = "https://bopster.app/en/playlist?id=4450"
RESOLVER_SOURCE_URL = (
    "https://github.com/musicguessr/musicguessr-backend/blob/main/"
    "internal/resolver/resolver.go"
)

UK_SKU = "aaaa0005"
AU_SKU = "aaah0001"
EXPECTED_IDS = list(range(1, 309))
USER_AGENT = "GuessSongYearCardAudit/1.0"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load_year_map() -> list[int | None]:
    body = ENGINE.read_text(encoding="utf-8")
    match = re.search(r"const\s+YEAR_MAP\s*=\s*\[(.*?)\];", body, re.S)
    if not match:
        raise RuntimeError("Could not locate YEAR_MAP in engine.js")
    values: list[int | None] = []
    for token in match.group(1).split(","):
        token = token.strip()
        values.append(None if token == "null" else int(token))
    if len(values) != 309 or values[0] is not None:
        raise RuntimeError(f"Expected null + 308 YEAR_MAP entries, got {len(values)}")
    return values


def fetch_official_gamesets() -> tuple[dict[str, Any], bytes]:
    response = requests.get(
        GAMES_DB_URL,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        timeout=120,
    )
    response.raise_for_status()
    return response.json(), response.content


def select_gameset(database: dict[str, Any], sku: str) -> dict[str, Any]:
    matches = [g for g in database.get("gamesets", []) if str(g.get("sku", "")).lower() == sku]
    if len(matches) != 1:
        raise RuntimeError(f"Expected one gameset for {sku}, found {len(matches)}")
    result = matches[0]
    cards = result.get("gameset_data", {}).get("cards", [])
    if len(cards) != 308:
        raise RuntimeError(f"Expected 308 cards for {sku}, found {len(cards)}")
    expected = [f"{i:05d}" for i in EXPECTED_IDS]
    actual = [str(card.get("CardNumber", "")) for card in cards]
    if actual != expected:
        raise RuntimeError(f"Gameset {sku} card numbers are not exactly 00001..00308")
    if len(set(actual)) != 308:
        raise RuntimeError(f"Gameset {sku} contains duplicate card numbers")
    spotify_ids = [str(card.get("Spotify", "")) for card in cards]
    if any(not re.fullmatch(r"[A-Za-z0-9]{22}", value) for value in spotify_ids):
        raise RuntimeError(f"Gameset {sku} contains an invalid Spotify track ID")
    if len(set(spotify_ids)) != 308:
        raise RuntimeError(f"Gameset {sku} contains duplicate Spotify track IDs")
    return result


def spotify_title(session: requests.Session, spotify_id: str) -> str:
    response = session.get(
        "https://open.spotify.com/oembed",
        params={"url": f"https://open.spotify.com/track/{spotify_id}"},
        timeout=30,
    )
    response.raise_for_status()
    return str(response.json().get("title", "")).strip()


def simple_title(value: str) -> str:
    value = value.casefold().replace("&", "and")
    value = re.sub(r"\s+-\s+.*$", "", value)
    return re.sub(r"[^a-z0-9]+", "", value)


def make_snapshot(
    database: dict[str, Any],
    raw: bytes,
    uk: dict[str, Any],
    au: dict[str, Any],
    playlist_tracks: list[dict[str, Any]],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    uk_cards = uk["gameset_data"]["cards"]
    au_cards = au["gameset_data"]["cards"]
    differing = [
        i
        for i in EXPECTED_IDS
        if uk_cards[i - 1]["Spotify"] != au_cards[i - 1]["Spotify"]
    ]
    playlist_differing = [
        i
        for i in EXPECTED_IDS
        if uk_cards[i - 1]["Spotify"] != playlist_tracks[i - 1]["spotifyTrackId"]
    ]

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    equivalents: list[dict[str, Any]] = []
    for card_id in differing:
        uk_id = uk_cards[card_id - 1]["Spotify"]
        au_id = au_cards[card_id - 1]["Spotify"]
        uk_title = spotify_title(session, uk_id)
        au_title = spotify_title(session, au_id)
        equivalents.append(
            {
                "cardId": card_id,
                "cardNumber": f"{card_id:05d}",
                "ukSpotifyTrackId": uk_id,
                "ukSpotifyTitle": uk_title,
                "auSpotifyTrackId": au_id,
                "auSpotifyTitle": au_title,
                "sameNormalizedSongTitle": simple_title(uk_title) == simple_title(au_title),
            }
        )

    snapshot = {
        "capturedAt": now_iso(),
        "sourceUrl": GAMES_DB_URL,
        "sourceUpdatedOn": database.get("updated_on"),
        "sourceRawSha256": hashlib.sha256(raw).hexdigest(),
        "sourceSchema": ["CardNumber", "Spotify"],
        "criticalLimitation": (
            "The production gameset database authoritatively links deck SKU + card number "
            "to Spotify track ID, but contains no printed year, title, or artist field."
        ),
        "uk": {
            "sku": UK_SKU,
            "language": uk["gameset_data"].get("gameset_language"),
            "cardCount": len(uk_cards),
            "cards": [
                {
                    "cardId": i,
                    "cardNumber": card["CardNumber"],
                    "spotifyTrackId": card["Spotify"],
                    "spotifyUrl": f"https://open.spotify.com/track/{card['Spotify']}",
                }
                for i, card in enumerate(uk_cards, start=1)
            ],
        },
        "australia": {
            "sku": AU_SKU,
            "language": au["gameset_data"].get("gameset_language"),
            "cardCount": len(au_cards),
            "cards": [
                {
                    "cardId": i,
                    "cardNumber": card["CardNumber"],
                    "spotifyTrackId": card["Spotify"],
                    "spotifyUrl": f"https://open.spotify.com/track/{card['Spotify']}",
                }
                for i, card in enumerate(au_cards, start=1)
            ],
        },
        "ukVsAustralia": {
            "exactSpotifyIdMatchCount": 308 - len(differing),
            "differentSpotifyIdCardIds": differing,
            "resolvedTitleComparisons": equivalents,
        },
        "ukVsOrderedPlaylistSnapshot": {
            "exactSpotifyIdMatchCount": 308 - len(playlist_differing),
            "differentSpotifyIdCardIds": playlist_differing,
            "interpretation": (
                "The sole difference is card 166, where Spotify oEmbed identifies both IDs "
                "as Girl, You'll Be A Woman Soon; this is an equivalent track relink."
            ),
        },
    }
    return snapshot, equivalents


def parse_card_id_like_engine(raw: Any) -> int | None:
    value = "" if raw is None else str(raw).strip()
    match = re.search(r"(?:^|/)(\d{5})(?:\?.*)?$", value) or re.fullmatch(r"(\d{1,5})", value)
    if not match:
        return None
    card_id = int(match.group(1))
    return card_id if 1 <= card_id <= 308 else None


def parser_cases() -> list[dict[str, Any]]:
    cases = [
        ("1", 1, "manual unpadded ID"),
        ("00001", 1, "manual padded ID"),
        ("00308", 308, "upper boundary"),
        ("00000", None, "zero rejected"),
        ("00309", None, "out-of-range rejected"),
        ("https://hitstergame.com/uk/aaaa0005/00001", 1, "resolver-compatible UK candidate shape"),
        ("https://hitstergame.com/au/aaah0001/00001", 1, "resolver-compatible AU candidate shape"),
        ("https://hitstergame.com/uk/aaaa0016/00001", 1, "different UK deck silently collides"),
        ("https://hitstergame.com/de/aaaa0002/00001", 1, "foreign deck silently collides"),
        ("https://evil.example/not-a-deck/00001", 1, "untrusted host is accepted"),
        ("junk/00001", 1, "non-URL suffix is accepted"),
        ("https://hitstergame.com/uk/aaaa0005/00001?x=1", 1, "query suffix accepted"),
        ("https://hitstergame.com/uk/aaaa0005/00001/", None, "trailing slash rejected"),
        ("https://hitstergame.com/uk/aaaa0005/1", None, "unpadded URL card rejected"),
        ("https://hitstergame.com/uk/aaaa0005/00001#x", None, "bare fragment rejected"),
        ("https://hitstergame.com/uk/aaaa0005/00001?x=1#frag", 1, "fragment after query accepted"),
        ("https://hitstergame.com/uk/aaaa0005/?id=00001", None, "query-parameter card rejected"),
        ("000001", None, "six digits rejected"),
        (" 00001 ", 1, "outer whitespace trimmed"),
        ("+1", None, "signed number rejected"),
        ("1.0", None, "decimal rejected"),
    ]
    rows = []
    for value, expected, observation in cases:
        actual = parse_card_id_like_engine(value)
        rows.append(
            {
                "input": value,
                "expected_result": "reject" if expected is None else expected,
                "actual_result": "reject" if actual is None else actual,
                "passes_exact_port": actual == expected,
                "observation": observation,
            }
        )
    return rows


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def ids_text(ids: list[int]) -> str:
    return ", ".join(f"{value:05d}" for value in ids) if ids else "none"


def counts_table(counts: Counter[int]) -> str:
    lines = ["| Year | Cards |", "|---:|---:|"]
    lines.extend(f"| {year} | {counts[year]} |" for year in sorted(counts))
    return "\n".join(lines)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    SOURCES.mkdir(parents=True, exist_ok=True)

    year_map = load_year_map()
    current_years = [int(value) for value in year_map[1:] if value is not None]
    playlist = read_json(PLAYLIST_CACHE)
    playlist_tracks = playlist["tracks"]
    mb = read_json(MB_CACHE)
    mb_by_spotify = mb.get("recordsBySpotifyTrackId", {})
    if len(playlist_tracks) != 308:
        raise RuntimeError(f"Expected 308 playlist rows, found {len(playlist_tracks)}")

    database, raw = fetch_official_gamesets()
    uk = select_gameset(database, UK_SKU)
    au = select_gameset(database, AU_SKU)
    snapshot, equivalent_rows = make_snapshot(database, raw, uk, au, playlist_tracks)
    write_json(OFFICIAL_SNAPSHOT, snapshot)

    uk_cards = uk["gameset_data"]["cards"]
    au_cards = au["gameset_data"]["cards"]
    ledger_rows: list[dict[str, Any]] = []
    bopster_diffs: list[int] = []
    mb_diffs: list[int] = []
    mb_unresolved: list[int] = []

    for card_id in EXPECTED_IDS:
        number = f"{card_id:05d}"
        current = int(year_map[card_id])
        track = playlist_tracks[card_id - 1]
        playlist_spotify = track["spotifyTrackId"]
        uk_spotify = uk_cards[card_id - 1]["Spotify"]
        au_spotify = au_cards[card_id - 1]["Spotify"]
        bopster_year = track.get("bopsterDisplayedYear")
        mb_record = mb_by_spotify.get(playlist_spotify)
        mb_year = None if not mb_record else mb_record.get("year")

        flags: list[str] = []
        if bopster_year is not None and int(bopster_year) != current:
            bopster_diffs.append(card_id)
            flags.append("community_bopster_year_differs")
        if mb_year is None:
            mb_unresolved.append(card_id)
            flags.append("musicbrainz_candidate_unresolved")
        elif int(mb_year) != current:
            mb_diffs.append(card_id)
            flags.append("musicbrainz_candidate_differs")
        if uk_spotify != playlist_spotify:
            flags.append("official_live_spotify_relink")
        if uk_spotify != au_spotify:
            flags.append("uk_au_equivalent_spotify_ids_differ")

        ledger_rows.append(
            {
                "card_id": card_id,
                "qr_identity": number,
                "candidate_uk_qr_url": f"https://hitstergame.com/uk/{UK_SKU}/{number}",
                "candidate_au_qr_url": f"https://hitstergame.com/au/{AU_SKU}/{number}",
                "current_mapped_year": current,
                "authoritative_observed_year": "",
                "year_verification_confidence": "unresolved",
                "physical_print_observed": "no",
                "discrepancy_status": "unresolved_missing_physical_card_back_year",
                "official_uk_sku": UK_SKU,
                "official_uk_spotify_track_id": uk_spotify,
                "official_au_sku": AU_SKU,
                "official_au_spotify_track_id": au_spotify,
                "playlist_spotify_track_id": playlist_spotify,
                "playlist_title": track.get("title", ""),
                "playlist_artist": "; ".join(track.get("artists", [])),
                "identity_confidence": "high",
                "source_evidence": (
                    f"identity only: {GAMES_DB_URL} sku={UK_SKU} card={number}; "
                    f"ordered title reference: {track.get('spotifyUrl', '')}; "
                    "printed-year evidence: not available"
                ),
                "non_authoritative_bopster_year": "" if bopster_year is None else bopster_year,
                "non_authoritative_musicbrainz_year": "" if mb_year is None else mb_year,
                "screening_flags": ";".join(flags) if flags else "none",
            }
        )

    ledger_fields = [
        "card_id",
        "qr_identity",
        "candidate_uk_qr_url",
        "candidate_au_qr_url",
        "current_mapped_year",
        "authoritative_observed_year",
        "year_verification_confidence",
        "physical_print_observed",
        "discrepancy_status",
        "official_uk_sku",
        "official_uk_spotify_track_id",
        "official_au_sku",
        "official_au_spotify_track_id",
        "playlist_spotify_track_id",
        "playlist_title",
        "playlist_artist",
        "identity_confidence",
        "source_evidence",
        "non_authoritative_bopster_year",
        "non_authoritative_musicbrainz_year",
        "screening_flags",
    ]
    write_csv(LEDGER, ledger_fields, ledger_rows)

    capture_rows = [
        {
            "card_id": card_id,
            "expected_card_number": f"{card_id:05d}",
            "candidate_uk_qr_url": f"https://hitstergame.com/uk/{UK_SKU}/{card_id:05d}",
            "candidate_au_qr_url": f"https://hitstergame.com/au/{AU_SKU}/{card_id:05d}",
            "observed_qr_payload": "",
            "printed_year": "",
            "edition_sku": "",
            "box_article_or_ean": "",
            "photo_qr": "",
            "photo_year": "",
            "observer": "",
            "observed_at": "",
            "second_checker": "",
            "notes": "",
        }
        for card_id in EXPECTED_IDS
    ]
    write_csv(CAPTURE_TEMPLATE, list(capture_rows[0]), capture_rows)

    cases = parser_cases()
    write_csv(PARSER_CASES, list(cases[0]), cases)
    if not all(row["passes_exact_port"] for row in cases):
        raise RuntimeError("One or more QR parser cases did not match the expected engine behavior")

    current_counts = Counter(current_years)
    missing_years = [
        year for year in range(min(current_years), max(current_years) + 1) if year not in current_counts
    ]
    repeated_years = {year: count for year, count in current_counts.items() if count > 1}
    screening_union = sorted(set(bopster_diffs) | set(mb_diffs) | set(mb_unresolved))
    current_payload = json.dumps(year_map, separators=(",", ":")).encode("utf-8")

    proposal = {
        "generatedAt": now_iso(),
        "status": "withheld_missing_physical_card_back_authority",
        "safeToApplyAutomatically": False,
        "discrepancyComparisonPossible": False,
        "reason": (
            "No source found records the printed year for each of the 308 physical cards. "
            "The public HITSTER production database verifies card identity only and its "
            "card schema contains CardNumber and Spotify, not year."
        ),
        "yearMap": None,
        "authoritativeObservedYearCount": 0,
        "unresolvedCardIds": EXPECTED_IDS,
        "confirmedYearDiscrepancyCardIds": [],
        "confirmedYearDiscrepancyInterpretation": (
            "Empty because no authoritative printed-year comparison is possible, not because "
            "the current map has been proven correct."
        ),
        "currentMapBaselineSha256": hashlib.sha256(current_payload).hexdigest(),
        "verifiedIdentity": {
            "ukSku": UK_SKU,
            "australiaSku": AU_SKU,
            "cardCountEach": 308,
            "source": GAMES_DB_URL,
            "sourceSnapshot": str(OFFICIAL_SNAPSHOT.relative_to(ROOT)).replace("\\", "/"),
        },
        "nonAuthoritativeScreening": {
            "bopsterYearDiffCount": len(bopster_diffs),
            "bopsterYearDiffCardIds": bopster_diffs,
            "musicBrainzYearDiffCount": len(mb_diffs),
            "musicBrainzYearDiffCardIds": mb_diffs,
            "musicBrainzUnresolvedCount": len(mb_unresolved),
            "musicBrainzUnresolvedCardIds": mb_unresolved,
            "priorityCaptureUnionCount": len(screening_union),
            "priorityCaptureUnionCardIds": screening_union,
            "warning": (
                "These are triage flags only. Reissue dates, provider matching errors, and "
                "community corrections make them unsuitable as printed-year authority."
            ),
        },
    }
    write_json(PROPOSED, proposal)

    parser_table = ["| Input | Result | Observation |", "|---|---:|---|"]
    for row in cases:
        escaped = str(row["input"]).replace("|", "\\|")
        parser_table.append(f"| `{escaped}` | {row['actual_result']} | {row['observation']} |")

    report = f"""# Physical-card YEAR_MAP verification audit

Generated: {now_iso()}

## Outcome

The 308 card identities are independently verified, but the 308 printed years are **not**. The live HITSTER production database contains exactly 308 contiguous, unique card numbers for UK SKU `{UK_SKU}` and Australian SKU `{AU_SKU}`. Its only per-card fields are `CardNumber` and `Spotify`; it does not contain the printed year.

Accordingly, the ledger contains 308 rows but leaves `authoritative_observed_year` blank on every row. The proposed map is withheld (`yearMap: null`, `safeToApplyAutomatically: false`). No metadata-derived year has been promoted to a physical-card fact.

## What is independently established

- The official UK product is article `1110100132`, EAN `8710126001325`, and contains 308 cards: {OFFICIAL_PRODUCT_URL}
- HITSTER's UK FAQ links the ordered Original playlist and describes songs spanning 1908-2021: {OFFICIAL_FAQ_URL}
- The rules define the printed year as the year the song was released or performed publicly by that artist in its original form: {OFFICIAL_RULES_URL}
- The live production gameset database has 308 cards for `{UK_SKU}` and 308 for `{AU_SKU}`, with IDs exactly `00001`..`00308`: {GAMES_DB_URL}
- UK versus the ordered playlist snapshot: 307 exact Spotify-ID matches plus one same-title track relink at card `00166` (`Girl, You'll Be A Woman Soon`).
- UK versus Australia: 301 exact Spotify-ID matches. The seven alternate IDs at {ids_text([row['cardId'] for row in equivalent_rows])} resolve through Spotify oEmbed to equivalent titles/versions of the same songs.

This establishes the card-number-to-song identity sequence. It does **not** establish the year printed on either physical edition.

## Repository provenance

- Initial commit `6c6e39deb3ac8d1c391f639f49a4432d1d10a64e` explicitly calls the table an assumed prototype and says it had not been verified card-by-card against the physical backs.
- The exact sequence first appears in `f864ee5417076bfeb0001777faeea812d640fe14` in `index.html`.
- Commit `c590b535f670d492ce1a7e5b6fc593f1bda66468` copies it to `engine.js`. Later tests and catalogue scripts consume that array and therefore are not independent evidence.
- No repository history or asset contains a card-back photograph, scan export, printed-year spreadsheet, or manufacturer card-year table.

## Year verification state and discrepancies

| Measure | Result |
|---|---:|
| Ledger rows | 308 |
| Authoritative card identities observed | 308 |
| Authoritative printed years observed | 0 |
| Printed-year rows unresolved | 308 |
| Confirmed current-map vs printed-year discrepancies | not computable |

`confirmedYearDiscrepancyCardIds` is empty only because a printed-year comparison cannot be made. It must not be interpreted as proof that the current map matches the deck.

Two non-authoritative sources were retained only as capture-priority signals:

- Bopster's community/imported displayed year differs from the current map on {len(bopster_diffs)} cards: {ids_text(bopster_diffs)}.
- The MusicBrainz recording search candidate differs on {len(mb_diffs)} cards and failed to resolve {len(mb_unresolved)} cards. Differing IDs: {ids_text(mb_diffs)}. Unresolved IDs: {ids_text(mb_unresolved)}.
- The union contains {len(screening_union)} cards: {ids_text(screening_union)}.

These are **candidate conflicts, not discrepancies**. The public data visibly contains reissues/remasters and false recording matches. The full per-card flags are in the ledger.

## Structural audit

- Expected and live IDs: 1..308, exactly 308 unique and contiguous.
- Missing IDs: none.
- Duplicate IDs: none.
- Out-of-range IDs: none.
- UK live Spotify identities: 308 unique.
- Australian live Spotify identities: 308 unique.
- Current `YEAR_MAP`: 308 non-null entries, range {min(current_years)}..{max(current_years)}.
- Missing years inside the current map's range: {missing_years if missing_years else 'none'}.
- Years used more than once: {len(repeated_years)}; this is expected distribution, not duplicate cards.
- Important range warning: the current map bottoms out at {min(current_years)} and includes {max(current_years)}, while the current UK FAQ describes the game as spanning 1908-2021. This is a reason to demand card-back evidence, not enough evidence to assign replacement years.

### Current YEAR_MAP counts by year

{counts_table(current_counts)}

## QR parsing edge cases

The parser tests below port the exact regular expression and range check from `engine.js`. Exact-port failures: 0.

{chr(10).join(parser_table)}

The parser extracts only the trailing five-digit number. It ignores host, locale, and deck SKU, so other UK expansions, foreign editions, or arbitrary URLs ending in the same ID silently collide with the UK/Australian Original map. The resolver identity is therefore the tuple `(host, locale, deck SKU, card number)`, not the card number alone; the exact physical QR payload remains to be captured. No gameplay code was changed in this audit.

The public resolver implementation that exposed the production database and QR shape is: {RESOLVER_SOURCE_URL}

## Missing authority and capture/import protocol

The missing source is a one-to-one observation of the printed side and QR payload for Harry's exact physical edition. The box article/EAN and the QR deck SKU must be captured because card numbers repeat across editions.

1. Photograph the box article/EAN and one representative card on both sides. Confirm whether the QR contains UK SKU `{UK_SKU}`, Australian SKU `{AU_SKU}`, or something else.
2. Use `physical_card_capture_template.csv`; it already has all 308 expected card numbers and candidate UK/AU URL shapes. The locale portion is inferred from the public resolver, so record the physical QR payload verbatim rather than accepting the prefilled candidate as proof.
3. Work in batches of 25. For each card, scan the raw QR payload and photograph the year side without changing card order.
4. Best evidence is one frame showing the decoded QR payload and the printed-year side. If that is awkward, use paired files such as `00001_qr.jpg` and `00001_year.jpg`; never rely on capture order alone.
5. Populate `observed_qr_payload`, `printed_year`, `edition_sku`, `box_article_or_ean`, `photo_qr`, `photo_year`, `observer`, and `observed_at`.
6. Fast alternative: export QR scans as timestamped CSV, preserve deck order, then make one continuous video flipping each card while reading the printed year. Reconcile timestamps before import.
7. Acceptance gate: exactly 308 unique IDs, no missing/out-of-range IDs, every row linked to visual evidence, and a second-person review of all candidate-conflict rows plus at least 10% of apparent matches.

## Artifacts

- `card_year_verification_ledger.csv`: 308-row evidence ledger; authoritative years are intentionally blank.
- `proposed_year_map.json`: machine-readable withholding decision; no unsafe map is proposed.
- `physical_card_capture_template.csv`: prefilled 308-row import template.
- `qr_parser_edge_cases.csv`: exact parser behavior and collision cases.
- `sources/official_hitster_gamesets_uk_au.json`: extracted production identity snapshot with source hash.
- `sources/official_uk_playlist.json`: ordered title/artist reference; direct official embed for rows 1..100 and community import for rows 101..308.
- `sources/musicbrainz_release_years.json`: non-authoritative screening data only.

The official playlist is {OFFICIAL_PLAYLIST_URL}. The community list used to recover the currently hidden tail is {BOPSTER_URL}. Spotify's current public API restrictions prevent retrieving all tracks from another user's playlist, which is why the live HITSTER gameset database is the stronger identity source.
"""
    REPORT.write_text(report, encoding="utf-8")

    print(f"wrote {LEDGER} ({len(ledger_rows)} rows)")
    print(f"wrote {PROPOSED} (yearMap withheld)")
    print(f"wrote {CAPTURE_TEMPLATE} ({len(capture_rows)} rows)")
    print(f"wrote {PARSER_CASES} ({len(cases)} cases)")
    print(f"wrote {OFFICIAL_SNAPSHOT}")
    print(f"wrote {REPORT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
