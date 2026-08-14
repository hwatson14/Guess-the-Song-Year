# Song Universe Audit — 2026-08-14

## Decision

Do **not** switch runtime song selection yet.

The correct architecture is now:

`canonical song universe -> year/source/playlist overlays -> deck policy -> random selection`

not:

`physical card -> card year -> search/find a song from that year`.

The existing `data/catalogue.json` remains the active runtime input while the new universe is verified.

## What this pass found

### 1. The checked-in runtime catalogue is internally out of sync

On `main`, `data/catalogue.json` currently declares version **6**, while `scripts/validate_catalogue.py` and the Pages deployment workflow require version **10**.

That means the repository has accumulated builder/validator changes without a matching regenerated runtime catalogue. This migration branch does not paper over that mismatch.

### 2. The existing year-bucket model creates identity duplicates

The current catalogue contains duplicate/alias examples such as:

- `Vaya con Dios` / `Vaya Con Dios (May God Be With You)` — Les Paul & Mary Ford
- `Rock Around the Clock` — Bill Haley / Bill Haley and His Comets
- `All Shook Up` / `All Shook Up, Take 10 (master)` — Elvis Presley
- `Tossin' and Turnin'` / `Tossin' & Turnin'` — Bobby Lewis

A canonical universe needs one stable underlying-song key before any year or playlist assignment.

### 3. Our first 1,000-song pass still let year coverage drive selection

The first generated master used exact era quotas. That was still the old architecture in disguise.

This pass removes exact era quotas. Historical canon and higher-confidence game songs can be inclusion locks, but the master is otherwise popularity-first. Year balancing belongs in a deck policy, not the canonical song table.

### 4. Year metadata needs provenance, not silent correction

Concrete failure modes observed in the first pass:

- `Imagine` inherited a 1975 UK chart appearance until a 1971 Spotify underlying-recording match was recovered.
- `Black Betty` by Ram Jam encountered a bad 1970 Spotify metadata row; chart evidence and stronger recording rows point later.
- `She Loves You`, `Hey Jude`, `Rock DJ`, `Boulevard of Broken Dreams` and others show later Spotify compilation/reissue dates than their earlier chart evidence.
- alias/version titles can cause the same underlying recording to appear twice if identity is built from raw title + artist strings.

The new data model stores the chosen year **plus its source, confidence and review flags**.

## Provisional universe V1

| Metric | Result |
|---|---:|
| Songs | 1000 |
| Unique canonical keys | 1000 |
| Spotify IDs | 911 |
| Need year review | 144 |
| High-confidence years | 124 |
| Medium-confidence years | 789 |
| Proxy years | 79 |
| Low-confidence years | 8 |
| Max songs / primary artist | 6 |
| Rolling Stone top-200 represented | 167 |
| Hitster tier A/B represented | 124 |

### Era distribution

| Era | Songs |
|---|---:|
| 1960s | 91 |
| 1970s | 60 |
| 1980s | 72 |
| 1990s | 192 |
| 2000s | 226 |
| 2010s | 258 |
| 2020s | 69 |
| Pre-1960 | 32 |

This distribution is an **output**, not a quota.

## Source coverage

| Source | Songs |
|---|---:|
| UK | 919 |
| ARIA | 787 |
| HITSTER | 231 |
| RS500 | 194 |
| JJJ | 70 |

Source counts are evidence overlays, not independent song lists.

## New files

- `data/song-universe.csv` — provisional 1,000-song canonical source table; deliberately diffable in GitHub.
- `data/song-universe-manifest.json` — selection policy, status and summary metrics.
- `scripts/validate_song_universe.py` — identity/year-review/artist-cap validation.
- `.github/workflows/song-universe-validate.yml` — branch/PR validation for the new layer.

## Deliberate non-changes

This pass does **not**:

- change `engine.js`, `engine-v7.js` or `app.js`;
- replace `data/catalogue.json`;
- change physical-card behaviour;
- claim the 1,000 songs are fully release-year verified;
- enable themed playlists in the UI.

That keeps the working runtime isolated from catalogue migration risk.

## Next pass

1. Use the existing MusicBrainz recording-year method to verify the **144 review-flagged songs**, starting with the 87 Proxy/Low rows and large evidence conflicts.
2. Resolve the **89 songs without a Spotify playback ID**.
3. Import real playlist memberships as a separate many-to-many overlay keyed by `song.id` / `canonicalKey`.
4. Generate deck policies from the universe:
   - Greatest Hits
   - Australian
   - 80s / 90s / 2000s
   - Road Trip
   - Party / Singalong
   - Unexpected Years
5. Only then switch runtime selection from year buckets to deck-filtered universe selection.

## Migration invariant

**Song identity is primary. Year, playlist, source and deck membership are attributes.**

No future builder should create duplicate song records merely because the same song appears in multiple playlists, charts or card years.
